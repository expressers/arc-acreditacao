import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { isValidEmail, normalizeEmail, type Category, type EventSettings } from '@shared/guests'
import { dateTime } from '@shared/format'
import { ArcLogo, EventLockup } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { useApi } from '@/lib/hooks'

interface Invite {
  guest: { name: string; email: string; category: Category; organization: string | null; position: string | null }
  confirmedAt: string | null
  settings: EventSettings
}

/** O convidado confirma a presença: dados pré-preenchidos, editáveis (pode indicar um representante). */
export default function ConfirmPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { data, error, loading } = useApi<Invite>(`/api/public/invite/${encodeURIComponent(token)}`)
  const [form, setForm] = useState({ name: '', email: '', organization: '', position: '' })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    const g = data.guest
    setForm({ name: g.name, email: g.email, organization: g.organization ?? '', position: g.position ?? '' })
  }, [data])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!isValidEmail(normalizeEmail(form.email))) {
      setFormError('O email não parece válido.')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      await api.post(`/api/public/confirm/${encodeURIComponent(token)}`, {
        name: form.name,
        email: form.email,
        organization: form.organization || null,
        position: form.position || null,
      })
      navigate(`/c/${token}`, { replace: true })
    } catch (err) {
      setFormError(errorMessage(err))
      setBusy(false)
    }
  }

  if (loading) return <div className="arc-sky min-h-dvh" />

  if (error || !data) {
    return (
      <main className="arc-sky grid min-h-dvh place-items-center px-6 text-center text-white">
        <div className="max-w-sm">
          <ArcLogo className="mx-auto mb-8 h-9" />
          <h1 className="display text-3xl">Convite não encontrado</h1>
          <p className="mt-3 text-white/85">
            O link pode estar incompleto ou o convite foi substituído. Use o email mais recente que recebeu ou contacte a organização.
          </p>
        </div>
      </main>
    )
  }

  const changedPerson = data.guest.email !== normalizeEmail(form.email) && form.email.trim() !== ''

  return (
    <main className="arc-sky relative isolate min-h-dvh overflow-hidden text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),1.75rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <ArcLogo className="h-9" />
        <EventLockup s={data.settings} size="md" className="mt-7" />

        <section
          aria-labelledby="confirm-title"
          className="mt-7 rounded-3xl bg-white p-5 text-foreground shadow-[0_24px_60px_-20px_oklch(0.2_0.08_250/0.55)] sm:p-6"
        >
          <h2 id="confirm-title" className="text-[1.35rem] leading-tight font-extrabold text-brand-900">
            Confirmação de presença
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Confirme os seus dados. Se for outra pessoa em seu lugar, altere-os para os do seu representante.
          </p>

          {data.confirmedAt && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
              <p>
                Presença confirmada a {dateTime(data.confirmedAt)}.{' '}
                <Link to={`/c/${token}`} className="font-semibold text-brand-700 underline underline-offset-4">
                  Ver credencial
                </Link>
              </p>
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Nome completo</Label>
              <Input id="c-name" value={form.name} onChange={set('name')} required minLength={2} maxLength={120} autoComplete="name" className="h-12 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" inputMode="email" value={form.email} onChange={set('email')} required autoComplete="email" className="h-12 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-org">Instituição</Label>
              <Input id="c-org" value={form.organization} onChange={set('organization')} maxLength={120} autoComplete="organization" className="h-12 text-base" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-pos">Cargo</Label>
              <Input id="c-pos" value={form.position} onChange={set('position')} maxLength={120} autoComplete="organization-title" className="h-12 text-base" />
            </div>
            {changedPerson && (
              <p className="text-sm text-muted-foreground">A credencial passa a ficar em nome da pessoa indicada.</p>
            )}
            {formError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={busy || form.name.trim().length < 2} className="press h-12 w-full text-base font-semibold">
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  {data.confirmedAt ? 'Actualizar e ver credencial' : 'Confirmar presença'}
                  <ArrowRight className="size-5" />
                </>
              )}
            </Button>
          </form>
        </section>

        <p className="mt-auto pt-6 text-center text-xs text-white/75">{data.settings.organizer}</p>
      </div>
    </main>
  )
}
