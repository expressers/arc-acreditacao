import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
  Check,
  CircleAlert,
  Clock,
  Copy,
  Download,
  LogIn,
  MailCheck,
  MailX,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Share2,
  Trash2,
  Undo2,
  UserPlus,
  X,
} from 'lucide-react'
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_PLURAL, type Category, type Guest, type ScanResult } from '@shared/guests'
import { clock, dateTime } from '@shared/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { CategoryBadge, QrImage, credentialLink } from '@/components/brand'
import { ConfirmDialog } from '@/components/confirm'
import { GuestForm } from '@/components/guest-form'
import { api, errorMessage } from '@/lib/api'
import { useApi, useDebounced } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { PageTitle } from './layout'

type StatusFilter = 'todos' | 'confirmados' | 'por-confirmar' | 'presentes' | 'ausentes' | 'por-enviar' | 'falhados' | 'sem-email'
const STATUS_GROUPS: { label: string; items: { value: Exclude<StatusFilter, 'todos'>; label: string }[] }[] = [
  { label: 'Confirmação', items: [{ value: 'confirmados', label: 'Confirmados' }, { value: 'por-confirmar', label: 'Por confirmar' }] },
  { label: 'Presença no dia', items: [{ value: 'presentes', label: 'Presentes' }, { value: 'ausentes', label: 'Ausentes' }] },
  {
    label: 'Convite',
    items: [
      { value: 'por-enviar', label: 'Por enviar' },
      { value: 'falhados', label: 'Envio falhou' },
      { value: 'sem-email', label: 'Sem email' },
    ],
  },
]

function matchesStatus(g: Guest, status: StatusFilter) {
  switch (status) {
    case 'confirmados': return !!g.confirmedAt
    case 'por-confirmar': return !g.confirmedAt
    case 'presentes': return !!g.checkedInAt
    case 'ausentes': return !g.checkedInAt
    case 'por-enviar': return g.inviteStatus === 'pending' && !!g.email
    case 'falhados': return g.inviteStatus === 'failed'
    case 'sem-email': return !g.email
    default: return true
  }
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

async function exportXlsx(guests: Guest[]) {
  const XLSX = await import('xlsx')
  const rows = guests.map((g) => ({
    Nome: g.name,
    Email: g.email ?? '',
    Categoria: CATEGORY_LABEL[g.category],
    Instituição: g.organization ?? '',
    Cargo: g.position ?? '',
    'Presença confirmada': g.confirmedAt ? dateTime(g.confirmedAt) : '',
    Convite: !g.email ? 'Sem email' : g.inviteStatus === 'sent' ? 'Enviado' : g.inviteStatus === 'failed' ? 'Falhou' : 'Por enviar',
    'Entrada às': g.checkedInAt ? dateTime(g.checkedInAt) : '',
    Posto: g.checkedInBy ?? '',
    'Link da credencial': credentialLink(g.token),
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 32 }, { wch: 30 }, { wch: 12 }, { wch: 26 }, { wch: 24 }, { wch: 18 }, { wch: 11 }, { wch: 14 }, { wch: 16 }, { wch: 52 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Convidados')
  XLSX.writeFile(wb, `acreditacao-convidados-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export default function GuestsPage() {
  const { data, loading, reload, setData } = useApi<Guest[]>('/api/guests', 15_000)
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 150)
  const [cat, setCat] = useState<Category | 'todas'>('todas')
  const [status, setStatus] = useState<StatusFilter>('todos')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Guest | 'new' | null>(params.get('novo') ? 'new' : null)

  const guests = data ?? []
  const inCategory = useMemo(() => (cat === 'todas' ? guests : guests.filter((g) => g.category === cat)), [guests, cat])
  const statusCount = useMemo(() => {
    const counts = {} as Record<StatusFilter, number>
    for (const group of STATUS_GROUPS) for (const it of group.items) counts[it.value] = inCategory.filter((g) => matchesStatus(g, it.value)).length
    counts.todos = inCategory.length
    return counts
  }, [inCategory])
  const filtered = useMemo(() => {
    const needle = fold(dq.trim())
    return inCategory.filter((g) => {
      if (!matchesStatus(g, status)) return false
      if (!needle) return true
      return fold(`${g.name} ${g.email ?? ''} ${g.organization ?? ''} ${g.position ?? ''}`).includes(needle)
    })
  }, [inCategory, dq, status])
  const filtersActive = cat !== 'todas' || status !== 'todos'

  const open = guests.find((g) => g.id === openId) ?? null
  const upsert = (g: Guest) => setData((list) => (list ? (list.some((x) => x.id === g.id) ? list.map((x) => (x.id === g.id ? g : x)) : [g, ...list]) : [g]))

  return (
    <>
      <PageTitle
        title="Convidados"
        description={data ? `${guests.length} na lista · ${guests.filter((g) => g.confirmedAt).length} confirmados · ${guests.filter((g) => g.checkedInAt).length} presentes` : undefined}
        actions={
          <>
            <Button variant="outline" className="h-10" disabled={!filtered.length} onClick={() => void exportXlsx(filtered)}>
              <Download className="size-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
            <Button className="h-10" onClick={() => setEditing('new')}>
              <UserPlus className="size-4" /> Adicionar
            </Button>
          </>
        }
      />

      <div className="sticky top-[calc(max(env(safe-area-inset-top),0.5rem)+3.25rem)] z-20 -mx-4 space-y-2.5 bg-background/95 px-4 pb-3 backdrop-blur-md md:static md:mx-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar nome, email ou instituição" className="h-11 pl-10 text-base md:text-sm" />
          {q && (
            <button aria-label="Limpar pesquisa" onClick={() => setQ('')} className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={cat} onValueChange={(v) => setCat(v as Category | 'todas')}>
            <SelectTrigger aria-label="Categoria" className="h-10 min-w-0 flex-1 bg-card sm:flex-none sm:min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="todas">Todas as categorias</SelectItem>
              <SelectSeparator />
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_PLURAL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger aria-label="Estado" className="h-10 min-w-0 flex-1 bg-card sm:flex-none sm:min-w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="min-w-56">
              <SelectItem value="todos">
                <span>Todos os estados</span>
                <Count n={statusCount.todos} />
              </SelectItem>
              {STATUS_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectSeparator />
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.items.map((it) => (
                    <SelectItem key={it.value} value={it.value}>
                      <span>{it.label}</span>
                      <Count n={statusCount[it.value]} />
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              variant="ghost"
              className="h-10 px-3 text-muted-foreground"
              onClick={() => {
                setCat('todas')
                setStatus('todos')
              }}
            >
              <X className="size-4" /> Limpar
            </Button>
          )}
          {data && (filtersActive || dq.trim()) && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed py-14 text-center text-sm text-muted-foreground">
          {guests.length ? 'Nenhum convidado corresponde aos filtros.' : 'Ainda não há convidados. Importe o Excel ou adicione à mão.'}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {filtered.map((g) => (
            <li key={g.id}>
              <button onClick={() => setOpenId(g.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{g.organization ?? g.email ?? 'Sem email'}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <CategoryBadge category={g.category} />
                  <StatusLine g={g} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Drawer open={Boolean(open)} onOpenChange={(o) => !o && setOpenId(null)}>
        <DrawerContent className="mx-auto max-h-[92dvh] md:max-w-lg">
          {open && (
            <GuestDetails
              g={open}
              onChange={upsert}
              onEdit={() => {
                setEditing(open)
                setOpenId(null)
              }}
              onDeleted={() => {
                setData((l) => l?.filter((x) => x.id !== open.id) ?? l)
                setOpenId(null)
              }}
            />
          )}
        </DrawerContent>
      </Drawer>

      <Drawer
        open={Boolean(editing)}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null)
            if (params.get('novo')) setParams({}, { replace: true })
          }
        }}
      >
        <DrawerContent className="mx-auto max-h-[92dvh] md:max-w-lg">
          <DrawerHeader className="text-left">
            <DrawerTitle>{editing === 'new' ? 'Novo convidado' : 'Editar convidado'}</DrawerTitle>
            <DrawerDescription>Recebe uma credencial com QR Code próprio.</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            {editing && (
              <GuestForm
                guest={editing === 'new' ? undefined : editing}
                onSaved={(g) => {
                  upsert(g)
                  toast.success(editing === 'new' ? 'Convidado adicionado.' : 'Alterações guardadas.')
                  setEditing(null)
                  void reload()
                }}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

function Count({ n }: { n: number }) {
  return <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
}

function StatusLine({ g }: { g: Guest }) {
  if (g.checkedInAt)
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-ok tabular">
        <Check className="size-3.5" /> {clock(g.checkedInAt)}
      </span>
    )
  if (!g.email)
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <MailX className="size-3.5" /> Sem email
      </span>
    )
  if (g.inviteStatus === 'failed')
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
        <CircleAlert className="size-3.5" /> Falhou
      </span>
    )
  if (g.inviteStatus === 'sent')
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <MailCheck className="size-3.5" /> Enviado
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="size-3.5" /> Por enviar
    </span>
  )
}

function GuestDetails({ g, onChange, onEdit, onDeleted }: { g: Guest; onChange: (g: Guest) => void; onEdit: () => void; onDeleted: () => void }) {
  const link = credentialLink(g.token)
  const [confirm, setConfirm] = useState<'delete' | 'token' | 'undo' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function run<T>(key: string, fn: () => Promise<T>, ok?: string) {
    setBusy(key)
    try {
      const r = await fn()
      if (ok) toast.success(ok)
      return r
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function share() {
    const text = `Olá ${g.name.split(' ')[0]}, esta é a sua credencial de acesso com QR Code: ${link}`
    if (navigator.share) {
      await navigator.share({ title: 'Credencial', text }).catch(() => {})
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
    }
  }

  return (
    <div className="overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
      <DrawerHeader className="px-0 text-left">
        <DrawerTitle className="text-xl">{g.name}</DrawerTitle>
        <DrawerDescription className="break-all">{g.email ?? 'Sem email'}</DrawerDescription>
      </DrawerHeader>

      <div className="flex gap-4">
        <div className="w-32 shrink-0 rounded-xl border bg-white p-1.5">
          <QrImage text={link} />
        </div>
        <dl className="min-w-0 flex-1 space-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Categoria</dt>
            <dd className="mt-0.5">
              <CategoryBadge category={g.category} />
            </dd>
          </div>
          {g.organization && (
            <div>
              <dt className="text-muted-foreground">Instituição</dt>
              <dd className="font-medium">{g.organization}</dd>
            </div>
          )}
          {g.position && (
            <div>
              <dt className="text-muted-foreground">Cargo</dt>
              <dd className="font-medium">{g.position}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Presença</dt>
            <dd className={cn('font-medium', g.confirmedAt && 'text-ok')}>{g.confirmedAt ? `Confirmada a ${dateTime(g.confirmedAt)}` : 'Por confirmar'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Entrada</dt>
            <dd className={cn('font-medium', g.checkedInAt && 'text-ok')}>
              {g.checkedInAt ? `${dateTime(g.checkedInAt)}${g.checkedInBy ? ` · ${g.checkedInBy}` : ''}` : 'Ainda não entrou'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Convite</dt>
            <dd className={cn('font-medium', g.inviteStatus === 'failed' && 'text-destructive')}>
              {!g.email ? 'Sem email: partilhe o link' : g.inviteStatus === 'sent' && g.inviteSentAt ? `Enviado ${dateTime(g.inviteSentAt)}` : g.inviteStatus === 'failed' ? 'O envio falhou' : 'Por enviar'}
            </dd>
            {g.inviteError && <dd className="mt-0.5 text-xs text-muted-foreground">{g.inviteError}</dd>}
          </div>
        </dl>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copiado.'))}>
          <Copy className="size-4" /> Copiar link
        </Button>
        <Button variant="outline" className="h-11" onClick={share}>
          <Share2 className="size-4" /> Partilhar
        </Button>
        <Button
          variant="outline"
          className="h-11"
          disabled={busy === 'send' || !g.email}
          onClick={() => run('send', () => api.post('/api/invites/send', { scope: 'ids', ids: [g.id] }), 'Convite em envio.')}
        >
          <Send className="size-4" /> {g.inviteStatus === 'sent' ? 'Reenviar' : 'Enviar'} convite
        </Button>
        {g.checkedInAt ? (
          <Button variant="outline" className="h-11" onClick={() => setConfirm('undo')}>
            <Undo2 className="size-4" /> Anular entrada
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-11"
            disabled={busy === 'in'}
            onClick={() =>
              run('in', async () => {
                const r = await api.post<ScanResult>(`/api/checkin/${g.id}`)
                if (r.status !== 'invalid') onChange({ ...g, checkedInAt: r.checkedInAt, checkedInBy: r.status === 'duplicate' ? r.checkedInBy : 'Organização' })
              }, 'Entrada registada.')
            }
          >
            <LogIn className="size-4" /> Dar entrada
          </Button>
        )}
        <Button variant="outline" className="h-11" onClick={onEdit}>
          <Pencil className="size-4" /> Editar
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setConfirm('token')}>
          <RefreshCw className="size-4" /> Novo QR
        </Button>
      </div>
      <Button variant="destructive" className="mt-2 h-11 w-full" onClick={() => setConfirm('delete')}>
        <Trash2 className="size-4" /> Remover da lista
      </Button>

      <ConfirmDialog
        open={confirm === 'token'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Gerar novo QR Code?"
        description="O QR actual deixa de abrir a porta. Use quando uma credencial foi partilhada indevidamente. Depois envie o convite outra vez."
        confirmLabel="Gerar novo QR"
        onConfirm={async () => {
          const r = await run('token', () => api.post<Guest>(`/api/guests/${g.id}/token`), 'Novo QR gerado.')
          if (r) onChange(r)
        }}
      />
      <ConfirmDialog
        open={confirm === 'undo'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Anular a entrada?"
        description="A pessoa volta a constar como ausente e o QR passa a ser aceite de novo."
        confirmLabel="Anular entrada"
        onConfirm={async () => {
          const r = await run('undo', () => api.post<Guest>(`/api/guests/${g.id}/undo-checkin`), 'Entrada anulada.')
          if (r) onChange(r)
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Remover ${g.name}?`}
        description="A credencial deixa de funcionar e o registo é apagado. Não é possível desfazer."
        confirmLabel="Remover"
        destructive
        onConfirm={async () => {
          const r = await run('del', () => api.del(`/api/guests/${g.id}`), 'Convidado removido.')
          if (r) onDeleted()
        }}
      />
    </div>
  )
}
