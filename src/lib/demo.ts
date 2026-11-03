/**
 * Modo demonstração: responde às chamadas /api/* no próprio browser, com dados fictícios,
 * para mostrar o produto sem backend. Entrar com 1234 (organização ou entrada).
 * Só se liga com VITE_DEMO=true no build; por omissão a app usa o backend real.
 */
import {
  CATEGORIES,
  checkRows,
  normalizeEmail,
  tidyName,
  tokenFromQr,
  type Category,
  type EventSettings,
  type Guest,
  type ScanResult,
} from '@shared/guests'

export const DEMO = import.meta.env.VITE_DEMO === 'true'

const SECRET = '1234'
const SESSION_KEY = 'demo.session'

type Session = { role: 'admin' | 'door'; name: string }
type Scan = { guestId: string; result: string; device: string; at: string }

let settings: EventSettings = {
  edition: 'VII',
  title: 'Concorrência e Regulação Económica em Angola',
  subtitle: 'Conferência Anual',
  date: '2026-11-13',
  startTime: '09:00',
  endTime: '14:30',
  venue: 'Hotel Epic Sana, Luanda',
  room: 'Salão Nobre',
  organizer: 'Autoridade Reguladora da Concorrência',
  contactEmail: 'conferencia@exemplo.ao',
}

const PEOPLE: Array<[string, Category, string | null]> = [
  ['Ana Paula Fernandes', 'convidado', 'Banco Nacional de Angola'],
  ['João Manuel Kiala', 'orador', 'Universidade Agostinho Neto'],
  ['Maria Luísa Domingos', 'convidado', 'Ministério da Economia e Planeamento'],
  ['Pedro Afonso Neto', 'imprensa', 'Jornal de Angola'],
  ['Teresa Sebastião', 'convidado', 'Câmara de Comércio e Indústria'],
  ['Carlos Mendes Lopes', 'orador', 'Autoridade Reguladora da Concorrência'],
  ['Isabel Cristina Tavares', 'convidado', 'Sonangol'],
  ['Manuel António Quissanga', 'imprensa', 'TPA'],
  ['Luísa Bento Cardoso', 'convidado', 'Unitel'],
  ['Domingos Paulo Gaspar', 'convidado', 'ENSA Seguros'],
  ['Helena Joaquina Vunge', 'orador', 'Ordem dos Advogados de Angola'],
  ['Rui Alberto Matias', 'convidado', 'BFA'],
  ['Esperança Nzinga Lukamba', 'convidado', 'AIPEX'],
  ['Francisco Xavier Ndala', 'imprensa', 'Rádio Nacional de Angola'],
  ['Joana Teixeira Mbala', 'convidado', 'INACOM'],
  ['Alberto Cassule', 'convidado', 'Grupo Refriango'],
  ['Sofia Valentim Ngola', 'orador', 'Banco Mundial'],
  ['Mário Fortunato Kamuenho', 'convidado', 'BAI'],
  ['Cecília Augusto Pinto', 'convidado', 'Ministério das Finanças'],
  ['Henrique Lemos Sambo', 'imprensa', 'Expansão'],
  ['Graça Victória Massala', 'convidado', 'Africell'],
  ['Victor Hugo Capita', 'convidado', 'Angola Cables'],
  ['Natália Kambuta', 'convidado', 'ARSEG'],
  ['Simão Dala Cahombo', 'convidado', null],
]

const now = Date.now()
const minutes = (m: number) => new Date(now - m * 60_000).toISOString()
const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.charAt(b % 64),
  ).join('')
const uuid = () => crypto.randomUUID()

let guests: Guest[] = PEOPLE.map(([name, category, organization], i) => {
  const present = i % 3 === 0
  const status = i % 7 === 5 ? 'failed' : i % 5 === 4 ? 'pending' : 'sent'
  return {
    id: uuid(),
    name,
    email: `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${i + 1}@exemplo.ao`,
    category,
    organization,
    token: token(),
    inviteStatus: status,
    inviteSentAt: status === 'sent' ? minutes(60 * 24 * 3 + i) : null,
    inviteError: status === 'failed' ? 'Caixa de correio inexistente (demonstração).' : null,
    checkedInAt: present ? minutes(5 + i * 3) : null,
    checkedInBy: present ? (i % 2 ? 'Porta principal' : 'Entrada VIP') : null,
    createdAt: minutes(60 * 24 * 5 - i),
  }
})

const scans: Scan[] = guests
  .filter((g) => g.checkedInAt)
  .map((g) => ({ guestId: g.id, result: 'ok', device: g.checkedInBy ?? 'Entrada', at: g.checkedInAt! }))

let job: { running: boolean; total: number; done: number; failed: number; startedAt: string; finishedAt: string | null } | null =
  null

function readSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    return null
  }
}

type Reply = { status: number; data: unknown }
const ok = (data: unknown, status = 200): Reply => ({ status, data })
const fail = (error: string, status = 400): Reply => ({ status, data: { error } })
const mini = (g: Guest) => ({ name: g.name, category: g.category, organization: g.organization })

function checkIn(g: Guest, device: string): ScanResult {
  if (g.checkedInAt) {
    scans.unshift({ guestId: g.id, result: 'duplicate', device, at: new Date().toISOString() })
    return { status: 'duplicate', guest: mini(g), checkedInAt: g.checkedInAt, checkedInBy: g.checkedInBy }
  }
  g.checkedInAt = new Date().toISOString()
  g.checkedInBy = device
  scans.unshift({ guestId: g.id, result: 'ok', device, at: g.checkedInAt })
  return { status: 'ok', guest: mini(g), checkedInAt: g.checkedInAt }
}

function previewHtml() {
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff;color:#04263f">
  <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#0a6fb8">${settings.edition} ${settings.subtitle}</p>
  <h1 style="font-size:24px;line-height:1.2;margin:8px 0 16px">${settings.title}</h1>
  <p>Caro(a) <b>Nome do Convidado</b>,</p>
  <p>Tem o prazer de o(a) convidar para a ${settings.edition} ${settings.subtitle}, a ${settings.date}, às ${settings.startTime}, em ${settings.venue}.</p>
  <div style="margin:24px auto;width:180px;height:180px;border:2px dashed #0a6fb8;display:flex;align-items:center;justify-content:center;color:#0a6fb8;font-weight:600">QR Code</div>
  <p style="font-size:13px;color:#55697a">Apresente este código à entrada. (Pré-visualização de demonstração.)</p>
</div>`
}

function route(method: string, path: string, body: any): Reply {
  const url = new URL(path, location.origin)
  const p = url.pathname
  const session = readSession()
  const isAdmin = session?.role === 'admin'
  const isDoor = Boolean(session)

  if (p === '/api/health') return ok({ ok: true })
  if (p === '/api/public/settings') return ok(settings)
  if (p.startsWith('/api/public/credential/')) {
    const t = decodeURIComponent(p.split('/').pop() ?? '')
    const g = guests.find((x) => x.token === t) ?? guests[0]
    return ok({ guest: mini(g), checkedIn: Boolean(g.checkedInAt), settings })
  }

  if (p === '/api/login' && method === 'POST') {
    if (String(body?.secret ?? '') !== SECRET)
      return fail(body?.role === 'admin' ? 'Palavra-passe incorrecta.' : 'PIN incorrecto.', 401)
    const role = body?.role === 'admin' ? 'admin' : 'door'
    const name = String(body?.name ?? '').trim().slice(0, 40) || (role === 'admin' ? 'Organização' : 'Entrada')
    const s: Session = { role, name }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    return ok(s)
  }
  if (p === '/api/logout') {
    sessionStorage.removeItem(SESSION_KEY)
    return ok({ ok: true })
  }
  if (p === '/api/session') return session ? ok(session) : fail('Sem sessão.', 401)

  if (!isDoor) return fail('Sessão expirada.', 401)

  if (p === '/api/scan' && method === 'POST') {
    const t = tokenFromQr(String(body?.code ?? ''))
    const g = t ? guests.find((x) => x.token === t) : undefined
    return ok(g ? checkIn(g, session!.name) : ({ status: 'invalid' } satisfies ScanResult))
  }
  if (p.startsWith('/api/checkin/') && method === 'POST') {
    const g = guests.find((x) => x.id === p.split('/').pop())
    return g ? ok(checkIn(g, session!.name)) : fail('Convidado inválido.')
  }
  if (p === '/api/door/search') {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    if (q.length < 2) return ok([])
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return ok(
      guests
        .filter((g) => fold(g.name).includes(fold(q)) || fold(g.organization ?? '').includes(fold(q)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 12)
        .map((g) => ({ id: g.id, ...mini(g), checkedInAt: g.checkedInAt })),
    )
  }
  if (p === '/api/door/stats') return ok({ total: guests.length, present: guests.filter((g) => g.checkedInAt).length })

  if (!isAdmin) return fail('Sem permissão.', 403)

  if (p === '/api/stats') {
    const perCategory = Object.fromEntries(
      CATEGORIES.map((cat) => {
        const list = guests.filter((g) => g.category === cat)
        return [
          cat,
          {
            total: list.length,
            present: list.filter((g) => g.checkedInAt).length,
            sent: list.filter((g) => g.inviteStatus === 'sent').length,
          },
        ]
      }),
    )
    const recent = scans
      .filter((s) => s.result === 'ok' || s.result === 'manual')
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8)
      .flatMap((s) => {
        const g = guests.find((x) => x.id === s.guestId)
        return g ? [{ name: g.name, category: g.category, at: s.at, device: s.device, result: s.result }] : []
      })
    return ok({
      total: guests.length,
      present: guests.filter((g) => g.checkedInAt).length,
      sent: guests.filter((g) => g.inviteStatus === 'sent').length,
      pending: guests.filter((g) => g.inviteStatus === 'pending').length,
      failed: guests.filter((g) => g.inviteStatus === 'failed').length,
      perCategory,
      recent,
      mail: { configured: true, from: 'convites@exemplo.ao' },
      job,
    })
  }

  if (p === '/api/guests' && method === 'GET') return ok([...guests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  if (p === '/api/guests' && method === 'POST') {
    const name = tidyName(body?.name)
    const email = normalizeEmail(body?.email)
    if (name.length < 2) return fail('Indique o nome completo.')
    if (guests.some((g) => g.email === email)) return fail('Já existe um convidado com este email.', 409)
    const g: Guest = {
      id: uuid(),
      name,
      email,
      category: body?.category ?? 'convidado',
      organization: String(body?.organization ?? '').trim() || null,
      token: token(),
      inviteStatus: 'pending',
      inviteSentAt: null,
      inviteError: null,
      checkedInAt: null,
      checkedInBy: null,
      createdAt: new Date().toISOString(),
    }
    guests.unshift(g)
    return ok(g, 201)
  }
  if (p === '/api/guests/import' && method === 'POST') {
    const checked = checkRows(body?.rows ?? [], body?.fallbackCategory ?? 'convidado', new Set(guests.map((g) => g.email)))
    const valid = checked.filter((r) => r.issues.length === 0)
    for (const r of valid)
      guests.unshift({
        id: uuid(),
        ...r.input,
        token: token(),
        inviteStatus: 'pending',
        inviteSentAt: null,
        inviteError: null,
        checkedInAt: null,
        checkedInBy: null,
        createdAt: new Date().toISOString(),
      })
    return ok({
      inserted: valid.length,
      skipped: checked.length - valid.length,
      issues: checked.filter((r) => r.issues.length).map((r) => ({ line: r.line, issues: r.issues })),
    })
  }
  const gm = p.match(/^\/api\/guests\/([^/]+)(?:\/(token|undo-checkin))?$/)
  if (gm) {
    const g = guests.find((x) => x.id === gm[1])
    if (!g) return fail('Convidado não encontrado.', 404)
    if (gm[2] === 'token') {
      Object.assign(g, { token: token(), inviteStatus: 'pending', inviteSentAt: null })
      return ok(g)
    }
    if (gm[2] === 'undo-checkin') {
      Object.assign(g, { checkedInAt: null, checkedInBy: null })
      return ok(g)
    }
    if (method === 'DELETE') {
      guests = guests.filter((x) => x.id !== g.id)
      return ok({ ok: true })
    }
    if (method === 'PATCH') {
      const email = normalizeEmail(body?.email)
      if (guests.some((x) => x.email === email && x.id !== g.id)) return fail('Já existe outro convidado com este email.', 409)
      Object.assign(g, {
        name: tidyName(body?.name),
        email,
        category: body?.category ?? g.category,
        organization: String(body?.organization ?? '').trim() || null,
        inviteStatus: email !== g.email ? 'pending' : g.inviteStatus,
      })
      return ok(g)
    }
  }

  if (p === '/api/settings' && method === 'GET') return ok(settings)
  if (p === '/api/settings' && method === 'PUT') {
    settings = { ...settings, ...body }
    return ok(settings)
  }

  if (p === '/api/invites/preview') return ok({ html: previewHtml() })
  if (p === '/api/invites/test') return ok({ ok: true })
  if (p === '/api/invites/job') return ok(job)
  if (p === '/api/invites/send' && method === 'POST') {
    const scope = body?.scope
    const targets =
      scope === 'ids' ? guests.filter((g) => (body?.ids ?? []).includes(g.id)) : guests.filter((g) => g.inviteStatus === scope)
    if (!targets.length) return fail('Não há convites para enviar.')
    const at = new Date().toISOString()
    for (const g of targets) Object.assign(g, { inviteStatus: 'sent', inviteSentAt: at, inviteError: null })
    job = { running: false, total: targets.length, done: targets.length, failed: 0, startedAt: at, finishedAt: at }
    return ok(job, 202)
  }

  return fail('Indisponível na demonstração.', 404)
}

/** Responde como o servidor responderia, com uma pequena espera para parecer real. */
export async function demoFetch(method: string, path: string, body?: unknown): Promise<Response> {
  await new Promise((r) => setTimeout(r, 180))
  const { status, data } = route(method, path, body)
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}
