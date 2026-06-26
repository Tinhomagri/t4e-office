import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { generateAvatarSheet } from "./avatarRenderer"
import type { AvatarConfig } from "./avatar.types"

const CLOTH_LABELS = ["Azul","Verde","Laranja","Roxo","Rosa","Cinza"]
const HAIR_LABELS = ["Liso curto","Liso longo","Cacheado","Careca"]
const ACCESSORY_LABELS = ["Nenhum","Óculos","Fone"]
const SKIN_COLORS = ["#FDBCB4","#EEA984","#C68642","#8D5524","#4A2912"]
const CLOTH_COLORS = ["#2f6df0","#22c55e","#f97316","#7c3aed","#ec4899","#6b7280"]

export function AvatarCustomizer() {
  const navigate = useNavigate()
  const previewRef = useRef<HTMLCanvasElement>(null)
  const [cfg, setCfg] = useState<Omit<AvatarConfig, "configured">>({
    skin: 0, cloth: 0, hair: 0, accessory: 0,
  })

  // Atualiza preview quando cfg muda
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    const sheet = generateAvatarSheet({ ...cfg, configured: true })
    const ctx = canvas.getContext("2d")!
    ctx.clearRect(0, 0, 64, 96)
    // Exibe frame idle facing down (frame 0 do sheet)
    ctx.drawImage(sheet, 0, 0, 32, 48, 16, 24, 32, 48)
  }, [cfg])

  const mutation = useMutation({
    mutationFn: (data: Omit<AvatarConfig, "configured">) =>
      api.patch("/office/avatar/", data).then((r) => r.data),
    onSuccess: () => navigate("/office"),
  })

  function update(key: keyof typeof cfg, val: number) {
    setCfg((prev) => ({ ...prev, [key]: val }))
  }

  return (
    <div className="min-h-screen bg-[#eef1f4] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full flex flex-col gap-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="bg-[#1a1a1a] text-white font-black text-xs px-2 py-1 rounded-md">T4E</div>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Crie seu boneco</h1>
          <p className="text-sm text-gray-500">Como você vai aparecer no escritório</p>
        </div>

        {/* Preview */}
        <div className="flex justify-center">
          <div className="w-16 h-24 bg-[#f4f6f8] rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-200">
            <canvas
              ref={previewRef}
              width={64}
              height={96}
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </div>

        {/* Cor de pele */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 block">Cor de pele</label>
          <div className="flex gap-2">
            {SKIN_COLORS.map((color, i) => (
              <button
                key={i}
                onClick={() => update("skin", i)}
                className={`w-8 h-8 rounded-full border-2 transition ${cfg.skin === i ? "border-blue-500 scale-110" : "border-transparent"}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Cor de roupa */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 block">Roupa</label>
          <div className="flex gap-2 flex-wrap">
            {CLOTH_COLORS.map((color, i) => (
              <button
                key={i}
                onClick={() => update("cloth", i)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition ${cfg.cloth === i ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
              >
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: color }} />
                {CLOTH_LABELS[i]}
              </button>
            ))}
          </div>
        </div>

        {/* Cabelo */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 block">Cabelo</label>
          <div className="grid grid-cols-2 gap-2">
            {HAIR_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => update("hair", i)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border-2 transition ${cfg.hair === i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
              >
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
                onClick={() => update("accessory", i)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border-2 transition flex-1 ${cfg.accessory === i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => mutation.mutate(cfg)}
          disabled={mutation.isPending}
          className="w-full bg-[#1a1a1a] text-white font-bold py-3 rounded-2xl text-sm hover:bg-gray-800 transition disabled:opacity-50"
        >
          {mutation.isPending ? "Entrando…" : "Entrar no escritório →"}
        </button>
      </div>
    </div>
  )
}
