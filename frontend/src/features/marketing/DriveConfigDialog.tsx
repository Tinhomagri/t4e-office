import { ExternalLink, ShieldCheck } from "lucide-react"
import { useEffect, useState } from "react"

import {
  getDriveConfig,
  saveDriveConfig,
  testDriveConfig,
  type DriveConfigStatus,
} from "@/features/integrations/drive.api"
import { Button, Input, Modal } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"

const FIELDS = [
  ["client_id", "OAuth Client ID"],
  ["client_secret", "OAuth Client Secret"],
  ["refresh_token", "Refresh token"],
  ["takes_folder_id", "ID da pasta Takes"],
  ["projects_folder_id", "ID da pasta Projetos prontos"],
] as const

export function DriveConfigDialog({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId: string }) {
  const [status, setStatus] = useState<DriveConfigStatus | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = () => {
    if (!workspaceId) return
    void getDriveConfig(workspaceId)
      .then((next) => {
        setStatus(next)
        setDraft({})
      })
      .catch(() => toast.error("Falha ao carregar a configuração do Drive."))
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId])

  const save = async () => {
    setBusy(true)
    try {
      const next = await saveDriveConfig(workspaceId, { ...draft, is_active: status?.is_active ?? true })
      setStatus(next)
      setDraft({})
      toast.success("Configuração do Google Drive salva de forma cifrada.")
    } catch {
      toast.error("Preencha todos os campos na primeira configuração.")
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const result = await testDriveConfig(workspaceId)
      if (result.ok) toast.success(`Drive conectado: ${result.takes_folder} e ${result.projects_folder}.`)
      else toast.error(result.error ?? "Não foi possível validar o Drive.")
    } catch {
      toast.error("Não foi possível validar o Drive.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Google Drive" description="Takes e projetos prontos ficam no Drive do workspace. Os valores são cifrados e jamais voltam para o navegador.">
      <div className="space-y-3">
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-xs text-brand-800 dark:border-brand-900/60 dark:bg-brand-950/30 dark:text-brand-200">
          <ShieldCheck className="mr-1 inline size-3.5" /> Crie um OAuth Client no Google Cloud com escopo <code>drive</code>, gere um refresh token e informe os IDs das duas pastas raiz.
          <a className="ml-1 inline-flex items-center gap-0.5 underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Abrir Google Cloud <ExternalLink className="size-3" /></a>
        </div>
        {FIELDS.map(([key, label]) => {
          const hint = status?.hints[key] ?? ""
          return <Input key={key} type="password" value={draft[key] ?? ""} onChange={(e) => setDraft((previous) => ({ ...previous, [key]: e.target.value }))} placeholder={hint ? `${label} salvo (${hint}) — deixe vazio para manter` : label} />
        })}
        <p className="text-[11px] text-paper-500">O segredo mestre de cifragem continua no ambiente seguro do servidor; ele não é uma chave de integração e nunca é exibido.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" loading={busy} disabled={!status?.configured} onClick={() => void test()}>Testar conexão</Button>
          <Button loading={busy} onClick={() => void save()}>Salvar com segurança</Button>
        </div>
      </div>
    </Modal>
  )
}
