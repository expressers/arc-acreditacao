import { useParams } from 'react-router'
import { CalendarPlus, CheckCircle2, Download, SunMedium } from 'lucide-react'
import { CATEGORY_LABEL, type Category, type EventSettings } from '@shared/guests'
import { longDate, timeRange } from '@shared/format'
import { Button } from '@/components/ui/button'
import { DotField, EventLockup, WaveLines, credentialLink, useQrDataUrl } from '@/components/brand'
import { useApi } from '@/lib/hooks'

interface Credential {
  guest: { name: string; category: Category; organization: string | null }
  checkedIn: boolean
  settings: EventSettings
}

function icsFor(s: EventSettings) {
  const d = s.date.replace(/-/g, '')
  const t = (x: string) => x.replace(':', '') + '00'
  const where = [s.venue, s.room].filter(Boolean).join(', ')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Acreditacao//PT',
    'BEGIN:VEVENT',
    `UID:${d}-arc-conferencia@acreditacao`,
    `DTSTART;TZID=Africa/Luanda:${d}T${t(s.startTime)}`,
    `DTEND;TZID=Africa/Luanda:${d}T${t(s.endTime || s.startTime)}`,
    `SUMMARY:${s.edition} ${s.subtitle} sobre ${s.title}`,
    `LOCATION:${where}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

function download(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function CredentialPage() {
  const { token = '' } = useParams()
  const { data, error, loading } = useApi<Credential>(`/api/public/credential/${encodeURIComponent(token)}`)
  const qr = useQrDataUrl(data ? credentialLink(token) : null, 720)

  if (loading) return <div className="arc-sky min-h-dvh" />

  if (error || !data) {
    return (
      <main className="arc-sky grid min-h-dvh place-items-center px-6 text-center text-white">
        <div className="max-w-sm">
          <h1 className="display text-4xl">Credencial não encontrada</h1>
          <p className="mt-3 text-white/85">
            O link pode estar incompleto ou a credencial foi substituída. Confirme o email mais recente que recebeu ou contacte a organização.
          </p>
        </div>
      </main>
    )
  }

  const { guest, settings: s } = data
  const where = [s.venue, s.room].filter(Boolean).join(' · ')

  return (
    <main className="arc-sky relative isolate min-h-dvh overflow-hidden text-white">
      <WaveLines className="absolute inset-0 -z-10 h-full w-full" />
      <DotField className="absolute top-40 right-4 -z-10 h-14 w-24 opacity-60" />

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),1.75rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <p className="text-sm font-semibold text-white/90">{s.organizer}</p>
        <EventLockup s={s} size="md" className="mt-6" />

        <section
          aria-label="Credencial de acesso"
          className="mt-7 rounded-3xl bg-white p-5 text-brand-950 shadow-[0_24px_60px_-20px_oklch(0.2_0.08_250/0.55)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-700">Credencial pessoal</p>
              <h2 className="mt-1 text-[1.4rem] leading-tight font-extrabold text-balance break-words">{guest.name}</h2>
              {guest.organization && <p className="mt-0.5 text-sm text-brand-900/70">{guest.organization}</p>}
            </div>
            <span className="display shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-lg text-white">{CATEGORY_LABEL[guest.category]}</span>
          </div>

          <div className="relative mx-auto mt-5 max-w-[300px]">
            {qr ? (
              <img src={qr} alt="QR Code de acesso" className="aspect-square w-full [image-rendering:pixelated]" />
            ) : (
              <div className="aspect-square w-full animate-pulse rounded-xl bg-brand-50" />
            )}
            {data.checkedIn && (
              <div className="absolute inset-0 grid place-items-center rounded-xl bg-white/85 backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-2 text-ok">
                  <CheckCircle2 className="size-12" />
                  <span className="font-bold">Entrada registada</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-dashed border-brand-100 pt-4 text-sm">
            <p className="font-bold">{longDate(s.date)}</p>
            <p className="text-brand-900/75">
              {timeRange(s.startTime, s.endTime)}
              {where && ` · ${where}`}
            </p>
          </div>
        </section>

        <p className="mt-4 flex items-center gap-2 text-sm text-white/90">
          <SunMedium className="size-4 shrink-0" />
          À entrada, aumente o brilho do ecrã e mostre este código.
        </p>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
          <Button
            variant="secondary"
            className="press h-12 bg-white/15 text-white hover:bg-white/25"
            disabled={!qr}
            onClick={() => qr && download(qr, `credencial-${guest.name.split(' ')[0].toLowerCase()}.png`)}
          >
            <Download className="size-4" /> Guardar QR
          </Button>
          <Button
            variant="secondary"
            className="press h-12 bg-white/15 text-white hover:bg-white/25"
            onClick={() => download(URL.createObjectURL(new Blob([icsFor(s)], { type: 'text/calendar' })), 'conferencia-arc.ics')}
          >
            <CalendarPlus className="size-4" /> Agenda
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-white/70">Credencial pessoal e intransmissível.</p>
      </div>
    </main>
  )
}
