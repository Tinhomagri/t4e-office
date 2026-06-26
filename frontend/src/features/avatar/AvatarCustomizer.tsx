// src/features/avatar/AvatarCustomizer.tsx
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { TILE, compositeAvatar, getSheetAsync } from "./avatarRenderer"

const SKIN_LABELS = ["Claro", "Médio", "Escuro", "Verde"]
const SKIN_COLORS = ["#d2b28e", "#ba9570", "#8e6f45", "#3c935c"]

const CLOTH_LABELS = ["Laranja", "Teal", "Roxo", "Marrom", "Verde", "Prata"]
const CLOTH_COLORS = ["#c66f34", "#409187", "#c4afca", "#a1825d", "#89b039", "#c9c9c9"]

const HAIR_LABELS = ["Castanho", "Ruivo", "Grisalho", "Loiro"]
const HAIR_COLORS = ["#836542", "#a56519", "#c3b3aa", "#cccb96"]

const ACCESSORY_LABELS = ["Nenhum", "Óculos", "Óculos dourado"]

export function AvatarCustomizer() {
  const navigate = useNavigate()
  const previewRef = useRef<HTMLCanvasElement>(null)

  const [skin, setSkin] = useState(0)
  const [cloth, setCloth] = useState(0)
  const [hair, setHair] = useState(0)
  const [accessory, setAccessory] = useState(0)

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false
    getSheetAsync().then((img) => {
      compositeAvatar(ctx, img, skin, cloth, hair, accessory)
    })
  }, [skin, cloth, hair, accessory])

  const mutation = useMutation({
    mutationFn: (data: { skin: number; cloth: number; hair: number; accessory: number }) =>
      api.patch("/office/avatar/", data).then((r) => r.data),
    onSuccess: () => navigate("/office"),
  })

  return (
    <div className="min-h-screen bg-[#eef1f4] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full flex flex-col gap-6">

        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="bg-[#1a1a1a] text-white font-black text-xs px-2 py-1 rounded-md">T4E</div>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Escolha seu boneco</h1>
          <p className="text-sm text-gray-500">Como você vai aparecer no escritório</p>
        </div>

        {/* Preview pixel art */}
        <div className="flex justify-center">
          <canvas
            ref={previewRef}
            width={TILE}
            height={TILE}
            style={{
              width: TILE * 8,
              height: TILE * 8,
              imageRendering: "pixelated",
              borderRadius: "16px",
              background: "#eef1f4",
              border: "2px dashed #d1d5db",
            }}
          />
        </div>

        {/* Cor de pele */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 block">Cor de pele</label>
          <div className="flex gap-3">
            {SKIN_COLORS.map((color, i) => (
              <button
                key={i}
                title={SKIN_LABELS[i]}
                onClick={() => setSkin(i)}
                className={`w-9 h-9 rounded-full border-2 transition-transform ${skin === i ? "border-blue-500 scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Roupa */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 block">Roupa</label>
          <div className="flex flex-wrap gap-2">
            {CLOTH_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => setCloth(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition ${cloth === i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: CLOTH_COLORS[i] }} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Cabelo */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 block">Cabelo</label>
          <div className="flex flex-wrap gap-2">
            {HAIR_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => setHair(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition ${hair === i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: HAIR_COLORS[i] }} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Acessório */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 block">Acessório</label>
          <div className="flex gap-2">
            {ACCESSORY_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => setAccessory(i)}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border-2 transition ${accessory === i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => mutation.mutate({ skin, cloth, hair, accessory })}
          disabled={mutation.isPending}
          className="w-full bg-[#1a1a1a] text-white font-bold py-3 rounded-2xl text-sm hover:bg-gray-800 transition disabled:opacity-50"
        >
          {mutation.isPending ? "Entrando…" : "Entrar no escritório →"}
        </button>

      </div>
    </div>
  )
}
