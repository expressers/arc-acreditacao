import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { EventSettings } from '@shared/guests'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { DateVenue, DotField, EventLockup, WaveLines } from '@/components/brand'
import { api, errorMessage } from '@/lib/api'
import { useApi } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import { PageTitle } from './layout'

const FIELDS: { key: keyof EventSettings; label: string; type?: string; hint?: string; span?: boolean }[] = [
  { key: 'edition', label: 'Edição', hint: 'Ex.: VII' },
  { key: 'subtitle', label: 'Tipo de evento', hint: 'Ex.: Conferência Anual' },
  { key: 'title', label: 'Tema', span: true },
  { key: 'date', label: 'Data', type: 'date' },
  { key: 'startTime', label: 'Início', type: 'time' },
  { key: 'endTime', label: 'Fim', type: 'time' },
  { key: 'venue', label: 'Local', hint: 'Ex.: Hotel Epic Sana' },
  { key: 'room', label: 'Sala', hint: 'Ex.: Sala Angola II' },
  { key: 'organizer', label: 'Organização', span: true },
  { key: 'contactEmail', label: 'Email para dúvidas (aparece no convite)', type: 'email', span: true },
]

export default function EventPage() {
  const { data } = useApi<EventSettings>('/api/settings')
  const { setSettings } = useSession()
  const [form, setForm] = useState<EventSettings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    try {
      const saved = await api.put<EventSettings>('/api/settings', form)
      setSettings(saved)
      setForm(saved)
      toast.success('Dados do evento guardados.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageTitle title="Evento" description="Estes dados aparecem no convite por email, na credencial e no ecrã de entrada." />
      {!form ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <form onSubmit={save} className="rounded-2xl border bg-card p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.span ? 'col-span-2 space-y-1.5 sm:col-span-3' : f.key === 'date' ? 'col-span-2 space-y-1.5 sm:col-span-1' : 'space-y-1.5'}>
                  <Label htmlFor={`ev-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`ev-${f.key}`}
                    type={f.type ?? 'text'}
                    value={form[f.key]}
                    placeholder={f.hint}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    required={['title', 'date', 'startTime'].includes(f.key)}
                    className="h-11 text-base sm:text-sm"
                  />
                </div>
              ))}
            </div>
            <Button type="submit" className="press mt-6 h-12 w-full text-base sm:w-auto sm:px-8" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Guardar
            </Button>
          </form>

          <div>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">Pré-visualização</p>
            <div className="arc-sky relative isolate overflow-hidden rounded-2xl p-6">
              <WaveLines className="absolute inset-0 -z-10 h-full w-full" />
              <DotField className="absolute right-4 bottom-4 -z-10 h-12 w-20 opacity-70" />
              <EventLockup s={form} size="md" />
              <div className="my-5 h-px bg-white/45" />
              <DateVenue s={form} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
