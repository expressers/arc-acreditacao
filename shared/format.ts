const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

function parts(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

/** "Sexta-feira, 13 de Novembro de 2026" */
export function longDate(isoDate: string) {
  const p = parts(isoDate)
  if (!p) return isoDate
  return `${WEEKDAYS[p.wd]}, ${p.d} de ${MONTHS[p.m - 1]} de ${p.y}`
}

/** { day: "13", month: "NOV" } para o bloco de data do key visual */
export function dateBlock(isoDate: string) {
  const p = parts(isoDate)
  if (!p) return { day: '--', month: '---' }
  return { day: String(p.d), month: MONTHS[p.m - 1].slice(0, 3).toUpperCase() }
}

export function timeRange(start: string, end: string) {
  const f = (t: string) => t.replace(':', 'H:')
  return end ? `${f(start)} – ${f(end)}` : f(start)
}

/** Hora em Luanda, independentemente do fuso do dispositivo/servidor. */
export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Luanda',
  })
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Luanda',
  })
}

export function eventName(s: { edition: string; subtitle: string; title: string }) {
  return `${s.edition} ${s.subtitle} sobre ${s.title}`.trim()
}
