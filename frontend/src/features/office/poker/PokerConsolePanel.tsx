// Painel do host do Planning Poker — mesmo estilo Win98 do elevador
// (ElevatorPanel) e do PC (Win98Window), aberto pela zona "poker-console" do
// andar 2. Reaproveita os hooks que a PokerPage já usa: nenhuma lógica nova
// de sessão/voto, só a superfície de controle dentro do mundo 3D.
import { useState } from "react"

import { useWorkspaceStore } from "@/features/workspace/workspace.store"
import { useProjects } from "@/features/workspace/workspace.hooks"
import {
  useProjectSessions,
  useCreateProjectSession,
  usePokerCards,
  useUpdateSession,
  useApplyPoints,
} from "@/features/poker/poker.hooks"

import { usePokerRoomStore } from "./pokerRoom.store"
import "../pc/win98.css"

export function PokerConsolePanel() {
  const open = usePokerRoomStore((s) => s.consoleOpen)
  const close = usePokerRoomStore((s) => s.closeConsole)
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: projects } = useProjects(workspaceId)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const { data: sessions } = useProjectSessions(projectId)
  const createSession = useCreateProjectSession(projectId)
  const { data: cards } = usePokerCards(sessionId)
  const updateSession = useUpdateSession(sessionId)
  const applyPoints = useApplyPoints(sessionId)
  const [points, setPoints] = useState("")

  if (!open) return null

  const session = sessions?.find((s) => s.id === sessionId) ?? null

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/50">
      <div className="win98 win98-raised w-[360px]">
        <div className="win98-titlebar win98-titlebar--active flex items-center gap-1 px-1 py-0.5">
          <span className="flex-1 truncate text-[11px]">Console — Planning Poker</span>
          <button type="button" className="win98-btn" onClick={close} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="win98-sunken m-0.5 flex flex-col gap-2 p-3 text-[12px]">
          <label className="flex flex-col gap-1">
            Projeto
            <select
              className="win98-field"
              value={projectId ?? ""}
              onChange={(e) => {
                setProjectId(e.target.value || null)
                setSessionId(null)
              }}
            >
              <option value="">Selecione…</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          {projectId && (
            <label className="flex flex-col gap-1">
              Sessão
              <select
                className="win98-field"
                value={sessionId ?? ""}
                onChange={(e) => setSessionId(e.target.value || null)}
              >
                <option value="">Selecione…</option>
                {sessions?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.status}</option>
                ))}
              </select>
            </label>
          )}

          {projectId && (
            <button
              type="button"
              className="win98-btn"
              onClick={() => createSession.mutate(undefined, { onSuccess: (s) => setSessionId(s.id) })}
            >
              Nova sessão
            </button>
          )}

          {session && (
            <>
              <p>Status: <b>{session.status}</b></p>
              <p>Cards na fila: {cards?.length ?? 0}</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="win98-btn flex-1"
                  disabled={session.status !== "waiting"}
                  onClick={() => updateSession.mutate({ status: "voting" })}
                >
                  Iniciar votação
                </button>
                <button
                  type="button"
                  className="win98-btn flex-1"
                  disabled={session.status !== "voting"}
                  onClick={() => updateSession.mutate({ status: "revealed" })}
                >
                  Revelar
                </button>
              </div>
              {session.status === "revealed" && (
                <div className="flex gap-1">
                  <input
                    className="win98-field flex-1"
                    placeholder="Pontos finais"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                  <button
                    type="button"
                    className="win98-btn"
                    disabled={!points}
                    onClick={() => {
                      applyPoints.mutate(Number(points))
                      setPoints("")
                    }}
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
