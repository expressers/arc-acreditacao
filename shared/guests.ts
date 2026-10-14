/**
 * Regras partilhadas entre o browser (pré-visualização da importação) e o
 * servidor (validação final). O servidor nunca confia no que o browser enviou:
 * volta a passar tudo por aqui.
 */

export const CATEGORIES = ['convidado', 'orador', 'imprensa'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABEL: Record<Category, string> = {
  convidado: 'Convidado',
  orador: 'Orador',
  imprensa: 'Imprensa',
}

export const CATEGORY_PLURAL: Record<Category, string> = {
  convidado: 'Convidados',
  orador: 'Oradores',
  imprensa: 'Imprensa',
}

export type InviteStatus = 'pending' | 'sent' | 'failed'

export interface Guest {
  id: string
  name: string
  email: string
  category: Category
  organization: string | null
  token: string
  inviteStatus: InviteStatus
  inviteSentAt: string | null
  inviteError: string | null
  checkedInAt: string | null
  checkedInBy: string | null
  createdAt: string
}

export interface EventSettings {
  edition: string
  title: string
  subtitle: string
  date: string // ISO yyyy-mm-dd
  startTime: string
  endTime: string
  venue: string
  room: string
  organizer: string
  contactEmail: string
}

export const MAX_NAME = 120
export const MAX_ORG = 120
export const MAX_GUESTS = 2000

// Caracteres de controlo e invisíveis que costumam vir colados do Excel/Word.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g

export function cleanText(value: unknown, max: number): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .normalize('NFC')
    .replace(INVISIBLE, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** Nomes vindos em CAIXA ALTA ou caixa baixa passam a "Nome Próprio". */
export function tidyName(value: unknown): string {
  const name = cleanText(value, MAX_NAME)
  const letters = name.replace(/[^\p{L}]/gu, '')
  const allUpper = letters.length > 3 && letters === letters.toUpperCase()
  const allLower = letters.length > 3 && letters === letters.toLowerCase()
  if (!allUpper && !allLower) return name
  const small = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
  return name
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

export function normalizeEmail(value: unknown): string {
  return cleanText(value, 254)
    .toLowerCase()
    .replace(/^mailto:/, '')
    .replace(/\s/g, '')
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email) && !email.includes('..')
}

export function parseCategory(value: unknown, fallback: Category = 'convidado'): Category | null {
  const raw = cleanText(value, 40)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (!raw) return fallback
  if (/^(convidad|guest|vip|participante|geral)/.test(raw)) return 'convidado'
  if (/^(orador|palestrante|speaker|prelector|moderador|painelista)/.test(raw)) return 'orador'
  if (/^(imprensa|press|media|midia|jornalista|comunicacao social)/.test(raw)) return 'imprensa'
  return null
}

export interface GuestInput {
  name: string
  email: string
  category: Category
  organization: string | null
}

export type RowIssue = 'nome em falta' | 'email inválido' | 'email repetido' | 'categoria desconhecida'

export interface CheckedRow {
  line: number
  input: GuestInput
  issues: RowIssue[]
}

/** Valida uma lista crua (do Excel ou do formulário). */
export function checkRows(
  rows: Array<{ line: number; name: unknown; email: unknown; category?: unknown; organization?: unknown }>,
  fallback: Category,
  existingEmails: Set<string> = new Set(),
): CheckedRow[] {
  const seen = new Set<string>()
  return rows.map((row) => {
    const issues: RowIssue[] = []
    const name = tidyName(row.name)
    const email = normalizeEmail(row.email)
    const category = parseCategory(row.category, fallback)
    const organization = cleanText(row.organization, MAX_ORG) || null
    if (name.length < 2) issues.push('nome em falta')
    if (!isValidEmail(email)) issues.push('email inválido')
    else if (seen.has(email) || existingEmails.has(email)) issues.push('email repetido')
    if (!category) issues.push('categoria desconhecida')
    if (isValidEmail(email)) seen.add(email)
    return { line: row.line, input: { name, email, category: category ?? fallback, organization }, issues }
  })
}

export type ScanResult =
  | { status: 'ok'; guest: Pick<Guest, 'name' | 'category' | 'organization'>; checkedInAt: string }
  | {
      status: 'duplicate'
      guest: Pick<Guest, 'name' | 'category' | 'organization'>
      checkedInAt: string
      checkedInBy: string | null
    }
  | { status: 'invalid' }

/** Extrai o token de um QR: aceita o URL completo da credencial ou o token cru. */
export function tokenFromQr(raw: string): string | null {
  const text = raw.trim()
  const match = text.match(/\/c\/([A-Za-z0-9_-]{16,64})(?:[/?#].*)?$/) ?? text.match(/^([A-Za-z0-9_-]{16,64})$/)
  return match ? match[1] : null
}
