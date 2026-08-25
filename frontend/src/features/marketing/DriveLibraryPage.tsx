import { Download, Folder, Loader2, Search, Trash2, Upload } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  createDriveUploadSession,
  getDriveConfig,
  listDriveFiles,
  openDriveFile,
  trashDriveTake,
  uploadDriveFile,
  type DriveFile,
} from "@/features/integrations/drive.api"
import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { Badge, Button, EmptyState, Input, PageHeader } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

import { DriveConfigDialog } from "./DriveConfigDialog"

export function DriveLibraryPage() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const [library, setLibrary] = useState<"takes" | "projects">("takes")
  const [files, setFiles] = useState<DriveFile[]>([])
  const [folder, setFolder] = useState<DriveFile | null>(null)
  const [search, setSearch] = useState("")
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [canConfigure, setCanConfigure] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [configOpen, setConfigOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = async () => {
    if (!workspaceId || configured !== true) return
    setLoading(true)
    try {
      const next = await listDriveFiles(workspaceId, library, { folderId: library === "takes" ? folder?.id : undefined, search })
      setFiles(next)
    } catch {
      toast.error("Não foi possível abrir a biblioteca do Drive.")
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!workspaceId) return
    void getDriveConfig(workspaceId).then((x) => { setConfigured(x.configured); setCanConfigure(x.can_configure ?? false) }).catch(() => setConfigured(false))
  }, [workspaceId])
  useEffect(() => {
    if (configured === true) void load()
    // A busca depende do estado de configuração, mas `load` é recriada a cada
    // render; listar a função aqui causaria um loop de requisições.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, configured, library, folder?.id])

  const visible = useMemo(() => files.filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase())), [files, search])
  const selectFiles = async (selected: FileList | null) => {
    if (!selected || !workspaceId) return
    const list = Array.from(selected)
    setUploading(1)
    try {
      const day = new Date().toISOString().slice(0, 10)
      for (let index = 0; index < list.length; index += 1) {
        const file = list[index]
        const session = await createDriveUploadSession(workspaceId, library, file, library === "takes" ? day : undefined)
        await uploadDriveFile(session.upload_url, file, (pct) => setUploading(Math.round(((index + pct / 100) / list.length) * 100)))
      }
      toast.success(`${list.length} arquivo(s) enviado(s) ao Google Drive.`)
      setUploading(0); void load()
    } catch {
      setUploading(0); toast.error("Falha no upload. O envio pode ser retomado selecionando o arquivo novamente.")
    }
  }

  if (!workspaceId) return <EmptyState title="Selecione um workspace" description="A biblioteca é separada por workspace." />
  if (configured === null) return <div className="py-20 text-center text-paper-500">Verificando a configuração do Google Drive…</div>
  // A API antiga não trazia `can_configure`. Mantemos o botão de abertura
  // visível nesta tela de estado vazio para não esconder a configuração do
  // dono durante um deploy gradual; o backend continua sendo a autoridade e
  // recusa salvar/testar para admin ou membro.
  if (configured === false) return <><EmptyState title="Google Drive ainda não configurado" description="O dono do workspace precisa informar as credenciais e as duas pastas raiz." action={<Button onClick={() => setConfigOpen(true)}>Configurar Google Drive</Button>} /><DriveConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} workspaceId={workspaceId} /></>

  return <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-6">
    <PageHeader eyebrow="Marketing" title="Biblioteca de mídia" subtitle="Takes brutos e projetos prontos guardados no Google Drive.">
      {canConfigure && <Button variant="outline" onClick={() => setConfigOpen(true)}>Configurar Drive</Button>}
      <Button icon={uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} onClick={() => input.current?.click()}>{uploading ? `${uploading}% enviado` : "Enviar arquivos"}</Button>
      <input ref={input} className="hidden" type="file" multiple accept="image/*,video/*" onChange={(e) => void selectFiles(e.target.files)} />
    </PageHeader>
    <DriveConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} workspaceId={workspaceId} />
    <div className="flex w-fit rounded-lg border border-paper-200 p-1 dark:border-ink-700">
      {(["takes", "projects"] as const).map((value) => <button key={value} type="button" onClick={() => { setLibrary(value); setFolder(null) }} className={library === value ? "rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white" : "rounded-md px-3 py-1.5 text-sm text-paper-500"}>{value === "takes" ? "Takes" : "Projetos prontos"}</button>)}
    </div>
    <div className="flex gap-2"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar arquivos…" /><Button variant="outline" icon={<Search className="size-3.5" />} onClick={() => void load()}>Buscar</Button>{folder && <Button variant="ghost" onClick={() => setFolder(null)}>← Raiz</Button>}</div>
    {loading ? <div className="py-20 text-center text-paper-500">Carregando arquivos…</div> : visible.length === 0 ? <EmptyState title="Nenhum arquivo aqui" description="Envie mídia ou abra uma pasta de gravação." /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {visible.map((file) => {
        const isFolder = file.mimeType === "application/vnd.google-apps.folder"
        return <article key={file.id} className="overflow-hidden rounded-lg border border-paper-200 bg-paper dark:border-ink-700 dark:bg-ink-900">
          <div className="flex h-32 items-center justify-center bg-paper-100 dark:bg-ink-800">{isFolder ? <Folder className="size-10 text-warning" /> : <span className="text-xs text-paper-500">{file.mimeType.startsWith("video/") ? "Vídeo" : file.mimeType.startsWith("image/") ? "Imagem" : "Arquivo"}</span>}</div>
          <div className="space-y-2 p-3"><p className="truncate text-sm font-medium text-ink dark:text-paper" title={file.name}>{file.name}</p><div className="flex items-center gap-1"><Badge tone={isFolder ? "warning" : "neutral"}>{isFolder ? "Pasta" : file.mimeType.split("/")[0]}</Badge><span className="ml-auto text-[11px] text-paper-500">{file.size ? `${Math.round(Number(file.size) / 1024 / 1024)} MB` : ""}</span></div><div className="flex gap-1">{isFolder ? <Button size="sm" className="flex-1" onClick={() => setFolder(file)}>Abrir</Button> : <><Button className="flex-1" size="sm" onClick={() => void openDriveFile(workspaceId, file.id).catch(() => toast.error("Não foi possível abrir o arquivo."))}>Prévia</Button><Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => void openDriveFile(workspaceId, file.id, "download").catch(() => toast.error("Não foi possível baixar o arquivo."))} />{library === "takes" && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => void trashDriveTake(workspaceId, file.id).then(load).catch(() => toast.error("Não foi possível mover para a lixeira."))} />}</>}</div></div>
        </article>
      })}
    </div>}
  </div>
}
