// Monta o PC: painel do desktop sobre o mapa, janelas, taskbar e a camada da
// janela expandida.
//
// Duas regras que não podem ser afrouxadas:
// 1. Nenhum transform CSS em ancestral de conteúdo embutido — transform vira
//    containing block e joga os modais (position: fixed) das páginas para dentro
//    do painel em vez da viewport.
// 2. A janela expandida sai do painel e vira uma camada própria em tela cheia,
//    para trabalhar de verdade sem o aperto do painel.
// O CSS vem do componente, não de um @import no index.css: @import depois de
// outras regras é descartado em silêncio pelo PostCSS e o bundle sai sem uma
// linha do visual 98 — sem erro nenhum para avisar.
import "./win98.css"

import { appById, isEnabled } from "./apps.registry"
import { BootScreen } from "./BootScreen"
import { DesktopIcons } from "./DesktopIcons"
import { usePcStore } from "./pc.store"
import { Taskbar } from "./Taskbar"
import { Win98Window } from "./Win98Window"

export function Win98Desktop() {
  const state = usePcStore((s) => s.state)
  const windows = usePcStore((s) => s.windows)
  const expandedId = usePcStore((s) => s.expandedId)
  const ready = usePcStore((s) => s.ready)

  if (state === "off") return null
  if (state === "booting") return <BootScreen onDone={ready} />

  const expanded = windows.find((w) => w.id === expandedId) ?? null

  return (
    <>
      {/* Painel: 78% do canvas, centralizado. O escritório continua visível em volta. */}
      <div
        data-testid="win98-panel"
        className="win98 win98-raised win98-wallpaper absolute inset-[11%] flex flex-col overflow-hidden"
      >
        <div className="relative flex-1 overflow-hidden">
          <DesktopIcons />
          {windows
            .filter((w) => w.id !== expandedId)
            .map((w) => (
              <Win98Window key={w.id} win={w} title={appById(w.appId)?.label ?? w.appId}>
                <AppBody appId={w.appId} />
              </Win98Window>
            ))}
        </div>
        {/* Uma Taskbar por vez: duas montadas duplicariam "Iniciar"/"Levantar"
            no DOM e tornariam qualquer busca por rótulo ambígua. */}
        {!expanded && <Taskbar />}
      </div>

      {/* Camada expandida: fora do painel, tela cheia, sem transform. */}
      {expanded && (
        <div data-testid="win98-expanded" className="win98-wallpaper absolute inset-0 z-20 flex flex-col">
          <div className="relative flex-1 overflow-hidden">
            <Win98Window
              win={expanded}
              fullscreen
              title={appById(expanded.appId)?.label ?? expanded.appId}
            >
              <AppBody appId={expanded.appId} />
            </Win98Window>
          </div>
          <Taskbar />
        </div>
      )}
    </>
  )
}

function AppBody({ appId }: { appId: string }) {
  const app = appById(appId)
  if (!app || !isEnabled(app) || !app.component) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-[12px]">
        <p>Em breve — este app entra na próxima fatia.</p>
      </div>
    )
  }
  const Page = app.component
  return <Page />
}
