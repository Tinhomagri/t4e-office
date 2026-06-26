// src/features/avatar/AvatarCustomizer.tsx
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { api } from "@/shared/api/client"
import { CHAR_NAMES, CHAR_TINTS } from "./avatarRenderer"

const CHAR_LABELS = ["Player", "Aventureiro", "Feminino", "Soldado", "Zumbi"]
const TINT_LABELS = ["Padrão", "Azul", "Verde", "Laranja", "Roxo", "Rosa"]
const TINT_PREVIEW = ["#ffffff", "#88bbff", "#88ffaa", "#ffaa66", "#cc88ff", "#ff88bb"]

// CSS para mostrar apenas o primeiro frame (80×110) do tilesheet (720×330)
// usando background-position para cortar o idle frame (col 0, row 0)
function CharPreview({ skin, cloth }: { skin: number; cloth: number }) {
  const name = CHAR_NAMES[skin]
  const hueRotate = [0, 200, 100, 30, 270, 320][cloth]
  return (
    <div className="relative w-20 h-28 flex items-center justify-center">
      <div
        className="w-full h-full"
        style={{
          backgroundImage: `url(/assets/characters/${name}_tilesheet.png)`,
          backgroundSize: `${9 * 100}% ${3 * 100}%`, // 9 cols, 3 rows
          backgroundPosition: '0% 0%', // primeiro frame
          imageRendering: 'pixelated',
          filter: cloth === 0 ? 'none' : `sepia(1) hue-rotate(${hueRotate}deg) saturate(2)`,
        }}
      />
    </div>
  )
}

// Export CHAR_TINTS for external consumers if needed
export { CHAR_TINTS }

export function AvatarCustomizer() {
  const navigate = useNavigate()
  const [skin, setSkin] = useState(0)
  const [cloth, setCloth] = useState(0)

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

        {/* Preview */}
        <div className="flex justify-center">
          <div className="w-24 h-32 bg-[#f4f6f8] rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-200 overflow-hidden">
            <CharPreview skin={skin} cloth={cloth} />
          </div>
        </div>

        {/* Personagem */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 block">Personagem</label>
          <div className="grid grid-cols-5 gap-2">
            {CHAR_NAMES.map((name, i) => (
              <button
                key={i}
                onClick={() => setSkin(i)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition ${skin === i ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
              >
                <div
                  className="w-10 h-14"
                  style={{
                    backgroundImage: `url(/assets/characters/${name}_tilesheet.png)`,
                    backgroundSize: `${9 * 100}% ${3 * 100}%`,
                    backgroundPosition: '0% 0%',
                    imageRendering: 'pixelated',
                  }}
                />
                <span className="text-xs text-gray-600">{CHAR_LABELS[i]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cor */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-2 block">Cor</label>
          <div className="flex gap-2 flex-wrap">
            {TINT_PREVIEW.map((color, i) => (
              <button
                key={i}
                onClick={() => setCloth(i)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition ${cloth === i ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
              >
                <span className="w-3 h-3 rounded-full inline-block border border-gray-300" style={{ backgroundColor: color }} />
                {TINT_LABELS[i]}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => mutation.mutate({ skin, cloth, hair: 0, accessory: 0 })}
          disabled={mutation.isPending}
          className="w-full bg-[#1a1a1a] text-white font-bold py-3 rounded-2xl text-sm hover:bg-gray-800 transition disabled:opacity-50"
        >
          {mutation.isPending ? "Entrando…" : "Entrar no escritório →"}
        </button>
      </div>
    </div>
  )
}
