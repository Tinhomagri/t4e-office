// Board público: link sem login, só o quadro — nada mais do app (sem menu,
// sem outras telas). Read-only, com uma exceção: criar card novo quando o
// projeto libera. Nunca altera o que já existe.
//
// Código de acesso (quando configurado) é um portão único, na entrada: pede
// ANTES de mostrar qualquer coluna/card, e só na primeira vez — validado,
// fica guardado no navegador (localStorage) e nunca mais pede de novo neste
// dispositivo. Não é mais sobre liberar o mural; é sobre liberar o board.
import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import axios from "axios"
import { ChevronsRight, Image as ImageIcon, Lock, MessageSquare, Paperclip, Plus, Send, X } from "lucide-react"

import {
  useCreatePublicCard,
  useCreatePublicMessage,
  usePublicBoard,
  usePublicMessages,
} from "./publicBoard.hooks"
import type { PublicCard, PublicColumn } from "./publicBoard.api"

function accessCodeStorageKey(token: string) {
  return `public-board-access-${token}`
}

export function PublicBoardPage() {
  const { token } = useParams<{ token: string }>()
  const [code, setCode] = useState(() => (token ? localStorage.getItem(accessCodeStorageKey(token)) ?? "" : ""))

  const { data: board, isLoading, isError, error } = usePublicBoard(token, code || undefined)

  const codeRequired = axios.isAxiosError(error) && error.response?.status === 401

  // Só grava o código no navegador depois que ele de fato abriu o board —
  // senão um código errado ficaria "lembrado" e travaria o próximo acesso.
  useEffect(() => {
    if (board && token && code) {
      localStorage.setItem(accessCodeStorageKey(token), code)
    }
  }, [board, token, code])

  if (isLoading) {
    return (
      <Shell>
        <div className="grid flex-1 place-items-center text-sm text-white/50">Carregando…</div>
      </Shell>
    )
  }

  if (codeRequired) {
    return (
      <Shell>
        <AccessGate
          hadStoredCode={!!code}
          onSubmit={(c) => {
            if (token) localStorage.removeItem(accessCodeStorageKey(token))
            setCode(c)
          }}
        />
      </Shell>
    )
  }

  if (isError || !board) {
    return (
      <Shell>
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <p className="text-lg font-semibold text-white">Link não encontrado</p>
            <p className="mt-1 text-sm text-white/50">Confira se o endereço está certo, ou peça um novo link.</p>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <PublicBoardPageBody token={token!} code={code || undefined} board={board} />
  )
}

function PublicBoardPageBody({
  token,
  code,
  board,
}: {
  token: string
  code: string | undefined
  board: NonNullable<ReturnType<typeof usePublicBoard>["data"]>
}) {
  const [openCard, setOpenCard] = useState<PublicCard | null>(null)

  return (
    <Shell title={board.project.name} subtitle={board.project.key}>
      <div className="flex flex-1 overflow-hidden">
        <div className="scrollbar-slim-dark flex flex-1 gap-3 overflow-x-auto p-4">
          {board.columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              cards={board.cards.filter((c) => c.status === col.slug)}
              allowCreate={board.allow_create}
              token={token}
              code={code}
              onOpenCard={setOpenCard}
            />
          ))}
        </div>

        <Mural token={token} code={code} />
      </div>

      {openCard && <CardDetail card={openCard} onClose={() => setOpenCard(null)} />}
    </Shell>
  )
}

function AccessGate({
  hadStoredCode,
  onSubmit,
}: {
  hadStoredCode: boolean
  onSubmit: (code: string) => void
}) {
  const [input, setInput] = useState("")

  return (
    <div className="grid flex-1 place-items-center px-4">
      <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <div className="mx-auto grid size-10 place-items-center rounded-full bg-white/5 text-white/50">
          <Lock className="size-4" />
        </div>
        <p className="mt-3 text-sm font-medium text-white">Este board pede um código</p>
        <p className="mt-1 text-xs text-white/40">
          {hadStoredCode
            ? "O código salvo não é mais válido. Peça o código atualizado."
            : "Peça o código pra quem compartilhou este link."}
        </p>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && input.trim() && onSubmit(input.trim())}
          placeholder="Código de acesso"
          className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-sm uppercase tracking-widest text-white outline-none focus:border-brand-400"
        />
        <button
          onClick={() => input.trim() && onSubmit(input.trim())}
          disabled={!input.trim()}
          className="mt-3 w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Entrar
        </button>
      </div>
    </div>
  )
}

function nameStorageKey(token: string) {
  return `public-board-mural-name-${token}`
}

function Mural({ token, code }: { token: string; code: string | undefined }) {
  const [collapsed, setCollapsed] = useState(false)
  const [authorName, setAuthorName] = useState(() => localStorage.getItem(nameStorageKey(token)) ?? "")
  const [nameInput, setNameInput] = useState("")
  const [body, setBody] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: messages } = usePublicMessages(token, true, code)
  const create = useCreatePublicMessage(token, code)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages?.length])

  const send = async () => {
    const t = body.trim()
    if (!t || !authorName) return
    await create.mutateAsync({ author_name: authorName, body: t })
    setBody("")
  }

  const setName = () => {
    const n = nameInput.trim()
    if (!n) return
    localStorage.setItem(nameStorageKey(token), n)
    setAuthorName(n)
    setNameInput("")
  }

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex w-11 shrink-0 flex-col items-center gap-2 border-l border-white/10 py-4 text-white/40 hover:bg-white/[0.03] hover:text-white"
      >
        <MessageSquare className="size-4" />
        <span className="text-[10px] [writing-mode:vertical-rl]">Mural</span>
      </button>
    )
  }

  return (
    <div className="flex w-[360px] shrink-0 flex-col border-l border-white/10 bg-[#0E1016]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <MessageSquare className="size-4 text-white/40" />
          Mural
        </p>
        <button onClick={() => setCollapsed(true)} className="text-white/40 hover:text-white">
          <ChevronsRight className="size-4" />
        </button>
      </div>

      <div className="scrollbar-slim-dark flex-1 space-y-2.5 overflow-y-auto p-3.5">
        {(messages ?? []).length === 0 ? (
          <p className="py-8 text-center text-xs text-white/30">Nenhuma mensagem ainda.</p>
        ) : (
          (messages ?? []).map((m) => (
            <div key={m.id} className={m.from_team ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] ${
                  m.from_team ? "bg-brand-600 text-white" : "bg-white/[0.06] text-white/90"
                }`}
              >
                <p className="mb-0.5 text-[10px] font-medium opacity-60">
                  {m.author_name || (m.from_team ? "Time" : "Você")}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {!authorName ? (
        <div className="space-y-2 border-t border-white/10 p-3.5">
          <p className="text-[11px] text-white/40">Diga seu nome pra poder escrever no mural</p>
          <div className="flex gap-1.5">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setName()}
              placeholder="Seu nome"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-brand-400"
            />
            <button
              onClick={setName}
              disabled={!nameInput.trim()}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
            >
              Entrar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 border-t border-white/10 p-3.5">
          <p className="text-[11px] text-white/40">Enviando como <span className="text-white/70">{authorName}</span></p>
          <div className="flex gap-1.5">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Escrever mensagem…"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-brand-400"
            />
            <button
              onClick={send}
              disabled={!body.trim() || create.isPending}
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white disabled:opacity-40"
            >
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen flex-col bg-[#0B0D12] text-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#11141B] px-5 py-3.5">
        <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          T4
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{title ?? "Board público"}</p>
          {subtitle && (
            <p className="flex items-center gap-1.5 text-xs text-white/40">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {subtitle} · acompanhamento ao vivo
            </p>
          )}
        </div>
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}

function Column({
  column,
  cards,
  allowCreate,
  token,
  code,
  onOpenCard,
}: {
  column: PublicColumn
  cards: PublicCard[]
  allowCreate: boolean
  token: string
  code: string | undefined
  onOpenCard: (c: PublicCard) => void
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const create = useCreatePublicCard(token, code)

  const pickImage = (file: File | undefined) => {
    if (!file) return
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImage(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const reset = () => {
    setTitle("")
    setDescription("")
    clearImage()
    setAdding(false)
  }

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    await create.mutateAsync({
      title: t,
      description: description.trim() || undefined,
      status: column.slug,
      image: image ?? undefined,
    })
    reset()
  }

  return (
    <div className="flex w-[280px] shrink-0 flex-col rounded-2xl border border-white/[0.06] bg-white/[0.03]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3.5 py-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-white/90">
          <span
            className="size-2 rounded-full shadow-[0_0_6px_currentColor]"
            style={{ backgroundColor: column.color || "#6b7280", color: column.color || "#6b7280" }}
          />
          {column.name}
        </div>
        <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[11px] text-white/40">
          {cards.length}
        </span>
      </div>

      <div className="scrollbar-slim-dark flex-1 space-y-1.5 overflow-y-auto p-2">
        {cards.length === 0 ? (
          <p className="px-1.5 py-3 text-center text-xs text-white/25">Nenhum card aqui</p>
        ) : (
          cards.map((card) => (
            <button
              key={card.id}
              onClick={() => onOpenCard(card)}
              className="w-full rounded-xl border border-white/[0.05] bg-white/[0.04] p-3 text-left shadow-sm transition-all hover:border-white/10 hover:bg-white/[0.08]"
            >
              <p className="text-[13px] font-medium leading-snug text-white/95">{card.title}</p>
              <div className="mt-2.5 flex items-center justify-between">
                <span className="font-mono text-[11px] text-white/30">{card.ref}</span>
                {card.assignee_name && (
                  <span className="grid size-5 place-items-center rounded-full bg-white/10 text-[9px] font-semibold text-white/70">
                    {card.assignee_name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {allowCreate && (
        <div className="border-t border-white/[0.06] p-2">
          {adding ? (
            <div className="space-y-1.5">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") reset()
                }}
                placeholder="Título do card"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-brand-400"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") reset()
                }}
                placeholder="Descreva o que precisa ser feito…"
                rows={3}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-brand-400"
              />

              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt=""
                    className="max-h-28 w-full rounded-lg border border-white/10 object-cover"
                  />
                  <button
                    onClick={clearImage}
                    className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-black/60 text-white/80 hover:text-white"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 py-1.5 text-[12px] text-white/40 transition-colors hover:border-white/30 hover:text-white/70"
                >
                  <ImageIcon className="size-3.5" /> Anexar imagem
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => pickImage(e.target.files?.[0])}
                className="hidden"
              />

              <div className="flex gap-1.5">
                <button
                  onClick={submit}
                  disabled={!title.trim() || create.isPending}
                  className="flex-1 rounded-lg bg-brand-600 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-40"
                >
                  {create.isPending ? "Enviando…" : "Criar"}
                </button>
                <button
                  onClick={reset}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] text-white/50 hover:bg-white/10"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            >
              <Plus className="size-3.5" /> Criar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CardDetail({ card, onClose }: { card: PublicCard; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="scrollbar-slim-dark relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-white/10 bg-[#13161D] p-6 text-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
        <span className="font-mono text-xs text-white/40">{card.ref}</span>
        <h2 className="mt-1 text-lg font-semibold leading-snug">{card.title}</h2>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/50">
          {card.assignee_name && <span>Responsável: {card.assignee_name}</span>}
          {card.points != null && <span>{card.points} pts</span>}
          {card.due_date && <span>Prazo: {card.due_date}</span>}
        </div>

        {card.description && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
            {card.description}
          </p>
        )}

        {card.attachments.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">
              <Paperclip className="size-3.5" /> Anexos
            </p>
            <div className="grid grid-cols-2 gap-2">
              {card.attachments.map((a) => (
                <a
                  key={a.id}
                  href={a.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-white/10 hover:border-white/30"
                >
                  {a.mime_type.startsWith("image/") && a.url ? (
                    <img src={a.url} alt={a.filename} className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center bg-white/5 px-2 text-center text-[11px] text-white/50">
                      {a.filename}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
            Comentários
          </p>
          {card.comments.length === 0 ? (
            <p className="text-sm text-white/40">Nenhum comentário ainda.</p>
          ) : (
            <div className="space-y-3">
              {card.comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-white/5 p-2.5">
                  <p className="text-xs font-medium text-white/70">{c.author_name}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-white/80">{c.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
