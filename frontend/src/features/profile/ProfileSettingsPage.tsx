import { motion } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import {
  Bell, Camera, Check, ChevronRight, CircleUserRound, Copy,
  KeyRound, LockKeyhole, Mail, Palette, Plus, Save,
  ShieldCheck, Sparkles, Trash2, UserRound,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { changePassword, profileImageDataUri, updateProfile } from "@/features/auth/auth.api"
import type { AuthUser, ProfileUpdatePayload } from "@/features/auth/auth.types"
import { useAuthStore } from "@/features/auth/auth.store"
import { useCreateToken, useRevokeToken, useTokens } from "@/features/tokens/tokens.hooks"
import { extractApiError } from "@/shared/api/client"
import { useThemeStore } from "@/shared/theme.store"
import { Button, Field, Input, Modal, Select, Textarea, cx } from "@/shared/ui/primitives"
import { toast } from "@/shared/ui/toast"
import type { Member } from "@/features/workspace/workspace.types"

type Section = "profile" | "preferences" | "security" | "tokens"

const sections = [
  { id: "profile" as const, label: "Perfil", description: "Identidade e apresentação", icon: CircleUserRound },
  { id: "preferences" as const, label: "Preferências", description: "Aparência e notificações", icon: Palette },
  { id: "security" as const, label: "Segurança", description: "Acesso e senha", icon: ShieldCheck },
  { id: "tokens" as const, label: "Tokens de API", description: "Acesso de integrações externas", icon: KeyRound },
]

const defaults = {
  full_name: "", job_title: "", phone: "", bio: "", location: "",
  timezone: "America/Sao_Paulo", language: "pt-BR" as const,
  theme: "system" as const, density: "comfortable" as const,
  availability: "available" as const,
  notification_preferences: { email: true, desktop: true, mentions: true, meetings: true, daily_digest: false },
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"
}

function profileFrom(user: AuthUser | null) {
  return {
    ...defaults,
    full_name: user?.full_name ?? "",
    job_title: user?.job_title ?? "",
    phone: user?.phone ?? "",
    bio: user?.bio ?? "",
    location: user?.location ?? "",
    timezone: user?.timezone ?? defaults.timezone,
    language: user?.language ?? defaults.language,
    theme: user?.theme ?? defaults.theme,
    density: user?.density ?? defaults.density,
    availability: user?.availability ?? defaults.availability,
    notification_preferences: { ...defaults.notification_preferences, ...user?.notification_preferences },
  }
}

export function ProfileSettingsPage() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const setTheme = useThemeStore((state) => state.set)
  const queryClient = useQueryClient()
  const [section, setSection] = useState<Section>("profile")
  const [form, setForm] = useState(() => profileFrom(user))
  const [avatar, setAvatar] = useState<string | null>(user?.avatar_url ?? null)
  const [saving, setSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setForm(profileFrom(user)); setAvatar(user?.avatar_url ?? null) }, [user])

  const save = async (fields: ProfileUpdatePayload) => {
    setSaving(true)
    try {
      const updated = await updateProfile(fields)
      setUser(updated)
      queryClient.setQueriesData<Member[]>({ queryKey: ["members"] }, (members) =>
        members?.map((member) => member.user_id === updated.id
          ? { ...member, name: updated.full_name, avatar_url: updated.avatar_url }
          : member),
      )
      toast.success("Perfil atualizado com sucesso.")
    } catch (error) {
      toast.error(extractApiError(error))
    } finally { setSaving(false) }
  }

  const saveProfile = () => void save({
    full_name: form.full_name.trim(), job_title: form.job_title.trim(), phone: form.phone.trim(),
    bio: form.bio.trim(), location: form.location.trim(), availability: form.availability,
    avatar_image: avatar ?? "",
  })

  const savePreferences = () => {
    const resolved = form.theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : form.theme
    setTheme(resolved)
    void save({
      timezone: form.timezone, language: form.language, theme: form.theme,
      density: form.density, notification_preferences: form.notification_preferences,
    })
  }

  const savePassword = async () => {
    if (passwords.next.length < 8) { toast.error("A nova senha precisa ter pelo menos 8 caracteres."); return }
    if (passwords.next !== passwords.confirm) { toast.error("A confirmação da senha não confere."); return }
    setPasswordSaving(true)
    try {
      await changePassword({ current_password: passwords.current, new_password: passwords.next })
      setPasswords({ current: "", next: "", confirm: "" })
      toast.success("Senha alterada com sucesso.")
    } catch (error) { toast.error(extractApiError(error)) }
    finally { setPasswordSaving(false) }
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-12">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl border border-paper-200 bg-ink-950 px-6 py-7 text-white shadow-panel sm:px-8">
        <div className="absolute -right-20 -top-28 size-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 size-32 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <button onClick={() => fileRef.current?.click()} className="group relative size-28 shrink-0 overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/15">
            {avatar ? <img src={avatar} alt="Foto de perfil" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-3xl font-semibold">{initials(form.full_name)}</span>}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/55 py-2 text-[11px] font-medium opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"><Camera className="size-3.5" /> Alterar</span>
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (event) => {
            const file = event.target.files?.[0]
            if (file) setAvatar(await profileImageDataUri(file))
            event.target.value = ""
          }} />
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-brand-300"><Sparkles className="size-3.5" /> Sua identidade no T4E</div>
            <h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">{form.full_name || "Complete seu perfil"}</h1>
            <p className="mt-2 text-sm text-white/55">{form.job_title || "Adicione seu cargo"}{form.location ? ` · ${form.location}` : ""}</p>
          </div>
          <div className="sm:ml-auto"><span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-300/20"><span className="size-1.5 rounded-full bg-emerald-400" /> Conta ativa</span></div>
        </div>
      </motion.header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav className="h-fit rounded-2xl border border-paper-200 bg-paper p-2 shadow-card dark:border-ink-700 dark:bg-ink-900">
          {sections.map((item) => <button key={item.id} onClick={() => setSection(item.id)} className={cx("group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors", section === item.id ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "text-paper-600 hover:bg-paper-100 dark:text-paper-300 dark:hover:bg-ink-800")}>
            <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg", section === item.id ? "bg-brand-500 text-white" : "bg-paper-100 text-paper-500 dark:bg-ink-800")}><item.icon className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="block truncate text-[11px] opacity-65">{item.description}</span></span><ChevronRight className="size-4 opacity-40" />
          </button>)}
        </nav>

        <motion.main key={section} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
          {section === "profile" && <ProfileSection form={form} setForm={setForm} avatar={avatar} setAvatar={setAvatar} saving={saving} onSave={saveProfile} />}
          {section === "preferences" && <PreferencesSection form={form} setForm={setForm} saving={saving} onSave={savePreferences} />}
          {section === "security" && <SecuritySection user={user} passwords={passwords} setPasswords={setPasswords} saving={passwordSaving} onSave={savePassword} />}
          {section === "tokens" && <TokensSection />}
        </motion.main>
      </div>
    </div>
  )
}

type FormState = ReturnType<typeof profileFrom>
type SetForm = React.Dispatch<React.SetStateAction<FormState>>

function Card({ title, description, icon: Icon, children, footer }: { title: string; description: string; icon: typeof UserRound; children: React.ReactNode; footer?: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-paper-200 bg-paper shadow-card dark:border-ink-700 dark:bg-ink-900"><div className="flex items-start gap-3 border-b border-paper-100 px-5 py-4 dark:border-ink-800"><span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"><Icon className="size-4" /></span><div><h2 className="text-[15px] font-semibold text-ink dark:text-paper">{title}</h2><p className="mt-0.5 text-xs text-paper-500">{description}</p></div></div><div className="p-5">{children}</div>{footer && <div className="flex justify-end border-t border-paper-100 bg-paper-50/60 px-5 py-3 dark:border-ink-800 dark:bg-ink-950/30">{footer}</div>}</section>
}

function ProfileSection({ form, setForm, avatar, setAvatar, saving, onSave }: { form: FormState; setForm: SetForm; avatar: string | null; setAvatar: (v: string | null) => void; saving: boolean; onSave: () => void }) {
  return <div className="space-y-5"><Card title="Informações principais" description="Como as pessoas reconhecem você no escritório." icon={UserRound} footer={<Button loading={saving} icon={<Save className="size-4" />} onClick={onSave}>Salvar perfil</Button>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome completo"><Input value={form.full_name} onChange={(e) => setForm((v) => ({ ...v, full_name: e.target.value }))} /></Field><Field label="Cargo ou função"><Input value={form.job_title} onChange={(e) => setForm((v) => ({ ...v, job_title: e.target.value }))} placeholder="Ex.: Product Designer" /></Field><Field label="Telefone"><Input value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} placeholder="+55 11 99999-9999" /></Field><Field label="Localização"><Input value={form.location} onChange={(e) => setForm((v) => ({ ...v, location: e.target.value }))} placeholder="Cidade, estado" /></Field><div className="sm:col-span-2"><Field label="Sobre você" hint={`${form.bio.length}/500 caracteres`}><Textarea rows={5} maxLength={500} value={form.bio} onChange={(e) => setForm((v) => ({ ...v, bio: e.target.value }))} placeholder="Conte um pouco sobre sua atuação, especialidades e interesses." /></Field></div><Field label="Disponibilidade"><Select value={form.availability} onChange={(e) => setForm((v) => ({ ...v, availability: e.target.value as FormState["availability"] }))}><option value="available">Disponível</option><option value="focus">Em foco</option><option value="away">Ausente</option><option value="offline">Offline</option></Select></Field></div></Card>{avatar && <Card title="Foto de perfil" description="Sua foto aparece em cards, comentários e reuniões." icon={Camera}><button onClick={() => setAvatar(null)} className="flex items-center gap-2 text-sm font-medium text-danger hover:underline"><Trash2 className="size-4" /> Remover foto atual</button></Card>}</div>
}

function PreferencesSection({ form, setForm, saving, onSave }: { form: FormState; setForm: SetForm; saving: boolean; onSave: () => void }) {
  const toggle = (key: string) => setForm((value) => ({ ...value, notification_preferences: { ...value.notification_preferences, [key]: !value.notification_preferences[key as keyof typeof value.notification_preferences] } }))
  return <div className="space-y-5"><Card title="Aparência e região" description="Adapte o escritório ao seu jeito de trabalhar." icon={Palette}><div className="grid gap-4 sm:grid-cols-2"><Field label="Tema"><Select value={form.theme} onChange={(e) => setForm((v) => ({ ...v, theme: e.target.value as FormState["theme"] }))}><option value="system">Usar preferência do sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></Select></Field><Field label="Densidade"><Select value={form.density} onChange={(e) => setForm((v) => ({ ...v, density: e.target.value as FormState["density"] }))}><option value="comfortable">Confortável</option><option value="compact">Compacta</option></Select></Field><Field label="Idioma"><Select value={form.language} onChange={(e) => setForm((v) => ({ ...v, language: e.target.value as FormState["language"] }))}><option value="pt-BR">Português (Brasil)</option><option value="en-US">English (US)</option><option value="es">Español</option></Select></Field><Field label="Fuso horário"><Select value={form.timezone} onChange={(e) => setForm((v) => ({ ...v, timezone: e.target.value }))}><option value="America/Sao_Paulo">Brasília · GMT-3</option><option value="America/Manaus">Manaus · GMT-4</option><option value="America/Rio_Branco">Rio Branco · GMT-5</option><option value="Europe/Lisbon">Lisboa</option><option value="UTC">UTC</option></Select></Field></div></Card><Card title="Notificações" description="Escolha quando o T4E Office deve chamar sua atenção." icon={Bell} footer={<Button loading={saving} icon={<Save className="size-4" />} onClick={onSave}>Salvar preferências</Button>}><div className="divide-y divide-paper-100 dark:divide-ink-800">{[["desktop", "Notificações no navegador", "Alertas importantes mesmo em outra aba."], ["email", "Notificações por email", "Resumo de atividades relevantes."], ["mentions", "Menções e atribuições", "Quando citarem você ou atribuírem um card."], ["meetings", "Reuniões", "Início de chamadas e convites para salas."], ["daily_digest", "Resumo diário", "Uma visão do seu dia enviada pela manhã."]].map(([key, label, description]) => <label key={key} className="flex cursor-pointer items-center gap-4 py-3.5"><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink dark:text-paper">{label}</span><span className="block text-xs text-paper-500">{description}</span></span><button type="button" role="switch" aria-checked={form.notification_preferences[key as keyof typeof form.notification_preferences]} onClick={() => toggle(key)} className={cx("relative h-6 w-11 rounded-full transition-colors", form.notification_preferences[key as keyof typeof form.notification_preferences] ? "bg-brand-500" : "bg-paper-300 dark:bg-ink-600")}><span className={cx("absolute top-0.5 grid size-5 place-items-center rounded-full bg-white shadow transition-transform", form.notification_preferences[key as keyof typeof form.notification_preferences] ? "translate-x-5" : "translate-x-0.5")}>{form.notification_preferences[key as keyof typeof form.notification_preferences] && <Check className="size-3 text-brand-600" />}</span></button></label>)}</div></Card></div>
}

function SecuritySection({ user, passwords, setPasswords, saving, onSave }: { user: AuthUser | null; passwords: { current: string; next: string; confirm: string }; setPasswords: React.Dispatch<React.SetStateAction<{ current: string; next: string; confirm: string }>>; saving: boolean; onSave: () => void }) {
  return <div className="space-y-5"><Card title="Conta" description="Informações usadas para entrar no T4E Office." icon={Mail}><div className="grid gap-4 sm:grid-cols-2"><Field label="Email de acesso" hint="Para alterar o email, fale com um administrador."><Input value={user?.email ?? ""} disabled /></Field><Field label="Conta criada em"><Input value={user?.date_joined ? new Date(user.date_joined).toLocaleDateString("pt-BR") : "—"} disabled /></Field></div></Card><Card title={user?.has_usable_password ? "Alterar senha" : "Criar senha"} description="Use pelo menos 8 caracteres e evite senhas de outros serviços." icon={KeyRound} footer={<Button loading={saving} icon={<LockKeyhole className="size-4" />} onClick={onSave}>{user?.has_usable_password ? "Alterar senha" : "Criar senha"}</Button>}><div className="grid gap-4 sm:grid-cols-2">{user?.has_usable_password && <div className="sm:col-span-2"><Field label="Senha atual"><Input type="password" autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords((v) => ({ ...v, current: e.target.value }))} /></Field></div>}<Field label="Nova senha"><Input type="password" autoComplete="new-password" value={passwords.next} onChange={(e) => setPasswords((v) => ({ ...v, next: e.target.value }))} /></Field><Field label="Confirmar nova senha"><Input type="password" autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords((v) => ({ ...v, confirm: e.target.value }))} /></Field></div><div className="mt-5 flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p className="text-xs leading-relaxed">Sua senha é armazenada usando hash seguro. O T4E Office nunca consegue visualizar a senha original.</p></div></Card></div>
}

function TokensSection() {
  const { data: tokens, isLoading } = useTokens()
  const createToken = useCreateToken()
  const revokeToken = useRevokeToken()
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState("")
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  const handleCreate = async () => {
    try {
      const result = await createToken.mutateAsync(name.trim() || undefined)
      setCreatedToken(result.token)
      setName("")
    } catch (error) {
      toast.error(extractApiError(error))
    }
  }

  const handleRevoke = async (id: string) => {
    try {
      await revokeToken.mutateAsync(id)
      toast.success("Token revogado.")
    } catch (error) {
      toast.error(extractApiError(error))
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setCreatedToken(null)
    setName("")
  }

  const copyToken = async () => {
    if (!createdToken) return
    await navigator.clipboard.writeText(createdToken)
    toast.success("Token copiado.")
  }

  return (
    <div className="space-y-5">
      <Card
        title="Tokens de API"
        description="Use um token pessoal pra conectar integrações externas (ex.: Claude via MCP) com sua conta."
        icon={KeyRound}
        footer={<Button icon={<Plus className="size-4" />} onClick={() => setModalOpen(true)}>Gerar novo token</Button>}
      >
        {isLoading && <p className="text-sm text-paper-500">Carregando...</p>}
        {!isLoading && (tokens?.length ?? 0) === 0 && (
          <p className="text-sm text-paper-500">Nenhum token gerado ainda.</p>
        )}
        {!isLoading && tokens && tokens.length > 0 && (
          <div className="divide-y divide-paper-100 dark:divide-ink-800">
            {tokens.map((token) => (
              <div key={token.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink dark:text-paper">{token.name || "Sem nome"}</p>
                  <p className="text-xs text-paper-500">
                    Criado em {new Date(token.created_at).toLocaleDateString("pt-BR")}
                    {token.last_used_at
                      ? ` · último uso em ${new Date(token.last_used_at).toLocaleDateString("pt-BR")}`
                      : " · nunca usado"}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="size-4" />}
                  loading={revokeToken.isPending}
                  onClick={() => handleRevoke(token.id)}
                >
                  Revogar
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={createdToken ? "Token gerado" : "Gerar novo token"}
        description={createdToken ? "Copie agora — ele não será mostrado de novo." : "Dê um nome pra reconhecer onde esse token vai ser usado."}
        footer={
          createdToken ? (
            <Button onClick={closeModal}>Fechar</Button>
          ) : (
            <Button loading={createToken.isPending} icon={<Plus className="size-4" />} onClick={handleCreate}>
              Gerar token
            </Button>
          )
        }
      >
        {createdToken ? (
          <div className="flex items-center gap-2 rounded-xl border border-paper-200 bg-paper-50 p-3 dark:border-ink-700 dark:bg-ink-950/40">
            <code className="flex-1 truncate text-xs text-ink dark:text-paper">{createdToken}</code>
            <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={copyToken}>Copiar</Button>
          </div>
        ) : (
          <Field label="Nome (opcional)">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Claude Desktop" />
          </Field>
        )}
      </Modal>
    </div>
  )
}
