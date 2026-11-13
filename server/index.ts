import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'
import {
  CATEGORIES,
  MAX_GUESTS,
  MAX_ORG,
  MAX_POSITION,
  checkRows,
  cleanText,
  isValidEmail,
  nameKey,
  normalizeEmail,
  parseCategory,
  tidyName,
  tokenFromQr,
  type Category,
  type ScanResult,
} from '../shared/guests.ts'
import {
  clearSession,
  csrfGuard,
  issueSession,
  bindRoleSecret,
  clientIp,
  loginAllowed,
  loginFailed,
  loginSucceeded,
  newToken,
  readSession,
  requireRole,
  secretMatches,
  type Session,
} from './auth.ts'
import { GUEST_COLUMNS, getSettings, migrate, saveSettings, sql, toGuest, type GuestRow } from './db.ts'
import {
  MAX_RATING,
  MAX_RATING_COMMENT,
  MAX_RATING_NAME,
  MIN_RATING,
  RATING_VALUES,
  type RatingSummary,
  type RatingValue,
} from '../shared/ratings.ts'
import { confirmUrl, dataSrc, inviteHtml, mailConfigured, mailFrom, sendInvite } from './mail.ts'

type Env = { Variables: { session: Session } }
const app = new Hono<Env>()

const PORT = Number(process.env.PORT ?? 3000)
const IS_PROD = process.env.NODE_ENV === 'production'
// Em desenvolvimento usa-se 1234; em produção as credenciais são obrigatórias e fortes.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PROD ? '' : '1234')
const DOOR_PIN = process.env.DOOR_PIN || (IS_PROD ? '' : '1234')
if (IS_PROD) {
  const weak = ['1234', '12345', '123456', '0000', '000000', 'password', 'admin']
  if (ADMIN_PASSWORD.length < 12 || weak.includes(ADMIN_PASSWORD.toLowerCase()))
    throw new Error('ADMIN_PASSWORD em falta ou fraca (mínimo 12 caracteres).')
  if (DOOR_PIN.length < 6 || weak.includes(DOOR_PIN))
    throw new Error('DOOR_PIN em falta ou fraco (mínimo 6 caracteres).')
}
bindRoleSecret('admin', ADMIN_PASSWORD)
bindRoleSecret('door', DOOR_PIN)
const MAIL_RATE = Math.max(0.5, Number(process.env.MAIL_RATE_PER_SEC ?? 2))

function baseUrl(c: { req: { url: string } }) {
  return process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || new URL(c.req.url).origin
}

app.use(
  '*',
  secureHeaders({
    crossOriginEmbedderPolicy: false,
    permissionsPolicy: { camera: ['self'], microphone: [], geolocation: [] },
    referrerPolicy: 'strict-origin-when-cross-origin',
  }),
)
app.use('/api/*', csrfGuard)
app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Erro interno. Tente novamente.' }, 500)
})

// ───────────────────────── público ─────────────────────────

app.get('/api/health', async (c) => {
  await sql`select 1`
  return c.json({ ok: true })
})

app.get('/api/public/settings', async (c) => c.json(await getSettings()))

app.get('/api/public/credential/:token', async (c) => {
  const token = c.req.param('token') ?? ''
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return c.json({ error: 'Credencial inválida.' }, 404)
  const [row] = await sql<
    { name: string; category: Category; organization: string | null; position: string | null; checked_in_at: Date | null; confirmed_at: Date | null }[]
  >`select name, category, organization, position, checked_in_at, confirmed_at from guests where token = ${token}`
  if (!row) return c.json({ error: 'Credencial inválida ou revogada.' }, 404)
  return c.json({
    guest: { name: row.name, category: row.category, organization: row.organization, position: row.position },
    checkedIn: Boolean(row.checked_in_at),
    confirmed: Boolean(row.confirmed_at),
    settings: await getSettings(),
  })
})

// ───────────────────────── confirmação de presença (convidado) ─────────────────────────

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/

/** Dados do convite para pré-preencher o formulário. O token (144 bits) é a autorização. */
app.get('/api/public/invite/:token', async (c) => {
  const token = c.req.param('token') ?? ''
  if (!TOKEN_RE.test(token)) return c.json({ error: 'Convite inválido.' }, 404)
  const [row] = await sql<
    { name: string; email: string | null; category: Category; organization: string | null; position: string | null; confirmed_at: Date | null }[]
  >`select name, email, category, organization, position, confirmed_at from guests where token = ${token}`
  if (!row) return c.json({ error: 'Convite inválido ou substituído.' }, 404)
  return c.json({
    guest: { name: row.name, email: row.email, category: row.category, organization: row.organization, position: row.position },
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
    settings: await getSettings(),
  })
})

const confirmSchema = z.object({
  name: z.string().max(200),
  email: z.string().max(254),
  organization: z.string().max(200).nullable().optional(),
  position: z.string().max(200).nullable().optional(),
})

/** O convidado confirma (e pode corrigir ou passar o convite a outra pessoa). */
app.post('/api/public/confirm/:token', async (c) => {
  const token = c.req.param('token') ?? ''
  if (!TOKEN_RE.test(token)) return c.json({ error: 'Convite inválido.' }, 404)
  const body = confirmSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Verifique os dados do formulário.' }, 400)
  const name = tidyName(body.data.name)
  const email = normalizeEmail(body.data.email)
  if (name.length < 2) return c.json({ error: 'Indique o nome completo.' }, 400)
  if (email && !isValidEmail(email)) return c.json({ error: 'O email não parece válido.' }, 400)
  const organization = cleanText(body.data.organization, MAX_ORG) || null
  const position = cleanText(body.data.position, MAX_POSITION) || null
  const [self] = await sql<{ id: string; email: string | null }[]>`select id, email from guests where token = ${token}`
  if (!self) return c.json({ error: 'Convite inválido ou substituído.' }, 404)
  // Só quem foi importado sem email pode confirmar sem o indicar.
  if (!email && self.email) return c.json({ error: 'O email não parece válido.' }, 400)
  if (email) {
    const [dupe] = await sql`select 1 from guests where lower(email) = ${email} and id <> ${self.id}`
    if (dupe) return c.json({ error: 'Este email já tem um convite. Use outro email ou contacte a organização.' }, 409)
  }
  await sql`
    update guests set name = ${name}, email = ${email || null}, organization = ${organization}, position = ${position},
      confirmed_at = now(), updated_at = now()
    where id = ${self.id}`
  return c.json({ ok: true })
})

// ───────────────────────── avaliação do evento ─────────────────────────

/**
 * Avaliação aberta, pelo QR Code mostrado no evento. Não exige convite nem
 * credencial: o browser guarda uma chave local para o convidado poder corrigir
 * a nota sem criar respostas repetidas.
 */
app.get('/api/public/rating', async (c) => {
  const key = cleanText(c.req.query('key'), 64)
  const [row] = key
    ? await sql<{ rating: number; comment: string | null; name: string | null; created_at: Date; updated_at: Date }[]>`
        select rating, comment, name, created_at, updated_at from ratings where voter_key = ${key}`
    : []
  return c.json({
    settings: await getSettings(),
    rating: row
      ? {
          rating: row.rating,
          comment: row.comment,
          name: row.name,
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        }
      : null,
  })
})

const publicRatingSchema = z.object({
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  comment: z.string().max(MAX_RATING_COMMENT).nullable().optional(),
  name: z.string().max(MAX_RATING_NAME).nullable().optional(),
  voterKey: z.string().min(8).max(64).optional(),
})

app.post('/api/public/rating', async (c) => {
  const body = publicRatingSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Escolha uma nota entre 1 e 10.' }, 400)
  const name = cleanText(body.data.name, MAX_RATING_NAME) || null
  const comment = cleanText(body.data.comment, MAX_RATING_COMMENT) || null
  const voterKey = cleanText(body.data.voterKey, 64) || null
  const [row] = await sql<{ rating: number; comment: string | null; name: string | null; created_at: Date; updated_at: Date }[]>`
    insert into ratings (name, voter_key, rating, comment)
    values (${name}, ${voterKey}, ${body.data.rating}, ${comment})
    on conflict (voter_key) do update set name = excluded.name, rating = excluded.rating, comment = excluded.comment, updated_at = now()
    returning rating, comment, name, created_at, updated_at`
  return c.json({
    ok: true,
    rating: {
      rating: row.rating,
      comment: row.comment,
      name: row.name,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    },
  })
})

/** Quem tem o link da credencial pode avaliar. O token é a autorização, como no convite. */
app.get('/api/public/rating/:token', async (c) => {
  const token = c.req.param('token') ?? ''
  if (!TOKEN_RE.test(token)) return c.json({ error: 'Link de avaliação inválido.' }, 404)
  const [row] = await sql<
    {
      id: string
      name: string
      category: Category
      rating: number | null
      comment: string | null
      created_at: Date | null
      updated_at: Date | null
    }[]
  >`
    select g.id, g.name, g.category, r.rating, r.comment, r.created_at, r.updated_at
    from guests g left join ratings r on r.guest_id = g.id
    where g.token = ${token}`
  if (!row) return c.json({ error: 'Link de avaliação inválido ou substituído.' }, 404)
  return c.json({
    guest: { name: row.name, category: row.category },
    rating:
      row.rating !== null && row.created_at && row.updated_at
        ? {
            rating: row.rating,
            comment: row.comment,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
          }
        : null,
    settings: await getSettings(),
  })
})

const ratingSchema = z.object({
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  comment: z.string().max(MAX_RATING_COMMENT).nullable().optional(),
})

app.post('/api/public/rating/:token', async (c) => {
  const token = c.req.param('token') ?? ''
  if (!TOKEN_RE.test(token)) return c.json({ error: 'Link de avaliação inválido.' }, 404)
  const [guest] = await sql<{ id: string }[]>`select id from guests where token = ${token}`
  if (!guest) return c.json({ error: 'Link de avaliação inválido ou substituído.' }, 404)
  const body = ratingSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Escolha uma nota entre 1 e 10.' }, 400)
  const comment = cleanText(body.data.comment, MAX_RATING_COMMENT) || null
  // Uma avaliação por convidado: voltar a enviar actualiza a anterior, sem apagar o convidado.
  const [row] = await sql<{ rating: number; comment: string | null; created_at: Date; updated_at: Date }[]>`
    insert into ratings (guest_id, rating, comment)
    values (${guest.id}, ${body.data.rating}, ${comment})
    on conflict (guest_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now()
    returning rating, comment, created_at, updated_at`
  return c.json({
    ok: true,
    rating: {
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    },
  })
})

// ───────────────────────── sessão ─────────────────────────

const loginSchema = z.object({
  role: z.enum(['admin', 'door']),
  secret: z.string().min(1).max(200),
  name: z.string().max(40).optional(),
})

app.post('/api/login', async (c) => {
  const ip = clientIp(c)
  const body = loginSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Dados inválidos.' }, 400)
  const { role, secret } = body.data
  if (!loginAllowed(ip, role)) return c.json({ error: 'Demasiadas tentativas. Aguarde 15 minutos.' }, 429)
  const ok = role === 'admin' ? secretMatches(secret, ADMIN_PASSWORD) : secretMatches(secret, DOOR_PIN)
  if (!ok) {
    loginFailed(ip, role)
    console.warn(`[auth] login falhado (${role}) de ${ip}`)
    await new Promise((r) => setTimeout(r, 400))
    return c.json({ error: role === 'admin' ? 'Palavra-passe incorrecta.' : 'PIN incorrecto.' }, 401)
  }
  loginSucceeded(ip)
  const name = cleanText(body.data.name, 40) || (role === 'admin' ? 'Organização' : 'Entrada')
  const s = issueSession(c, role, name)
  return c.json({ role: s.role, name: s.name })
})

app.post('/api/logout', (c) => {
  clearSession(c)
  return c.json({ ok: true })
})

app.get('/api/session', (c) => {
  const s = readSession(c)
  return s ? c.json({ role: s.role, name: s.name }) : c.json({ error: 'Sem sessão.' }, 401)
})

// ───────────────────────── portaria (admin + porta) ─────────────────────────

const door = requireRole('admin', 'door')

type MiniGuest = { id: string; name: string; category: Category; organization: string | null }

async function checkIn(guestId: string, device: string, mode: 'ok' | 'manual'): Promise<ScanResult> {
  // Actualização atómica: só a primeira leitura marca a entrada.
  const [fresh] = await sql<(MiniGuest & { checked_in_at: Date })[]>`
    update guests set checked_in_at = now(), checked_in_by = ${device}, updated_at = now()
    where id = ${guestId} and checked_in_at is null
    returning id, name, category, organization, checked_in_at`
  if (fresh) {
    await sql`insert into scans (guest_id, result, device) values (${guestId}, ${mode}, ${device})`
    return {
      status: 'ok',
      guest: { name: fresh.name, category: fresh.category, organization: fresh.organization },
      checkedInAt: fresh.checked_in_at.toISOString(),
    }
  }
  const [prev] = await sql<(MiniGuest & { checked_in_at: Date; checked_in_by: string | null })[]>`
    select id, name, category, organization, checked_in_at, checked_in_by from guests where id = ${guestId}`
  if (!prev) return { status: 'invalid' }
  await sql`insert into scans (guest_id, result, device) values (${guestId}, 'duplicate', ${device})`
  return {
    status: 'duplicate',
    guest: { name: prev.name, category: prev.category, organization: prev.organization },
    checkedInAt: prev.checked_in_at.toISOString(),
    checkedInBy: prev.checked_in_by,
  }
}

app.post('/api/scan', door, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const token = tokenFromQr(String(body?.code ?? ''))
  const device = c.get('session').name
  if (!token) {
    await sql`insert into scans (result, device) values ('invalid', ${device})`
    return c.json<ScanResult>({ status: 'invalid' })
  }
  const [row] = await sql<{ id: string }[]>`select id from guests where token = ${token}`
  if (!row) {
    await sql`insert into scans (result, device) values ('invalid', ${device})`
    return c.json<ScanResult>({ status: 'invalid' })
  }
  return c.json(await checkIn(row.id, device, 'ok'))
})

app.post('/api/checkin/:id', door, async (c) => {
  const id = c.req.param('id') ?? ''
  if (!z.uuid().safeParse(id).success) return c.json({ error: 'Convidado inválido.' }, 400)
  return c.json(await checkIn(id, c.get('session').name, 'manual'))
})

app.get('/api/door/search', door, async (c) => {
  const q = cleanText(c.req.query('q'), 60)
  if (q.length < 2) return c.json([])
  const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
  const rows = await sql<(MiniGuest & { checked_in_at: Date | null })[]>`
    select id, name, category, organization, checked_in_at from guests
    where unaccent_name(name) ilike unaccent_name(${like}) or organization ilike ${like}
    order by name limit 12`
  return c.json(rows.map((r) => ({ ...r, checkedInAt: r.checked_in_at?.toISOString() ?? null, checked_in_at: undefined })))
})

app.get('/api/door/stats', door, async (c) => {
  const [r] = await sql<{ total: number; present: number }[]>`
    select count(*)::int as total, count(checked_in_at)::int as present from guests`
  return c.json(r)
})

// ───────────────────────── administração ─────────────────────────

const admin = requireRole('admin')

app.get('/api/stats', admin, async (c) => {
  const byCat = await sql<{ category: Category; total: number; present: number; sent: number }[]>`
    select category, count(*)::int as total, count(checked_in_at)::int as present,
      count(*) filter (where invite_status = 'sent')::int as sent
    from guests group by category`
  const [inv] = await sql<{ pending: number; failed: number; confirmed: number; no_email: number }[]>`
    select count(*) filter (where invite_status = 'pending' and email is not null)::int as pending,
      count(*) filter (where invite_status = 'failed' and email is not null)::int as failed,
      count(*) filter (where email is null)::int as no_email,
      count(confirmed_at)::int as confirmed from guests`
  const recent = await sql<{ name: string; category: Category; at: Date; device: string | null; result: string }[]>`
    select g.name, g.category, s.at, s.device, s.result from scans s join guests g on g.id = s.guest_id
    where s.result in ('ok', 'manual') order by s.at desc limit 8`
  const perCategory = Object.fromEntries(
    CATEGORIES.map((cat) => {
      const r = byCat.find((x) => x.category === cat)
      return [cat, { total: r?.total ?? 0, present: r?.present ?? 0, sent: r?.sent ?? 0 }]
    }),
  )
  const sum = (k: 'total' | 'present' | 'sent') => byCat.reduce((a, r) => a + r[k], 0)
  return c.json({
    total: sum('total'),
    present: sum('present'),
    sent: sum('sent'),
    pending: inv.pending,
    failed: inv.failed,
    noEmail: inv.no_email,
    confirmed: inv.confirmed,
    perCategory,
    recent: recent.map((r) => ({ ...r, at: r.at.toISOString() })),
    mail: { configured: mailConfigured, from: mailFrom },
    job: publicJob(),
  })
})

app.get('/api/ratings', admin, async (c) => {
  const rows = await sql<
    {
      guest_id: string | null
      name: string | null
      email: string | null
      category: Category | null
      organization: string | null
      rating: number
      comment: string | null
      created_at: Date
      updated_at: Date
    }[]
  >`
    select r.guest_id, coalesce(g.name, r.name) as name, g.email, g.category, g.organization,
      r.rating, r.comment, r.created_at, r.updated_at
    from ratings r left join guests g on g.id = r.guest_id
    order by r.created_at desc`
  const [agg] = await sql<{ count: number; average: number | null }[]>`
    select count(*)::int as count, avg(rating)::float as average from ratings`
  const byRating = await sql<{ rating: number; count: number }[]>`
    select rating, count(*)::int as count from ratings group by rating`
  const [attendance] = await sql<{ attended: number }[]>`select count(checked_in_at)::int as attended from guests`
  return c.json<RatingSummary>({
    count: agg.count,
    average: agg.average === null ? null : Math.round(agg.average * 10) / 10,
    attended: attendance.attended,
    distribution: RATING_VALUES.map((v) => byRating.find((r) => r.rating === v)?.count ?? 0),
    rows: rows.map((r) => ({
      guestId: r.guest_id,
      name: r.name,
      email: r.email,
      category: r.category,
      organization: r.organization,
      rating: r.rating as RatingValue,
      comment: r.comment,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    })),
  })
})

app.get('/api/guests', admin, async (c) => {
  const rows = await sql<GuestRow[]>`select ${GUEST_COLUMNS} from guests order by created_at desc, name`
  return c.json(rows.map(toGuest))
})

const guestSchema = z.object({
  name: z.string(),
  email: z.string(),
  category: z.enum(CATEGORIES),
  organization: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
})

function sanitizeGuest(raw: unknown) {
  const parsed = guestSchema.safeParse(raw)
  if (!parsed.success) return { error: 'Dados inválidos.' } as const
  const name = tidyName(parsed.data.name)
  const email = normalizeEmail(parsed.data.email)
  if (name.length < 2) return { error: 'Indique o nome completo.' } as const
  if (email && !isValidEmail(email)) return { error: 'Email inválido.' } as const
  return {
    value: {
      name,
      email: email || null,
      category: parsed.data.category,
      organization: cleanText(parsed.data.organization, MAX_ORG) || null,
      position: cleanText(parsed.data.position, MAX_POSITION) || null,
    },
  } as const
}

app.post('/api/guests', admin, async (c) => {
  const g = sanitizeGuest(await c.req.json().catch(() => null))
  if ('error' in g) return c.json({ error: g.error }, 400)
  if (g.value.email) {
    const [dupe] = await sql`select 1 from guests where lower(email) = ${g.value.email}`
    if (dupe) return c.json({ error: 'Já existe um convidado com este email.' }, 409)
  }
  const [row] = await sql<GuestRow[]>`
    insert into guests (name, email, category, organization, position, token)
    values (${g.value.name}, ${g.value.email}, ${g.value.category}, ${g.value.organization}, ${g.value.position}, ${newToken()})
    returning ${GUEST_COLUMNS}`
  return c.json(toGuest(row), 201)
})

app.patch('/api/guests/:id', admin, async (c) => {
  const id = c.req.param('id') ?? ''
  if (!z.uuid().safeParse(id).success) return c.json({ error: 'Convidado inválido.' }, 400)
  const g = sanitizeGuest(await c.req.json().catch(() => null))
  if ('error' in g) return c.json({ error: g.error }, 400)
  if (g.value.email) {
    const [dupe] = await sql`select 1 from guests where lower(email) = ${g.value.email} and id <> ${id}`
    if (dupe) return c.json({ error: 'Já existe outro convidado com este email.' }, 409)
  }
  const [row] = await sql<GuestRow[]>`
    update guests set name = ${g.value.name}, email = ${g.value.email}, category = ${g.value.category},
      organization = ${g.value.organization}, position = ${g.value.position}, updated_at = now(),
      invite_status = case when lower(email) is distinct from ${g.value.email} then 'pending' else invite_status end
    where id = ${id} returning ${GUEST_COLUMNS}`
  return row ? c.json(toGuest(row)) : c.json({ error: 'Convidado não encontrado.' }, 404)
})

app.delete('/api/guests/:id', admin, async (c) => {
  const id = c.req.param('id') ?? ''
  if (!z.uuid().safeParse(id).success) return c.json({ error: 'Convidado inválido.' }, 400)
  await sql`delete from guests where id = ${id}`
  return c.json({ ok: true })
})

/** Gera um novo QR: o anterior deixa de abrir a porta. */
app.post('/api/guests/:id/token', admin, async (c) => {
  const id = c.req.param('id') ?? ''
  if (!z.uuid().safeParse(id).success) return c.json({ error: 'Convidado inválido.' }, 400)
  const [row] = await sql<GuestRow[]>`
    update guests set token = ${newToken()}, invite_status = 'pending', invite_sent_at = null, updated_at = now()
    where id = ${id} returning ${GUEST_COLUMNS}`
  return row ? c.json(toGuest(row)) : c.json({ error: 'Convidado não encontrado.' }, 404)
})

app.post('/api/guests/:id/undo-checkin', admin, async (c) => {
  const id = c.req.param('id') ?? ''
  if (!z.uuid().safeParse(id).success) return c.json({ error: 'Convidado inválido.' }, 400)
  const [row] = await sql<GuestRow[]>`
    update guests set checked_in_at = null, checked_in_by = null, updated_at = now()
    where id = ${id} returning ${GUEST_COLUMNS}`
  if (row) await sql`insert into scans (guest_id, result, device) values (${id}, 'undo', ${c.get('session').name})`
  return row ? c.json(toGuest(row)) : c.json({ error: 'Convidado não encontrado.' }, 404)
})

const importSchema = z.object({
  fallbackCategory: z.enum(CATEGORIES),
  rows: z
    .array(
      z.object({
        line: z.number().int(),
        name: z.unknown(),
        email: z.unknown(),
        category: z.unknown().optional(),
        organization: z.unknown().optional(),
        position: z.unknown().optional(),
      }),
    )
    .max(MAX_GUESTS),
})

app.post('/api/guests/import', admin, async (c) => {
  const body = importSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Ficheiro inválido ou demasiado grande.' }, 400)
  const current = await sql<{ email: string | null; name: string }[]>`select lower(email) as email, name from guests`
  const existing = new Set(current.flatMap((r) => (r.email ? [r.email] : [])))
  const existingNames = new Set(current.map((r) => nameKey(r.name)))
  const checked = checkRows(body.data.rows, body.data.fallbackCategory, existing, existingNames)
  const valid = checked.filter((r) => r.issues.length === 0).map((r) => r.input)
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from guests`
  if (count + valid.length > MAX_GUESTS) return c.json({ error: `Limite de ${MAX_GUESTS} convidados.` }, 400)
  let inserted = 0
  if (valid.length) {
    const values = valid.map((g) => ({ ...g, token: newToken() }))
    const res = await sql`
      insert into guests ${sql(values, 'name', 'email', 'category', 'organization', 'position', 'token')}
      on conflict do nothing`
    inserted = res.count
  }
  return c.json({
    inserted,
    skipped: checked.length - inserted,
    issues: checked.filter((r) => r.issues.length).map((r) => ({ line: r.line, issues: r.issues })),
  })
})

app.get('/api/settings', admin, async (c) => c.json(await getSettings()))

const settingsSchema = z.object({
  edition: z.string().max(12),
  title: z.string().min(3).max(140),
  subtitle: z.string().max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^(\d{2}:\d{2})?$/),
  venue: z.string().max(120),
  room: z.string().max(80),
  organizer: z.string().max(120),
  contactEmail: z.string().max(254),
})

app.put('/api/settings', admin, async (c) => {
  const body = settingsSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Verifique os campos do evento.' }, 400)
  const s = Object.fromEntries(Object.entries(body.data).map(([k, v]) => [k, cleanText(v, 160)])) as typeof body.data
  if (s.contactEmail && !isValidEmail(normalizeEmail(s.contactEmail))) return c.json({ error: 'Email de contacto inválido.' }, 400)
  await saveSettings(s)
  return c.json(s)
})

// ───────────────────────── envio de convites ─────────────────────────

interface Job {
  running: boolean
  total: number
  done: number
  failed: number
  startedAt: string
  finishedAt: string | null
}
let job: Job | null = null
const publicJob = () => job

const sendSchema = z.object({
  scope: z.enum(['pending', 'failed', 'ids']),
  ids: z.array(z.uuid()).max(MAX_GUESTS).optional(),
})

app.post('/api/invites/send', admin, async (c) => {
  if (!mailConfigured) return c.json({ error: 'O envio de email ainda não está configurado no servidor.' }, 503)
  if (job?.running) return c.json({ error: 'Já há um envio em curso.' }, 409)
  const body = sendSchema.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'Pedido inválido.' }, 400)
  const { scope, ids = [] } = body.data
  const targets =
    scope === 'ids'
      ? await sql<GuestRow[]>`select ${GUEST_COLUMNS} from guests where id = any(${ids}) and email is not null`
      : await sql<GuestRow[]>`select ${GUEST_COLUMNS} from guests where invite_status = ${scope} and email is not null order by created_at`
  if (!targets.length) return c.json({ error: 'Não há convites para enviar.' }, 400)
  const settings = await getSettings()
  const base = baseUrl(c)
  job = { running: true, total: targets.length, done: 0, failed: 0, startedAt: new Date().toISOString(), finishedAt: null }
  const current = job
  void (async () => {
    const gap = 1000 / MAIL_RATE
    for (const row of targets) {
      const t0 = Date.now()
      try {
        await sendInvite(toGuest(row), settings, base)
        await sql`update guests set invite_status = 'sent', invite_sent_at = now(), invite_error = null where id = ${row.id}`
      } catch (err) {
        current.failed += 1
        const msg = cleanText(err instanceof Error ? err.message : String(err), 300)
        await sql`update guests set invite_status = 'failed', invite_error = ${msg} where id = ${row.id}`
      }
      current.done += 1
      const wait = gap - (Date.now() - t0)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
    current.running = false
    current.finishedAt = new Date().toISOString()
  })()
  return c.json(job, 202)
})

app.get('/api/invites/job', admin, (c) => c.json(job))

app.get('/api/invites/preview', admin, async (c) => {
  const sample = { name: 'Nome do Convidado', email: 'convidado@exemplo.ao', category: 'convidado' as const, organization: null, token: 'pre-visualizacao' }
  const html = inviteHtml(sample, await getSettings(), confirmUrl(baseUrl(c), sample.token), dataSrc)
  return c.json({ html })
})

app.post('/api/invites/test', admin, async (c) => {
  if (!mailConfigured) return c.json({ error: 'O envio de email ainda não está configurado no servidor.' }, 503)
  const body = await c.req.json().catch(() => ({}))
  const to = normalizeEmail(body?.email)
  if (!isValidEmail(to)) return c.json({ error: 'Email inválido.' }, 400)
  const category = parseCategory(body?.category) ?? 'convidado'
  await sendInvite({ name: 'Convidado de Teste', email: to, category, organization: null, token: 'TESTE-nao-valido-na-porta' }, await getSettings(), baseUrl(c), to)
  return c.json({ ok: true })
})

// ───────────────────────── app estática (PWA) ─────────────────────────

app.use('/assets/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'public, max-age=31536000, immutable')
})
app.use('/sw.js', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-cache')
})
app.use('*', serveStatic({ root: './dist' }))
app.get('*', serveStatic({ path: './dist/index.html' }))

await migrate()
await sql`
  create or replace function unaccent_name(t text) returns text language sql immutable as
  $$ select lower(translate(t, 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')) $$`

console.log(`Acreditação a correr em :${PORT} · email ${mailConfigured ? 'activo' : 'não configurado'}`)

export default { port: PORT, fetch: app.fetch }
