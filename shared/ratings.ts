/**
 * Avaliação do evento pelos convidados: 1 estrela = insatisfeito,
 * 10 estrelas = muito satisfeito. Uma avaliação por convidado (pode ser actualizada).
 */
import type { Category } from './guests.ts'

export const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
export type RatingValue = (typeof RATING_VALUES)[number]

export const MIN_RATING = RATING_VALUES[0]
export const MAX_RATING = RATING_VALUES[RATING_VALUES.length - 1]
export const MAX_RATING_COMMENT = 1000

export const RATING_LABELS: Record<RatingValue, string> = {
  1: 'Insatisfeito',
  2: 'Muito abaixo do esperado',
  3: 'Abaixo do esperado',
  4: 'Pouco satisfatório',
  5: 'Razoável',
  6: 'Satisfatório',
  7: 'Bom',
  8: 'Muito bom',
  9: 'Excelente',
  10: 'Muito satisfeito',
}

export function ratingLabel(value: number): string {
  return RATING_LABELS[value as RatingValue] ?? ''
}

export function isValidRating(value: unknown): value is RatingValue {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_RATING && value <= MAX_RATING
}

export interface GuestRating {
  rating: RatingValue
  comment: string | null
  createdAt: string
  updatedAt: string
}

/** Linha do painel de resultados. Os dados do convidado podem faltar se ele foi removido. */
export interface RatingRow extends GuestRating {
  guestId: string | null
  name: string | null
  email: string | null
  category: Category | null
  organization: string | null
}

export interface RatingSummary {
  count: number
  average: number | null
  /** Convidados com entrada registada; serve para calcular a taxa de resposta. */
  attended: number
  /** Quantidade de notas 1..10; o índice 0 corresponde a 1 estrela. */
  distribution: number[]
  rows: RatingRow[]
}
