import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import type { EventSettings } from '@shared/guests'
import { MAX_RATING_COMMENT, MAX_RATING_NAME, ratingLabel, type GuestRating } from '@shared/ratings'
import { dateTime } from '@shared/format'
import { ArcLogo, EventLockup } from '@/components/brand'
import { StarRating } from '@/components/star-rating'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { useApi } from '@/lib/hooks'

interface PublicRatingData {
  settings: EventSettings
  rating: (GuestRating & { name: string | null }) | null
}

/** Chave anónima deste browser: permite corrigir a nota sem criar respostas repetidas. */
const STORAGE_KEY = 'arc.rating.key'

function localVoterKey() {
  try {
    let key = localStorage.getItem(STORAGE_KEY)
    if (!key) {
      key = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEY, key)
    }
    return key
  } catch {
    return ''
  }
}

/** Avaliação aberta: chega-se pelo QR Code mostrado no evento, sem credencial. */
export default function PublicRatingPage() {
  const [voterKey] = useState(localVoterKey)
  const { data, error, loading, setData } = useApi<PublicRatingData>(
    `/api/public/rating?key=${encodeURIComponent(voterKey)}`,
  )
  const [value, setValue] = useState(0)
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setValue(data.rating?.rating ?? 0)
    setName(data.rating?.name ?? '')
    setComment(data.rating?.comment ?? '')
  }, [data])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!value) {
      setFormError('Escolha uma nota de 1 a 10.')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const r = await api.post<{ rating: GuestRating & { name: string | null } }>('/api/public/rating', {
        rating: value,
        comment,
        name,
        voterKey: voterKey || undefined,
      })
      setData((d) => (d ? { ...d, rating: r.rating } : d))
      setSaved(true)
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="arc-sky min-h-dvh" />

  if (error || !data) {
    return (
      <main className="arc-sky grid min-h-dvh place-items-center px-6 text-center text-white">
        <div className="max-w-sm">
          <ArcLogo className="mx-auto mb-8 h-9" />
          <h1 className="display text-3xl">Avaliação indisponível</h1>
          <p className="mt-3 text-white/85">Não foi possível abrir a avaliação. Verifique a ligação e tente de novo.</p>
        </div>
      </main>
    )
  }

  const { settings: s } = data

  return (
    <main className="arc-sky relative isolate min-h-dvh overflow-hidden text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),1.75rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <ArcLogo className="h-9" />
        <EventLockup s={s} size="md" className="mt-7" />

        <section
          aria-labelledby="rate-title"
          className="mt-7 rounded-3xl bg-white p-5 text-foreground shadow-[0_24px_60px_-20px_oklch(0.2_0.08_250/0.55)] sm:p-6"
        >
          <p className="eyebrow text-brand-600">Avaliação do evento</p>
          <h1 id="rate-title" className="mt-1.5 text-[1.45rem] leading-tight font-extrabold text-brand-900">
            Como foi a sua experiência?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Classifique o evento de 1 a 10 estrelas e, se quiser, deixe um comentário.
          </p>

          {saved && (
            <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
              <p>Obrigado! A sua avaliação foi registada.</p>
            </div>
          )}

          {!saved && data.rating && (
            <p className="mt-4 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              Já avaliou este evento a {dateTime(data.rating.updatedAt)}. Pode actualizar a nota e o comentário.
            </p>
          )}

          <form onSubmit={submit} className="mt-5 space-y-5">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <Label>Nota</Label>
                <span className="text-xs text-muted-foreground tabular">{value ? `${value} / 10` : '1 a 10'}</span>
              </div>
              <StarRating
                value={value}
                onChange={(v) => {
                  setValue(v)
                  setSaved(false)
                }}
                className="mt-2.5"
              />
              <p className="mt-2 min-h-5 text-center text-sm font-semibold text-brand-900" aria-live="polite">
                {value ? ratingLabel(value) : 'Toque nas estrelas para avaliar'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rating-name">
                Nome <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="rating-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setSaved(false)
                }}
                maxLength={MAX_RATING_NAME}
                autoComplete="name"
                placeholder="Para identificarmos o seu comentário"
                className="h-11 text-base"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="rating-comment">
                  Comentário <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <span className="text-xs text-muted-foreground tabular">
                  {comment.length}/{MAX_RATING_COMMENT}
                </span>
              </div>
              <Textarea
                id="rating-comment"
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value)
                  setSaved(false)
                }}
                maxLength={MAX_RATING_COMMENT}
                placeholder="O que mais gostou? O que podemos melhorar?"
                className="min-h-28 bg-background"
              />
            </div>

            {formError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {formError}
              </p>
            )}

            <Button type="submit" disabled={busy || !value} className="press h-12 w-full text-base font-semibold">
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  {data.rating ? 'Actualizar avaliação' : 'Enviar avaliação'}
                  <ArrowRight className="size-5" />
                </>
              )}
            </Button>
          </form>
        </section>

        <p className="mt-auto pt-6 text-center text-xs text-white/75">{s.organizer}</p>
      </div>
    </main>
  )
}
