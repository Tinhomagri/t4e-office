// src/features/office/ws/officeSocket.ts
import { useAuthStore } from "@/features/auth/auth.store"
import { useOfficeStore } from "@/features/office/store/officeStore"
import type { WsMessage } from "@/features/office/office.types"

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000"

class OfficeSocket {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false

  connect() {
    const token = useAuthStore.getState().accessToken
    if (!token) return
    this.shouldReconnect = true
    this._open(token)
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  send(type: string, data: Record<string, unknown> = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }))
    }
  }

  private _open(token: string) {
    this.ws = new WebSocket(`${WS_URL}/ws/office/?token=${token}`)

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage
        useOfficeStore.getState().applyWsMessage(msg)
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => {
          const token = useAuthStore.getState().accessToken
          if (token) this._open(token)
        }, 2000)
      }
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }
}

export const officeSocket = new OfficeSocket()
