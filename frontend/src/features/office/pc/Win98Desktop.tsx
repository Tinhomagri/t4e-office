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

import { useEffect, useMemo, useRef } from "react"
import {
  RouterProvider,
  UNSAFE_LocationContext,
  UNSAFE_RouteContext,
  createMemoryRouter,
} from "react-router-dom"

import { appRoutes } from "@/app/router"
import { AppShell } from "@/features/shell/AppShell"

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
  const setViewport = usePcStore((s) => s.setViewport)

  // A área útil do painel é o que o store usa para encaixar janelas novas.
  // Medir no componente (e não chutar no store) é o que mantém o store sem DOM.
  const deskRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = deskRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setViewport(Math.round(width), Math.round(height))
    })
    ro.observe(el)
    return () => ro.disconnect()
    // `state` nas deps: a área só existe no desktop, o ref é null durante o boot.
  }, [state, setViewport])

  if (state === "off") return null
  if (state === "booting") return <BootScreen onDone={ready} />

  const expanded = windows.find((w) => w.id === expandedId) ?? null

  return (
    <>
      {/* Painel: quase todo o canvas. As páginas embutidas são as do produto,
          feitas para viewport cheia — sobrar moldura bonita e faltar área útil
          era o que tornava o PC impossível de usar de verdade. */}
      <div
        data-testid="win98-panel"
        // z-30: acima das câmeras do Escritório (z-20) — o PC não fica aberto
        // o tempo todo, então quando abre precisa cobrir quem está por trás.
        className="win98 win98-raised win98-wallpaper absolute inset-x-[3%] inset-y-[4%] z-30 flex flex-col overflow-hidden"
      >
        <div ref={deskRef} className="relative flex-1 overflow-hidden">
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
        <div data-testid="win98-expanded" className="win98-wallpaper absolute inset-0 z-30 flex flex-col">
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

/**
 * Conteúdo de uma janela: o SISTEMA inteiro, na rota daquele app.
 *
 * Não é a página solta — é `AppShell` + as mesmas rotas do produto, num router
 * de memória. Isso é o que dá sidebar, header, seletor de workspace e navegação
 * dentro da janela: sem eles dava para ver uma tela, não para usar o sistema.
 *
 * Memória (e não o histórico do navegador) porque a URL de fora tem que
 * continuar sendo /app/office: o escritório é onde a pessoa está; a janela é
 * só uma vista para dentro do produto. Cada janela navega por conta própria.
 *
 * Estado e dados são compartilhados de graça — stores e QueryClient vivem acima
 * na árvore, então workspace, tema e cache são os mesmos de fora do PC.
 */
function AppBody({ appId }: { appId: string }) {
  const app = appById(appId)
  const route = app && isEnabled(app) ? app.route : null

  // Um router por janela, criado uma única vez: recriar a cada render jogaria
  // a navegação de volta para a rota inicial a cada teclada.
  const router = useMemo(
    () =>
      route
        ? createMemoryRouter(
            [{ path: "/app", element: <AppShell />, children: appRoutes }],
            { initialEntries: [route] },
          )
        : null,
    [route],
  )

  if (!router) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-[12px]">
        <p>Este atalho não aponta para nenhuma tela.</p>
      </div>
    )
  }
  // O escritório já roda dentro do router do navegador, e o React Router recusa
  // um <Router> dentro de outro. Zerar o LocationContext é o escape oficial
  // (`UNSAFE_` é o aviso de que é API interna, não de que é gambiarra): o
  // router de dentro passa a se ver como raiz e navega sozinho, sem tocar na
  // URL de fora. Só o contexto de rota é isolado — stores e QueryClient
  // continuam vindo de cima, que é o que mantém os dados sincronizados.
  // RouteContext também precisa zerar: sem isso o router de dentro herda as
  // rotas já casadas lá fora (/app/office) como se fossem suas ancestrais, e
  // resolve tudo para nada — janela em branco, sem erro nenhum no console.
  return (
    <UNSAFE_LocationContext.Provider value={null as never}>
      <UNSAFE_RouteContext.Provider
        value={{ outlet: null, matches: [], isDataRoute: false }}
      >
        <RouterProvider router={router} />
      </UNSAFE_RouteContext.Provider>
    </UNSAFE_LocationContext.Provider>
  )
}
