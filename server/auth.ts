import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

export type Role = 'admin' | 'door'
export interface Session {
  role: Role
  name: string
  exp: number
}

const IS_PROD = process.env.NODE_ENV === 'production'
if (IS_PROD && (process.env.SESSION_SECRET ?? '').length < 32) {
  throw new Error('SESSION_SECRET em falta ou curto (mínimo 32 caracteres). Gere com: openssl rand -hex 32')
}
const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET não definido: as sessões caem a cada reinício.')
}

/**
 * Cada sessão fica presa à credencial que a abriu: mudar ADMIN_PASSWORD ou DOOR_PIN
 * no servidor invalida de imediato todas as sessões desse papel.
 */
const roleKeys: Partial<Record<Role, string>> = {}
export function bindRoleSecret(role: Role, secret: string) {
  roleKeys[role] = createHmac('sha256', SECRET).update(`role:${role}:${secret}`).digest('hex')
}

const COOKIE = 'arc_sid'
const TTL: Record<Role, number> = { admin: 7 * 24 * 3600, door: 3 * 24 * 3600 }

function sign(payload: string, role: Role) {
  return createHmac('sha256', SECRET).update(`${roleKeys[role] ?? ''}.${payload}`).digest('base64url')
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
  setCookie(c, COOKIE, `${payload}.${sign(payload, role)}`, {
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
  if (!payload || !sig) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session
    if (s.role !== 'admin' && s.role !== 'door') return null
    if (!safeEqual(sig, sign(payload, s.role))) return null
    if (s.exp < Date.now() / 1000) return null
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

/**
 * IP real do visitante. Atrás do proxy do Coolify (Traefik), o último valor de
 * X-Forwarded-For é o que o próprio proxy acrescentou; os anteriores vêm do cliente
 * e podem ser falsificados. Com a Cloudflare em modo proxy (TRUST_CLOUDFLARE=true),
 * usa-se o CF-Connecting-IP.
 */
export function clientIp(c: { req: { header: (n: string) => string | undefined } }) {
  if (process.env.TRUST_CLOUDFLARE === 'true') {
    const cf = c.req.header('cf-connecting-ip')?.trim()
    if (cf) return cf
  }
  const xff = c.req.header('x-forwarded-for')
  const last = xff?.split(',').map((s) => s.trim()).filter(Boolean).pop()
  return last || c.req.header('x-real-ip')?.trim() || 'local'
}

// Limite de tentativas falhadas: por IP e, contra ataques distribuídos, global por papel.
const WINDOW = 15 * 60_000
const PER_IP = 8
const GLOBAL_PER_ROLE = 60
const attempts = new Map<string, { count: number; reset: number }>()
function bump(key: string) {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + WINDOW })
    return 1
  }
  entry.count += 1
  return entry.count
}
function current(key: string) {
  const entry = attempts.get(key)
  return entry && entry.reset >= Date.now() ? entry.count : 0
}
export function loginAllowed(ip: string, role: Role) {
  return current(`ip:${ip}`) < PER_IP && current(`role:${role}`) < GLOBAL_PER_ROLE
}
export function loginFailed(ip: string, role: Role) {
  bump(`ip:${ip}`)
  const n = bump(`role:${role}`)
  if (n === GLOBAL_PER_ROLE) console.warn(`[auth] ${n} tentativas falhadas para "${role}" em 15 min: login bloqueado temporariamente.`)
}
export function loginSucceeded(ip: string) {
  attempts.delete(`ip:${ip}`)
}

export function newToken() {
  return randomBytes(18).toString('base64url')
}
