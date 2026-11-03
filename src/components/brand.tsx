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

/**
 * Palavras do lettering em três linhas, como na capa:
 * CONFERÊNCIA ANUAL / SOBRE CONCORRÊNCIA / & REGULAÇÃO ECONÓMICA.
 * O "e" passa a "&" e fica colado à palavra seguinte.
 */
function letteringLines(text: string) {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .reduce<string[]>((acc, w, i, all) => (all[i - 1] === 'e' ? acc : [...acc, w === 'e' && all[i + 1] ? `&\u00a0${all[i + 1]}` : w]), [])
  const per = Math.ceil(words.length / 3)
  return [0, 1, 2].map((i) => words.slice(i * per, i * per + per)).filter((l) => l.length)
}

const LOCKUP_MAX = { sm: '0.8rem', md: '1.05rem', lg: '1.6rem' } as const

/**
 * Título do evento como nos entregáveis: numeral romano + lettering em três linhas fixas.
 * Escala com a largura disponível (container query) em vez de partir linhas.
 */
export function EventLockup({ s, size = 'md', className }: { s: EventSettings; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const lines = letteringLines(`${s.subtitle} sobre ${s.title.replace(/\s+em Angola$/i, '')}`)
  return (
    <div className={cn('@container w-full', className)}>
      <div
        className="flex items-center gap-[0.9em] text-white"
        style={{ fontSize: `min(${LOCKUP_MAX[size]}, 4.6cqi)` }}
      >
        <span aria-hidden className="text-[3.55em] leading-[0.78] font-black tracking-[-0.04em]">
          {s.edition}
        </span>
        <h1 className="leading-[1.12] tracking-[0.01em] uppercase">
          <span className="sr-only">{s.edition} </span>
          {lines.map((line, i) => (
            <span key={i} className="block whitespace-nowrap">
              {line.map((w, j) => (
                <span key={j} className={LIGHT_WORDS.has(w.replace(/^&\u00a0/, '').toLowerCase()) ? 'font-light' : 'font-extrabold'}>
                  {j > 0 && ' '}
                  {w}
                </span>
              ))}
            </span>
          ))}
        </h1>
      </div>
    </div>
  )
}

/** Faixa de data/local/hora como na capa do evento. Escala como um bloco, nunca parte o texto. */
export function DateVenue({ s, className }: { s: EventSettings; className?: string }) {
  const d = dateBlock(s.date)
  const year = s.date.slice(0, 4)
  return (
    <div className={cn('@container w-full', className)}>
      <div
        className="inline-flex overflow-hidden rounded-[1em] whitespace-nowrap shadow-[0_1.1em_2.5em_-1.1em_rgb(4_40_90/0.55)]"
        style={{ fontSize: 'min(1rem, 4cqi)' }}
      >
        <div className="flex flex-col justify-center bg-brand-600 px-[1em] py-[0.8em] text-white">
          <span className="text-[1.45em] leading-none font-medium tabular">
            {d.day}.{d.month}
          </span>
          <span className="mt-[0.3em] text-[0.875em] leading-none font-medium">DE {year}</span>
        </div>
        <div className="flex items-center gap-[1em] bg-white px-[1em] py-[0.8em] text-brand-600">
          <div>
            <p className="text-[1.45em] leading-none font-medium">{EVENT_COPY.venueShort}</p>
            <p className="mt-[0.35em] text-[0.62em] leading-[1.25] font-medium uppercase">
              Hotel de Convenções
              <br />
              de Talatona
            </p>
          </div>
          <span aria-hidden className="w-px self-stretch bg-brand-600/40" />
          <span className="text-[1.45em] leading-none font-medium tabular">{EVENT_COPY.receptionTime.toUpperCase()}</span>
        </div>
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
