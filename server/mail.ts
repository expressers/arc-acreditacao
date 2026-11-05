import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer, { type Transporter } from 'nodemailer'
import QRCode from 'qrcode'
import type { EventSettings, Guest } from '../shared/guests.ts'
import { dayMonthYear, eventName } from '../shared/format.ts'
import { EVENT_COPY as C } from '../shared/event-copy.ts'

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_SENDER_NAME, MAIL_CC, MAIL_BCC, MAIL_REPLY_TO } =
  process.env

/** Lista de emails separados por vírgula (ex.: MAIL_CC=a@x.ao,b@y.ao). */
const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
export const mailCc = list(MAIL_CC)
export const mailBcc = list(MAIL_BCC)
export const mailReplyTo = list(MAIL_REPLY_TO)



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

/** Página onde o convidado confirma a presença (e depois vê o QR). */
export function confirmUrl(base: string, token: string) {
  return `${base.replace(/\/$/, '')}/confirmar/${token}`
}

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
  'i-mail-blue.png',
  'i-phone-blue.png',
  'i-globe-blue.png',
] as const
type ImgSrc = (name: string) => string
export const cidSrc: ImgSrc = (name) => `cid:${name}`

/** Para pré-visualizar no browser: as mesmas imagens, mas embutidas em data URLs. */
export const dataSrc: ImgSrc = (name) => {
  const a = emailAttachments().find((x) => x.cid === name)
  return a ? `data:${a.contentType};base64,${a.content.toString('base64')}` : ''
}

let assetCache: { filename: string; content: Buffer; cid: string; contentType: string }[] | null = null
function emailAttachments() {
  if (!assetCache) {
    const dir = ['dist/email', 'public/email'].map((d) => join(process.cwd(), d)).find((d) => EMAIL_ASSETS.every((n) => existsSync(join(d, n))))
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
  const program = `${new URL(link).origin}${C.programPath}`
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
        <img src="${img('convite-banner.jpg')}" width="580" alt="Autoridade Reguladora da Concorrência (ARC) — Convite" style="display:block;width:100%;max-width:580px;height:auto;border:0;border-radius:12px;${FONT};font-size:24px;font-weight:800;color:#ffffff">
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
      <tr><td class="px" align="center" style="padding:14px 22px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="border:2px solid ${BLUE};border-radius:10px">
          <a href="${esc(program)}" style="display:block;padding:12px 18px;${FONT};font-size:14px;font-weight:700;color:${BLUE};text-decoration:none">Descarregar o programa do evento (PDF)</a>
        </td></tr></table>
      </td></tr>
      <tr><td class="px" style="padding:16px 22px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${LIGHT}" style="background:${LIGHT};border-radius:12px"><tr><td style="padding:24px 22px 26px;${FONT}">
          <p style="margin:0;font-size:21px;font-weight:800;color:${NAVY}">Confirmação de presença</p>
          <p style="margin:8px 0 0;font-size:14px;line-height:1.55;color:#5b6b80">${esc(C.rsvpText)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr><td bgcolor="${BLUE}" style="border-radius:10px">
            <a href="${esc(link)}" style="display:inline-block;padding:14px 40px;${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">Confirmar</a>
          </td></tr></table>
          <p style="margin:14px 0 0;font-size:13px;line-height:1.55;color:#5b6b80">Pode confirmar os seus dados, corrigi-los ou indicar um representante. Depois de confirmar, fica disponível a sua credencial com o QR Code de entrada.</p>
        </td></tr></table>
      </td></tr>
      <tr><td class="px" style="padding:24px 32px 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #c5def3"><tr>
          <td style="padding-top:16px;${FONT};font-size:14px;font-weight:700;color:${NAVY}">${esc(s.organizer)}</td>
        </tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="stack" style="margin-top:8px"><tr>
          <td style="padding:6px 14px 6px 0;${FONT};font-size:13px;font-weight:600;white-space:nowrap">
            <a href="mailto:${esc(C.rsvpEmail)}" style="color:${BLUE};text-decoration:none">${ico('i-mail-blue.png', 18).replace('display:block;', 'display:inline-block;vertical-align:-4px;margin-right:7px;')}${esc(C.rsvpEmail)}</a>
          </td>
          <td style="padding:6px 14px 6px 0;${FONT};font-size:13px;font-weight:600;white-space:nowrap">
            <a href="tel:${esc(C.rsvpPhoneHref)}" style="color:${BLUE};text-decoration:none">${ico('i-phone-blue.png', 18).replace('display:block;', 'display:inline-block;vertical-align:-4px;margin-right:7px;')}${esc(C.rsvpPhone)}</a>
          </td>
          <td style="padding:6px 0;${FONT};font-size:13px;font-weight:600;white-space:nowrap">
            <a href="https://${esc(C.website)}" style="color:${BLUE};text-decoration:none">${ico('i-globe-blue.png', 18).replace('display:block;', 'display:inline-block;vertical-align:-4px;margin-right:7px;')}${esc(C.website)}</a>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
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
    `Programa do evento (PDF): ${new URL(link).origin}${C.programPath}`,
    '',
    'Confirmação de presença',
    C.rsvpText,
    `Confirmar: ${link}`,
    'Pode confirmar os seus dados, corrigi-los ou indicar um representante. Depois de confirmar, fica disponível a sua credencial com o QR Code de entrada.',
    '',
    s.organizer,
    `${C.rsvpEmail} · ${C.rsvpPhone} · ${C.website}`,
  ].join('\n')
}

export async function sendInvite(guest: MailGuest, s: EventSettings, baseUrl: string, to = guest.email) {
  if (!to) throw new Error('Convidado sem email.')
  const link = confirmUrl(baseUrl, guest.token)
  const message = {
    from: SMTP_SENDER_NAME ? { name: SMTP_SENDER_NAME, address: SMTP_FROM! } : SMTP_FROM,
    ...(mailReplyTo.length ? { replyTo: mailReplyTo } : {}),
    subject: `Convite · ${s.edition} ${s.subtitle} sobre ${s.title}`,
    text: inviteText(guest, s, link),
    html: inviteHtml(guest, s, link),
    attachments: emailAttachments(),
  }
  await transport().sendMail({ ...message, to, ...(mailCc.length ? { cc: mailCc } : {}) })
  // As cópias de acompanhamento seguem numa mensagem à parte: em BCC o convidado ficava no "Para"
  // e um "Responder a todos" na cópia chegava-lhe. Uma falha na cópia não invalida o convite.
  if (mailBcc.length) {
    await transport()
      .sendMail({ ...message, to: mailBcc })
      .catch((err) => console.error('[mail] cópia de acompanhamento falhou:', err instanceof Error ? err.message : err))
  }
}
