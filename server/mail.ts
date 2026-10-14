import nodemailer, { type Transporter } from 'nodemailer'
import QRCode from 'qrcode'
import { CATEGORY_LABEL, type EventSettings, type Guest } from '../shared/guests.ts'
import { eventName, longDate, timeRange } from '../shared/format.ts'

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_SENDER_NAME } = process.env

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

export function inviteHtml(guest: MailGuest, s: EventSettings, link: string) {
  const where = [s.venue, s.room].filter(Boolean).join(' · ')
  const font = "font-family:Montserrat,'Helvetica Neue',Arial,sans-serif"
  return `<!doctype html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Convite</title></head>
<body style="margin:0;padding:0;background:#eaf3fa">
<div style="display:none;max-height:0;overflow:hidden">A sua credencial com QR Code para ${esc(eventName(s))}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf3fa">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
  <tr><td style="background:#1c8fd0;background-image:linear-gradient(165deg,#35b7ea 0%,#1a86cc 55%,#0f5f9e 100%);padding:32px 28px 28px;${font};color:#ffffff">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.9">${esc(s.organizer)}</div>
    <div style="margin-top:18px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${esc(`${s.edition} ${s.subtitle} sobre`)}</div>
    <div style="margin-top:6px;font-size:28px;line-height:1.05;font-weight:800;text-transform:uppercase">${esc(s.title)}</div>
    <div style="margin-top:20px;height:1px;background:rgba(255,255,255,.45)"></div>
    <div style="margin-top:16px;font-size:14px;font-weight:700">${esc(longDate(s.date))}</div>
    <div style="margin-top:2px;font-size:14px">${esc(timeRange(s.startTime, s.endTime))}${where ? ` · ${esc(where)}` : ''}</div>
  </td></tr>
  <tr><td style="padding:28px 28px 8px;${font};color:#12304a">
    <p style="margin:0 0 6px;font-size:15px">Caro(a) <strong>${esc(guest.name)}</strong>,</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#3b556c">Temos o prazer de o(a) convidar para a ${esc(eventName(s))}. Apresente o QR Code abaixo à entrada — no telemóvel ou impresso — para a sua acreditação.</p>
  </td></tr>
  <tr><td align="center" style="padding:20px 28px 8px">
    <img src="cid:qr" width="240" height="240" alt="QR Code de acesso" style="display:block;width:240px;height:240px;border:0">
  </td></tr>
  <tr><td align="center" style="padding:4px 28px 0;${font}">
    <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#e3f2fb;color:#0f5f9e;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${esc(CATEGORY_LABEL[guest.category])}</span>
  </td></tr>
  <tr><td align="center" style="padding:24px 28px 8px;${font}">
    <a href="${esc(link)}" style="display:inline-block;background:#1176bf;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 26px;border-radius:10px">Abrir credencial digital</a>
  </td></tr>
  <tr><td style="padding:16px 28px 28px;${font};font-size:12px;line-height:1.6;color:#6b8296">
    A credencial é pessoal e intransmissível. Se não conseguir ver a imagem, use o botão acima.${s.contactEmail ? ` Dúvidas: <a href="mailto:${esc(s.contactEmail)}" style="color:#1176bf">${esc(s.contactEmail)}</a>.` : ''}
  </td></tr>
</table>
</td></tr></table></body></html>`
}

function inviteText(guest: MailGuest, s: EventSettings, link: string) {
  const where = [s.venue, s.room].filter(Boolean).join(', ')
  return [
    `Caro(a) ${guest.name},`,
    '',
    `Temos o prazer de o(a) convidar para a ${eventName(s)}.`,
    `${longDate(s.date)}, ${timeRange(s.startTime, s.endTime)}${where ? ` — ${where}` : ''}.`,
    '',
    `Categoria: ${CATEGORY_LABEL[guest.category]}`,
    `A sua credencial digital (QR Code de acesso): ${link}`,
    '',
    'A credencial é pessoal e intransmissível.',
  ].join('\n')
}

export async function sendInvite(guest: MailGuest, s: EventSettings, baseUrl: string, to = guest.email) {
  const link = credentialUrl(baseUrl, guest.token)
  const png = await qrPng(link)
  await transport().sendMail({
    from: SMTP_SENDER_NAME ? { name: SMTP_SENDER_NAME, address: SMTP_FROM! } : SMTP_FROM,
    to,
    subject: `Convite · ${s.edition} ${s.subtitle} sobre ${s.title}`,
    text: inviteText(guest, s, link),
    html: inviteHtml(guest, s, link),
    attachments: [{ filename: 'credencial-qr.png', content: png, cid: 'qr', contentType: 'image/png' }],
  })
}
