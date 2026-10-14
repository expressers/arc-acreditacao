import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { CATEGORY_LABEL, type Category, type EventSettings } from '@shared/guests'
import { dateBlock, timeRange } from '@shared/format'
import { cn } from '@/lib/utils'

/** Título do evento no registo do key visual: condensado, pesado, em caixa alta. */
export function EventLockup({ s, size = 'md', className }: { s: EventSettings; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const title = size === 'lg' ? 'text-[2.85rem] sm:text-6xl' : size === 'md' ? 'text-[2.1rem]' : 'text-2xl'
  return (
    <div className={cn('text-white', className)}>
      <p className={cn('font-display font-semibold uppercase tracking-wide text-white/90', size === 'sm' ? 'text-sm' : 'text-lg')}>
        {s.edition} {s.subtitle} sobre
      </p>
      <h1 className={cn('display mt-1 text-balance', title)}>{s.title}</h1>
    </div>
  )
}

export function DateVenue({ s, className }: { s: EventSettings; className?: string }) {
  const d = dateBlock(s.date)
  return (
    <div className={cn('flex items-stretch gap-4 text-white', className)}>
      <div className="display text-center leading-[0.85]">
        <div className="text-5xl tabular">{d.day}</div>
        <div className="text-2xl">{d.month}</div>
      </div>
      <div className="w-px bg-white/60" aria-hidden />
      <div className="flex flex-col justify-center gap-0.5 text-sm">
        <span className="font-bold">{timeRange(s.startTime, s.endTime)}</span>
        <span className="font-bold uppercase">{s.venue}</span>
        {s.room && <span className="uppercase text-white/85">({s.room})</span>}
      </div>
    </div>
  )
}

/** Pontos em grelha, como no canto do key visual. */
export function DotField({ className }: { className?: string }) {
  return <div aria-hidden className={cn('arc-dots pointer-events-none', className)} />
}

/** Linhas finas de onda (motivo do KV), desenhadas em SVG. */
export function WaveLines({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio="none" className={cn('pointer-events-none', className)}>
      {Array.from({ length: 14 }, (_, i) => (
        <path
          key={i}
          d={`M-20 ${150 + i * 9} C 80 ${60 + i * 11}, 180 ${260 - i * 6}, 420 ${90 + i * 10}`}
          fill="none"
          stroke="white"
          strokeOpacity={0.05 + i * 0.012}
          strokeWidth="0.8"
        />
      ))}
    </svg>
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
