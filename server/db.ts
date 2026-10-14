import postgres from 'postgres'
import type { EventSettings, Guest } from '../shared/guests.ts'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL não definido')

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url)

export const sql = postgres(url, {
  max: 8,
  idle_timeout: 30,
  ssl: isLocal ? false : 'require',
  transform: { undefined: null },
  onnotice: () => {},
})

export const DEFAULT_SETTINGS: EventSettings = {
  edition: 'VII',
  title: 'Concorrência e Regulação Económica em Angola',
  subtitle: 'Conferência Anual',
  date: '2026-11-13',
  startTime: '09:00',
  endTime: '14:30',
  venue: 'Local a confirmar',
  room: '',
  organizer: 'Autoridade Reguladora da Concorrência',
  contactEmail: '',
}

export async function migrate() {
  await sql`create extension if not exists pgcrypto`
  await sql`
    create table if not exists guests (
      id uuid primary key default gen_random_uuid(),
      name text not null check (char_length(name) between 2 and 120),
      email text not null check (char_length(email) <= 254),
      category text not null check (category in ('convidado', 'orador', 'imprensa')),
      organization text check (organization is null or char_length(organization) <= 120),
      token text not null unique,
      invite_status text not null default 'pending' check (invite_status in ('pending', 'sent', 'failed')),
      invite_sent_at timestamptz,
      invite_error text,
      checked_in_at timestamptz,
      checked_in_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`
  await sql`create unique index if not exists guests_email_key on guests (lower(email))`
  await sql`create index if not exists guests_checked_in_idx on guests (checked_in_at desc nulls last)`
  await sql`
    create table if not exists scans (
      id bigserial primary key,
      guest_id uuid references guests(id) on delete set null,
      result text not null check (result in ('ok', 'duplicate', 'invalid', 'manual', 'undo')),
      device text,
      at timestamptz not null default now()
    )`
  await sql`create index if not exists scans_at_idx on scans (at desc)`
  await sql`
    create table if not exists settings (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    )`
}

type GuestRow = {
  id: string
  name: string
  email: string
  category: Guest['category']
  organization: string | null
  token: string
  invite_status: Guest['inviteStatus']
  invite_sent_at: Date | null
  invite_error: string | null
  checked_in_at: Date | null
  checked_in_by: string | null
  created_at: Date
}

export const GUEST_COLUMNS = sql`id, name, email, category, organization, token, invite_status,
  invite_sent_at, invite_error, checked_in_at, checked_in_by, created_at`

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export function toGuest(r: GuestRow): Guest {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    category: r.category,
    organization: r.organization,
    token: r.token,
    inviteStatus: r.invite_status,
    inviteSentAt: iso(r.invite_sent_at),
    inviteError: r.invite_error,
    checkedInAt: iso(r.checked_in_at),
    checkedInBy: r.checked_in_by,
    createdAt: r.created_at.toISOString(),
  }
}

export type { GuestRow }

export async function getSettings(): Promise<EventSettings> {
  const rows = await sql<{ value: Partial<EventSettings> }[]>`select value from settings where key = 'event'`
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.value ?? {}) }
}

export async function saveSettings(value: EventSettings) {
  await sql`
    insert into settings (key, value) values ('event', ${sql.json(value as unknown as postgres.JSONValue)})
    on conflict (key) do update set value = excluded.value, updated_at = now()`
}
