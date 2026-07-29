// Painel do host do Planning Poker — mesmo estilo Win98 do elevador
// (ElevatorPanel) e do PC (Win98Window), aberto pela zona "poker-console" do
// andar 2. Reaproveita os hooks que a PokerPage já usa: nenhuma lógica nova
// de sessão/voto, só a superfície de controle dentro do mundo 3D.
import { useState } from "react"

import { useAuthStore } from "@/features/auth/auth.store"
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

const HOST_ONLY = "Só o host da sessão pode fazer isso"

export function PokerConsolePanel() {
  const open = usePokerRoomStore((s) => s.consoleOpen)
  const close = usePokerRoomStore((s) => s.closeConsole)
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const myId = useAuthStore((s) => s.user?.id) ?? null
  const [error, setError] = useState<string | null>(null)
  const fail = (msg: string) => ({ onError: () => setError(msg) })
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
  // Mesma regra do backend (views.py: `request.user.id != session.created_by`
  // → 403) e da PokerPage: host é quem criou a sessão.
  const isHost = !!session && !!myId && session.created_by === myId

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
              onClick={() => {
                setError(null)
                createSession.mutate(undefined, {
                  onSuccess: (s) => setSessionId(s.id),
                  onError: () => setError("Não foi possível criar a sessão neste projeto."),
                })
              }}
            >
              Nova sessão
            </button>
          )}

          {session && (
            <>
              <p>Status: <b>{session.status}</b></p>
              <p>Cards na fila: {cards?.length ?? 0}</p>
              {!isHost && (
                <p className="text-[11px]">
                  Você não é o host desta sessão — os controles ficam com quem a criou.
                </p>
              )}
              <div className="flex gap-1">
                <button
                  type="button"
                  className="win98-btn flex-1"
                  disabled={!isHost || session.status !== "waiting"}
                  title={isHost ? undefined : HOST_ONLY}
                  onClick={() => {
                    setError(null)
                    updateSession.mutate(
                      { status: "voting" },
                      fail("Não foi possível iniciar a votação."),
                    )
                  }}
                >
                  Iniciar votação
                </button>
                <button
                  type="button"
                  className="win98-btn flex-1"
                  disabled={!isHost || session.status !== "voting"}
                  title={isHost ? undefined : HOST_ONLY}
                  onClick={() => {
                    setError(null)
                    updateSession.mutate(
                      { status: "revealed" },
                      fail("Não foi possível revelar os votos."),
                    )
                  }}
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
                    disabled={!isHost || !points}
                    title={isHost ? undefined : HOST_ONLY}
                    onClick={() => {
                      setError(null)
                      applyPoints.mutate(
                        Number(points),
                        fail("Não foi possível aplicar a pontuação."),
                      )
                      setPoints("")
                    }}
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="text-[11px] font-bold text-[#a00]">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
