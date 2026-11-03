import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer, { type Transporter } from 'nodemailer'
import QRCode from 'qrcode'
import { CATEGORY_LABEL, type EventSettings, type Guest } from '../shared/guests.ts'
import { dayMonthYear, eventName } from '../shared/format.ts'
import { EVENT_COPY as C } from '../shared/event-copy.ts'

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_SENDER_NAME, MAIL_CC, MAIL_BCC, MAIL_REPLY_TO, MAIL_CONTACTS } =
  process.env

/** Lista de emails separados por vírgula (ex.: MAIL_CC=a@x.ao,b@y.ao). */
const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
export const mailCc = list(MAIL_CC)
export const mailBcc = list(MAIL_BCC)
export const mailReplyTo = list(MAIL_REPLY_TO)
/** Emails de contacto da organização mostrados na nota do rodapé. */
const contacts = list(MAIL_CONTACTS ?? 'eventos.arc@minfin.gov.ao,dac.arc@minfin.gov.ao')

const joinPt = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ou ${xs[xs.length - 1]}` : xs[0] ?? '')

/** Nota de que o remetente não recebe mensagens, com os contactos da organização. */
function noReplyNote(html: boolean, organizer: string) {
  const org = organizer ? `a ${organizer}` : 'a organização'
  const from = SMTP_FROM ?? 'o email da plataforma'
  if (!contacts.length) return ''
  if (!html)
    return `Nota: O email ${from} destina-se apenas a envios da plataforma e não recebe mensagens. Para qualquer dúvida ou questão, contacte directamente ${org} através de ${joinPt(contacts)}.`
  const links = contacts.map((e) => `<a href="mailto:${esc(e)}" style="color:#1176bf">${esc(e)}</a>`)
  const joined = links.length > 1 ? `${links.slice(0, -1).join(', ')} ou ${links[links.length - 1]}` : links[0]
  return `<strong>Nota:</strong> O email ${esc(from)} destina-se apenas a envios da plataforma e não recebe mensagens. Para qualquer dúvida ou questão, contacte directamente ${esc(org)} através de ${joined}.`
}

export const mailConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASSWORD && SMTP_FROM)
export const mailFrom = SMTP_FROM ?? null

let transporter: Transporter | null = null
function transport() {
  if (!mailConfigured) throw new Error('Envio de email não configurado (variáveis SMTP em falta).')
  if (!transporter) {
    const port = Number(SMTP_PORT)
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      tls: { minVersion: 'TLSv1.2' },
      pool: true,
      maxConnections: 2,
    })
  }
  return transporter
}

const esc = (v: string) =>
  v.replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch] ?? ch)

export function credentialUrl(base: string, token: string) {
  return `${base.replace(/\/$/, '')}/c/${token}`
}

export async function qrPng(text: string) {
  return QRCode.toBuffer(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 560,
    color: { dark: '#0b2a45', light: '#ffffff' },
  })
}

type MailGuest = Pick<Guest, 'name' | 'email' | 'category' | 'organization' | 'token'>

/**
 * Imagens do email (banner e ícones). Vão embutidas na mensagem (CID), como o QR:
 * muitos clientes (Outlook, webmails) bloqueiam imagens externas por omissão.
 */
const EMAIL_ASSETS = [
  'convite-banner.jpg',
  'i-calendar-white.png',
  'i-pin-blue.png',
  'i-clock-blue.png',
  'i-mail-white.png',
  'i-phone-white.png',
  'i-globe-blue.png',
] as const
type ImgSrc = (name: string) => string
export const cidSrc: ImgSrc = (name) => `cid:${name}`

let assetCache: { filename: string; content: Buffer; cid: string; contentType: string }[] | null = null
function emailAttachments() {
  if (!assetCache) {
    const dir = ['dist/email', 'public/email'].map((d) => join(process.cwd(), d)).find((d) => existsSync(d))
    if (!dir) throw new Error('Imagens do email não encontradas (dist/email ou public/email).')
    assetCache = EMAIL_ASSETS.map((name) => ({
      filename: name,
      content: readFileSync(join(dir, name)),
      cid: name,
      contentType: name.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
    }))
  }
  return assetCache
}

const NAVY = '#044a98'
const BLUE = '#0a5fc4'
const INK = '#2b3d55'
const LIGHT = '#e8f5fd'
const FONT = "font-family:Montserrat,'Helvetica Neue',Helvetica,Arial,sans-serif"

export function inviteHtml(guest: MailGuest, s: EventSettings, link: string, img: ImgSrc = cidSrc) {
  const date = dayMonthYear(s.date)
  const note = noReplyNote(true, s.organizer)
  const ico = (n: string, size = 22) =>
    `<img src="${img(n)}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border:0">`
  return `<!doctype html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>Convite · ${esc(eventName(s))}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @media (max-width:620px){
    .card{border-radius:0!important}
    .px{padding-left:20px!important;padding-right:20px!important}
    .h1{font-size:25px!important;line-height:1.15!important}
    .h2{font-size:18px!important}
    .stack>tbody>tr>td{display:block!important;width:100%!important;box-sizing:border-box}
    .fl{text-align:left!important;padding-top:8px!important}
    .sep{display:none!important}
    .datecell{border-radius:12px 12px 0 0!important}
    .venuecell{border-radius:0 0 12px 12px!important}
  }
</style></head>
<body style="margin:0;padding:0;background:#f0f1f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(C.invitation)} A sua credencial com QR Code segue neste email.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f1f5">
<tr><td align="center" style="padding:20px 10px 32px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
  <tr><td class="px" style="padding:4px 12px 14px;${FONT};font-size:13px;font-weight:700;color:#3a4657;border-bottom:1px solid #dde2ea">Convite para a ${esc(eventName(s).replace(/ em Angola$/, ''))}</td></tr>
  <tr><td style="height:18px;line-height:18px">&nbsp;</td></tr>
  <tr><td class="card" style="background:#ffffff;border-radius:16px;padding:10px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="border-radius:12px;overflow:hidden;background:#14abcd">
        <img src="${img('convite-banner.jpg')}" width="580" alt="ARC · Autoridade Reguladora da Concorrência — Convite" style="display:block;width:100%;max-width:580px;height:auto;border:0;border-radius:12px;${FONT};font-size:24px;font-weight:800;color:#ffffff">
      </td></tr>
      <tr><td class="px" style="padding:30px 32px 0;${FONT}">
        <h1 class="h1" style="margin:0;font-size:31px;line-height:1.12;font-weight:800;color:${NAVY};letter-spacing:-0.3px">${esc(eventName(s))}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 16px"><tr>
          <td style="width:72px;height:4px;background:#14abcd;border-radius:2px;font-size:0;line-height:0">&nbsp;</td>
          <td style="width:14px;font-size:0">&nbsp;</td>
          <td style="width:34px;height:4px;background:#8ddff0;border-radius:2px;font-size:0;line-height:0">&nbsp;</td>
        </tr></table>
        <h2 class="h2" style="margin:0;font-size:21px;line-height:1.25;font-weight:800;color:${BLUE}">${esc(C.theme)}</h2>
        <p style="margin:20px 0 0;font-size:15px;line-height:1.6;color:${INK}">Exmo(a). Senhor(a) <strong style="color:${NAVY}">${esc(guest.name)}</strong>${guest.organization ? `<br><span style="color:#6b7a90">${esc(guest.organization)}</span>` : ''}</p>
        <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:${INK}">${esc(C.invitation)}</p>
        <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:${INK}">${esc(C.about)}</p>
      </td></tr>
      <tr><td class="px" style="padding:26px 22px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="stack"><tr>
          <td class="datecell" width="44%" valign="middle" bgcolor="#0a8fd2" style="background-color:#0a8fd2;background-image:linear-gradient(110deg,#0a87d2 0%,#14abcd 100%);border-radius:12px 0 0 12px;padding:22px 20px">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td valign="middle" style="padding-right:14px">${ico('i-calendar-white.png', 34)}</td>
              <td valign="middle" style="${FONT};font-size:19px;line-height:1.2;font-weight:800;color:#ffffff">${esc(date)}</td>
            </tr></table>
          </td>
          <td class="venuecell" valign="middle" bgcolor="${LIGHT}" style="background:${LIGHT};border-radius:0 12px 12px 0;padding:14px 18px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td valign="top" width="30" style="padding:2px 10px 12px 0">${ico('i-pin-blue.png')}</td>
                <td style="${FONT};font-size:14px;line-height:1.4;color:${BLUE};padding-bottom:12px;border-bottom:1px solid #c5def3"><strong style="color:${NAVY}">${esc(C.venueShort)}</strong> — ${esc(C.venueLong)}</td></tr>
              <tr><td valign="top" width="30" style="padding:12px 10px 0 0">${ico('i-clock-blue.png')}</td>
                <td style="${FONT};font-size:14px;line-height:1.4;color:${BLUE};padding-top:12px">Recepção e registo: <strong style="color:${NAVY}">${esc(C.receptionTime)}</strong> | Início da sessão: <strong style="color:${NAVY}">${esc(C.sessionTime)}</strong></td></tr>
            </table>
          </td>
        </tr></table>
      </td></tr>
      <tr><td class="px" style="padding:16px 22px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${LIGHT};border-radius:12px"><tr><td align="center" style="padding:24px 20px 26px;${FONT}">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#14abcd">Credencial de acesso</p>
          <p style="margin:6px 0 0;font-size:18px;font-weight:800;color:${NAVY}">${esc(guest.name)}</p>
          <img src="cid:qr" width="210" height="210" alt="QR Code de acesso" style="display:block;margin:16px auto 0;width:210px;height:210px;border:0">
          <span style="display:inline-block;margin-top:14px;padding:6px 14px;border-radius:999px;background:${LIGHT};color:${BLUE};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${esc(CATEGORY_LABEL[guest.category])}</span>
          <p style="margin:14px auto 0;max-width:380px;font-size:13px;line-height:1.55;color:#5b6b80">Apresente este QR Code à entrada — no telemóvel ou impresso. A credencial é pessoal e intransmissível.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto 0"><tr><td bgcolor="${BLUE}" style="border-radius:10px">
            <a href="${esc(link)}" style="display:inline-block;padding:13px 26px;${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">Abrir credencial digital</a>
          </td></tr></table>
        </td></tr></table>
      </td></tr>
      <tr><td class="px" style="padding:16px 22px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${LIGHT}" style="background:${LIGHT};border-radius:12px"><tr><td style="padding:22px 22px 24px;${FONT}">
          <p style="margin:0;font-size:21px;font-weight:800;color:${NAVY}">Confirmação de presença</p>
          <p style="margin:8px 0 0;font-size:14px;line-height:1.55;color:#5b6b80">${esc(C.rsvpText)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px" class="stack"><tr>
            <td valign="middle" style="padding:0 0 10px">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${BLUE}" style="border-radius:8px">
                <a href="mailto:${esc(C.rsvpEmail)}" style="display:block;padding:11px 18px;${FONT};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">
                  <img src="${img('i-mail-white.png')}" width="18" height="18" alt="" style="vertical-align:-3px;margin-right:10px;border:0">${esc(C.rsvpEmail)}</a>
              </td></tr></table>
            </td>
            <td valign="middle" style="padding:0 0 10px;${FONT}">
              <a href="tel:${esc(C.rsvpPhoneHref)}" style="font-size:16px;font-weight:700;color:${BLUE};text-decoration:none;white-space:nowrap">
                <span style="display:inline-block;width:32px;height:32px;border-radius:16px;background:${BLUE};text-align:center;vertical-align:middle;margin-right:8px"><img src="${img('i-phone-white.png')}" width="16" height="16" alt="" style="margin-top:8px;border:0"></span>${esc(C.rsvpPhone)}</a>
            </td>
          </tr></table>
        </td></tr></table>
      </td></tr>
      <tr><td class="px" style="padding:22px 32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #c5def3" class="stack"><tr>
          <td style="padding-top:16px;${FONT};font-size:14px;font-weight:700;color:${NAVY}">${esc(s.organizer)}</td>
          <td align="right" class="fl" style="padding-top:16px;${FONT};font-size:14px;font-weight:600;white-space:nowrap">
            <a href="https://${esc(C.website)}" style="color:${BLUE};text-decoration:none"><img src="${img('i-globe-blue.png')}" width="20" height="20" alt="" style="vertical-align:-5px;margin-right:8px;border:0">${esc(C.website)}</a>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
  ${note ? `<tr><td class="px" style="padding:18px 14px 0;${FONT};font-size:12px;line-height:1.6;color:#6b7a90">${note}</td></tr>` : ''}
</table>
</td></tr></table></body></html>`
}

function inviteText(guest: MailGuest, s: EventSettings, link: string) {
  return [
    `Exmo(a). Senhor(a) ${guest.name},`,
    '',
    eventName(s),
    C.theme,
    '',
    C.invitation,
    '',
    C.about,
    '',
    `Data: ${dayMonthYear(s.date)}`,
    `Local: ${C.venueShort} — ${C.venueLong}`,
    `Recepção e registo: ${C.receptionTime} | Início da sessão: ${C.sessionTime}`,
    '',
    `Categoria: ${CATEGORY_LABEL[guest.category]}`,
    `A sua credencial digital (QR Code de acesso): ${link}`,
    'A credencial é pessoal e intransmissível.',
    '',
    'Confirmação de presença',
    C.rsvpText,
    `${C.rsvpEmail} · ${C.rsvpPhone}`,
    '',
    `${s.organizer} · ${C.website}`,
    ...(noReplyNote(false, s.organizer) ? ['', noReplyNote(false, s.organizer)] : []),
  ].join('\n')
}

export async function sendInvite(guest: MailGuest, s: EventSettings, baseUrl: string, to = guest.email) {
  const link = credentialUrl(baseUrl, guest.token)
  const png = await qrPng(link)
  await transport().sendMail({
    from: SMTP_SENDER_NAME ? { name: SMTP_SENDER_NAME, address: SMTP_FROM! } : SMTP_FROM,
    to,
    ...(mailCc.length ? { cc: mailCc } : {}),
    ...(mailBcc.length ? { bcc: mailBcc } : {}),
    ...(mailReplyTo.length ? { replyTo: mailReplyTo } : {}),
    subject: `Convite · ${s.edition} ${s.subtitle} sobre ${s.title}`,
    text: inviteText(guest, s, link),
    html: inviteHtml(guest, s, link),
    attachments: [{ filename: 'credencial-qr.png', content: png, cid: 'qr', contentType: 'image/png' }, ...emailAttachments()],
  })
}
