// Preview de como o post fica em cada rede social. Não é pixel-perfect: é uma
// aproximação fiel do "chrome" de cada plataforma (header, mídia, legenda,
// menções) para o time de marketing conferir antes de agendar/publicar.
import { Bookmark, Heart, MessageCircle, Repeat2, Send, Share, ThumbsUp } from "lucide-react"

// Limite de caracteres por rede (aviso quando estoura).
export const CHANNEL_LIMIT: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  x: 280,
  tiktok: 2200,
  youtube: 5000,
}

export interface PreviewData {
  channel: string
  accountName: string
  content: string
  mediaUrls: string[]
  mentions: string[]
}

function isVideo(url: string): boolean {
  return url.toLowerCase().split("?")[0].match(/\.(mp4|mov|m4v|webm)$/) != null
}

function Media({ url, className = "" }: { url: string; className?: string }) {
  if (!url) return null
  if (isVideo(url)) {
    return (
      <video src={url} muted loop playsInline className={`bg-black object-cover ${className}`} />
    )
  }
  return (
    <img
      src={url}
      alt=""
      className={`bg-paper-100 dark:bg-ink-800 object-cover ${className}`}
      onError={(e) => {
        ;(e.target as HTMLImageElement).style.opacity = "0.3"
      }}
    />
  )
}

// Renderiza o texto com @menções destacadas.
function RichText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/(@[\w.]+)/g)
  return (
    <span className={className} style={{ whiteSpace: "pre-wrap" }}>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="font-semibold text-brand-600">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  )
}

function withMentions(content: string, mentions: string[]): string {
  const tags = mentions
    .map((m) => `@${m.replace(/^@/, "")}`)
    .filter((t) => !content.includes(t))
  return tags.length ? `${content}\n\n${tags.join(" ")}`.trim() : content
}

function Avatar({ name }: { name: string }) {
  const letter = (name.replace(/^@/, "")[0] || "?").toUpperCase()
  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
      {letter}
    </div>
  )
}

export function SocialPostPreview({ data }: { data: PreviewData }) {
  const { channel, accountName, mediaUrls, mentions } = data
  const text = withMentions(data.content, mentions)
  const first = mediaUrls[0] ?? ""
  const handle = accountName || "sua conta"

  // ── Instagram ──────────────────────────────────────────────────────────
  if (channel === "instagram") {
    return (
      <Frame>
        <div className="flex items-center gap-2 p-2.5">
          <Avatar name={handle} />
          <span className="text-xs font-semibold text-ink dark:text-paper">{handle}</span>
        </div>
        {first ? (
          <Media url={first} className="aspect-square w-full" />
        ) : (
          <Placeholder text="Sem mídia — Instagram exige imagem/vídeo" square />
        )}
        <div className="flex items-center gap-3 px-2.5 pt-2 text-ink dark:text-paper">
          <Heart className="size-5" />
          <MessageCircle className="size-5" />
          <Send className="size-5" />
          <Bookmark className="ml-auto size-5" />
        </div>
        <p className="px-2.5 pb-3 pt-1.5 text-xs leading-snug text-ink dark:text-paper">
          <span className="font-semibold">{handle}</span>{" "}
          <RichText text={text} />
        </p>
        {mediaUrls.length > 1 && <Dots n={Math.min(mediaUrls.length, 10)} />}
      </Frame>
    )
  }

  // ── X (Twitter) ────────────────────────────────────────────────────────
  if (channel === "x") {
    return (
      <Frame>
        <div className="flex gap-2.5 p-3">
          <Avatar name={handle} />
          <div className="min-w-0 flex-1">
            <p className="text-xs">
              <span className="font-bold text-ink dark:text-paper">{handle.replace(/^@/, "")}</span>{" "}
              <span className="text-paper-400">{handle.startsWith("@") ? handle : `@${handle}`} · agora</span>
            </p>
            <p className="mt-0.5 text-sm leading-snug text-ink dark:text-paper">
              <RichText text={text} />
            </p>
            {mediaUrls.length > 0 && (
              <div
                className={`mt-2 grid gap-0.5 overflow-hidden rounded-2xl ${mediaUrls.length > 1 ? "grid-cols-2" : ""}`}
              >
                {mediaUrls.slice(0, 4).map((u, i) => (
                  <Media key={i} url={u} className="aspect-video w-full" />
                ))}
              </div>
            )}
            <div className="mt-2 flex max-w-[220px] justify-between text-paper-400">
              <MessageCircle className="size-4" />
              <Repeat2 className="size-4" />
              <Heart className="size-4" />
              <Share className="size-4" />
            </div>
          </div>
        </div>
      </Frame>
    )
  }

  // ── LinkedIn / Facebook (layout de feed) ────────────────────────────────
  if (channel === "linkedin" || channel === "facebook") {
    return (
      <Frame>
        <div className="flex items-center gap-2 p-3">
          <Avatar name={handle} />
          <div>
            <p className="text-xs font-semibold text-ink dark:text-paper">{handle}</p>
            <p className="text-[10px] text-paper-400">
              {channel === "linkedin" ? "Publicação · agora" : "agora · 🌎"}
            </p>
          </div>
        </div>
        <p className="px-3 pb-2 text-sm leading-snug text-ink dark:text-paper">
          <RichText text={text} />
        </p>
        {first && <Media url={first} className="max-h-72 w-full" />}
        <div className="flex items-center gap-4 border-t border-paper-100 dark:border-ink-800 px-3 py-2 text-paper-400">
          <span className="inline-flex items-center gap-1 text-xs">
            <ThumbsUp className="size-4" /> Gostei
          </span>
          <span className="inline-flex items-center gap-1 text-xs">
            <MessageCircle className="size-4" /> Comentar
          </span>
          <span className="inline-flex items-center gap-1 text-xs">
            <Share className="size-4" /> Compartilhar
          </span>
        </div>
      </Frame>
    )
  }

  // ── TikTok / YouTube (vídeo vertical/horizontal) ────────────────────────
  const vertical = channel === "tiktok"
  return (
    <Frame>
      {first ? (
        <Media url={first} className={vertical ? "aspect-[9/16] w-full" : "aspect-video w-full"} />
      ) : (
        <Placeholder text={`${channel === "tiktok" ? "TikTok" : "YouTube"} exige vídeo`} />
      )}
      <div className="flex items-center gap-2 p-3">
        <Avatar name={handle} />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink dark:text-paper">{handle}</p>
          <p className="truncate text-[11px] text-paper-400">
            <RichText text={text} />
          </p>
        </div>
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-900 shadow-sm">
      {children}
    </div>
  )
}

function Placeholder({ text, square = false }: { text: string; square?: boolean }) {
  return (
    <div
      className={`grid w-full place-items-center bg-paper-100 dark:bg-ink-800 px-4 text-center text-[11px] text-paper-400 ${square ? "aspect-square" : "aspect-video"}`}
    >
      {text}
    </div>
  )
}

function Dots({ n }: { n: number }) {
  return (
    <div className="flex justify-center gap-1 pb-2">
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className={`size-1.5 rounded-full ${i === 0 ? "bg-brand-500" : "bg-paper-300 dark:bg-ink-700"}`}
        />
      ))}
    </div>
  )
}
