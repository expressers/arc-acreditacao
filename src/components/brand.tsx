import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CATEGORY_LABEL, type Category, type EventSettings } from '@shared/guests'
import { dateBlock } from '@shared/format'
import { EVENT_COPY } from '@shared/event-copy'
import { cn } from '@/lib/utils'

/** Logótipo oficial da ARC (extraído dos entregáveis). */
export function ArcLogo({ tone = 'white', className }: { tone?: 'white' | 'navy'; className?: string }) {
  return (
    <img
      src={tone === 'white' ? '/brand/arc-logo-white.png' : '/brand/arc-logo-navy.png'}
      alt="ARC · Autoridade Reguladora da Concorrência"
      width={955}
      height={217}
      className={cn('h-10 w-auto max-w-none shrink-0 self-start object-contain select-none', className)}
      draggable={false}
    />
  )
}

/** Palavras em peso leve no lettering dos entregáveis ("CONFERÊNCIA anual sobre CONCORRÊNCIA…"). */
const LIGHT_WORDS = new Set(['anual', 'sobre', 'económica', 'em', 'angola', 'de', 'da', 'do'])

function Lettering({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\s+/)
        .filter(Boolean)
        // "e" passa a "&" e fica colado à palavra seguinte, como na capa ("& REGULAÇÃO")
        .reduce<string[]>((acc, w, i, all) => (all[i - 1] === 'e' ? acc : [...acc, w === 'e' && all[i + 1] ? `&\u00a0${all[i + 1]}` : w]), [])
        .map((w, i) => {
          const light = LIGHT_WORDS.has(w.replace(/^&\u00a0/, '').toLowerCase())
          return (
            <span key={i} className={light ? 'font-light' : 'font-extrabold'}>
              {w}{' '}
            </span>
          )
        })}
    </>
  )
}

/** Título do evento como nos entregáveis: numeral romano grande + lettering em caixa alta. */
export function EventLockup({ s, size = 'md', className }: { s: EventSettings; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const numeral = size === 'lg' ? 'text-[5.6rem] sm:text-[7rem]' : size === 'md' ? 'text-[4.2rem]' : 'text-5xl'
  const words = size === 'lg' ? 'text-[1.28rem] sm:text-[1.6rem]' : size === 'md' ? 'text-[1.02rem]' : 'text-[0.8rem]'
  const title = s.title.replace(/\s+em Angola$/i, '')
  return (
    <div className={cn('flex items-center gap-4 text-white', className)}>
      <span aria-hidden className={cn('font-black leading-[0.78] tracking-[-0.06em]', numeral)}>
        {s.edition}
      </span>
      <h1 className={cn('min-w-0 uppercase leading-[1.08] tracking-[0.01em] text-balance', words)}>
        <span className="sr-only">{s.edition} </span>
        <Lettering text={`${s.subtitle} sobre ${title}`} />
      </h1>
    </div>
  )
}

/** Faixa de data/local/hora como na capa do evento. */
export function DateVenue({ s, className }: { s: EventSettings; className?: string }) {
  const d = dateBlock(s.date)
  const year = s.date.slice(0, 4)
  return (
    <div className={cn('inline-flex max-w-full overflow-hidden rounded-2xl shadow-[0_18px_40px_-18px_rgb(4_40_90/0.55)]', className)}>
      <div className="flex flex-col justify-center bg-brand-600 px-4 py-3 text-white">
        <span className="text-[1.45rem] leading-none font-medium tabular">
          {d.day}.{d.month}
        </span>
        <span className="mt-1 text-sm leading-none font-medium">DE {year}</span>
      </div>
      <div className="flex min-w-0 items-center gap-4 bg-white px-4 py-3 text-brand-600">
        <div className="min-w-0">
          <p className="text-[1.45rem] leading-none font-medium">{EVENT_COPY.venueShort}</p>
          <p className="mt-1 text-[0.62rem] leading-tight font-medium uppercase">
            Hotel de Convenções
            <br />
            de Talatona
          </p>
        </div>
        <span aria-hidden className="w-px self-stretch bg-brand-600/50" />
        <span className="text-[1.45rem] leading-none font-medium tabular">{EVENT_COPY.receptionTime.toUpperCase()}</span>
      </div>
    </div>
  )
}

const CATEGORY_STYLE: Record<Category, string> = {
  convidado: 'bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-100',
  orador: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100',
  imprensa: 'bg-violet-100 text-violet-900 dark:bg-violet-900/60 dark:text-violet-100',
}

export function CategoryBadge({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider',
        CATEGORY_STYLE[category],
        className,
      )}
    >
      {CATEGORY_LABEL[category]}
    </span>
  )
}

export function useQrDataUrl(text: string | null, width = 640) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!text) return
    let alive = true
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width, color: { dark: '#0b2a45', light: '#ffffff' } })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null))
    return () => {
      alive = false
    }
  }, [text, width])
  return url
}

export function QrImage({ text, className, alt = 'QR Code de acesso' }: { text: string; className?: string; alt?: string }) {
  const url = useQrDataUrl(text)
  return url ? (
    <img src={url} alt={alt} className={cn('aspect-square w-full [image-rendering:pixelated]', className)} />
  ) : (
    <div className={cn('aspect-square w-full animate-pulse rounded-lg bg-muted', className)} />
  )
}

export function credentialLink(token: string) {
  return `${window.location.origin}/c/${token}`
}
