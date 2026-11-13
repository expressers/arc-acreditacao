import { useState, type KeyboardEvent } from 'react'
import { Star } from 'lucide-react'
import { MAX_RATING, RATING_VALUES, ratingLabel } from '@shared/ratings'
import { cn } from '@/lib/utils'

const STAR_SIZE = {
  sm: 'size-3.5',
  md: 'size-5',
  lg: 'h-auto w-full',
} as const

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  /** Só mostra a nota, sem interacção (painel da organização). */
  readOnly?: boolean
  size?: keyof typeof STAR_SIZE
  className?: string
}

/**
 * Nota de 1 a 10 em estrelas. No telemóvel as estrelas ocupam a largura toda
 * (10 colunas), para continuarem fáceis de tocar em ecrãs estreitos.
 */
export function StarRating({ value, onChange, readOnly = false, size = 'lg', className }: StarRatingProps) {
  const [hover, setHover] = useState(0)

  if (readOnly) {
    return (
      <div
        role="img"
        aria-label={`${value} de ${MAX_RATING} estrelas`}
        className={cn('inline-flex items-center gap-0.5', className)}
      >
        {RATING_VALUES.map((v) => (
          <Star
            key={v}
            aria-hidden
            strokeWidth={1.5}
            className={cn(STAR_SIZE[size], 'shrink-0', v <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/35')}
          />
        ))}
      </div>
    )
  }

  const shown = hover || value

  function handleKey(e: KeyboardEvent<HTMLButtonElement>, current: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
    const next = step ? Math.min(MAX_RATING, Math.max(1, current + step)) : e.key === 'Home' ? 1 : e.key === 'End' ? MAX_RATING : 0
    if (!next) return
    e.preventDefault()
    onChange?.(next)
    const group = e.currentTarget.closest('[role="radiogroup"]')
    group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next - 1]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Avaliação de 1 a 10 estrelas"
      className={cn('grid w-full grid-cols-10 gap-1', className)}
      onMouseLeave={() => setHover(0)}
    >
      {RATING_VALUES.map((v) => {
        const active = v <= shown
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={`${v} de ${MAX_RATING} — ${ratingLabel(v)}`}
            tabIndex={value === v || (!value && v === 1) ? 0 : -1}
            onClick={() => onChange?.(v)}
            onMouseEnter={() => setHover(v)}
            onFocus={() => setHover(v)}
            onBlur={() => setHover(0)}
            onKeyDown={(e) => handleKey(e, v)}
            className="group/star rounded-md p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Star
              aria-hidden
              strokeWidth={1.5}
              className={cn(
                'h-auto w-full transition-[transform,color,fill] duration-150 ease-[var(--ease-out-strong)] group-active/star:scale-90',
                active ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-muted-foreground/40',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
