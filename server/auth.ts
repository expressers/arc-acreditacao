import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

export type Role = 'admin' | 'door'
export interface Session {
  role: Role
  name: string
  exp: number
}

const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET não definido: as sessões caem a cada reinício.')
}

const COOKIE = 'arc_sid'
const TTL: Record<Role, number> = { admin: 7 * 24 * 3600, door: 3 * 24 * 3600 }

function sign(payload: string) {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** Compara segredos sem revelar o tamanho nem o conteúdo pelo tempo de resposta. */
export function secretMatches(given: string, expected: string | undefined) {
  if (!expected) return false
  const a = createHmac('sha256', SECRET).update(given).digest()
  const b = createHmac('sha256', SECRET).update(expected).digest()
  return timingSafeEqual(a, b)
}

export function issueSession(c: Context, role: Role, name: string) {
  const session: Session = { role, name, exp: Math.floor(Date.now() / 1000) + TTL[role] }
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  setCookie(c, COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: TTL[role],
  })
  return session
}

export function clearSession(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' })
}

export function readSession(c: Context): Session | null {
  const raw = getCookie(c, COOKIE)
  if (!raw) return null
  const [payload, sig] = raw.split('.')
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session
    if (s.exp < Date.now() / 1000) return null
    if (s.role !== 'admin' && s.role !== 'door') return null
    return s
  } catch {
    return null
  }
}

type Env = { Variables: { session: Session } }

export function requireRole(...roles: Role[]) {
  return async (c: Context<Env>, next: Next) => {
    const s = readSession(c)
    if (!s) return c.json({ error: 'Sessão expirada. Entre novamente.' }, 401)
    if (!roles.includes(s.role)) return c.json({ error: 'Sem permissão para esta acção.' }, 403)
    c.set('session', s)
    await next()
  }
}

/** Pedidos que alteram dados têm de vir da própria app (JSON + cabeçalho próprio). */
export async function csrfGuard(c: Context, next: Next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    if (c.req.header('x-app') !== 'acreditacao') return c.json({ error: 'Pedido recusado.' }, 403)
  }
  await next()
}

// Limite simples de tentativas de login por IP (memória do processo).
const attempts = new Map<string, { count: number; reset: number }>()
export function loginAllowed(ip: string) {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || entry.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 10 * 60_000 })
    return true
  }
  entry.count += 1
  return entry.count <= 12
}
export function loginSucceeded(ip: string) {
  attempts.delete(ip)
}

export function newToken() {
  return randomBytes(18).toString('base64url')
}
