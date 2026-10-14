import { Link } from 'react-router'
import { ArrowRight, FileSpreadsheet, MailWarning, UserPlus } from 'lucide-react'
import { CATEGORIES, CATEGORY_PLURAL, type Category } from '@shared/guests'
import { clock } from '@shared/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryBadge } from '@/components/brand'
import { useApi } from '@/lib/hooks'
import { PageTitle } from './layout'

export interface Stats {
  total: number
  present: number
  sent: number
  pending: number
  failed: number
  perCategory: Record<Category, { total: number; present: number; sent: number }>
  recent: { name: string; category: Category; at: string; device: string | null }[]
  mail: { configured: boolean; from: string | null }
  job: { running: boolean; total: number; done: number; failed: number } | null
}

function Bar({ value, max, className = 'bg-primary' }: { value: number; max: number; className?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
      <div className={`h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out-strong)] ${className}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function OverviewPage() {
  const { data: s, loading } = useApi<Stats>('/api/stats', 8000)

  if (loading || !s) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (s.total === 0) {
    return (
      <>
        <PageTitle title="Resumo" />
        <section className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
          <h2 className="text-lg font-bold">A lista de convidados está vazia</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Importe o Excel com nome e email (e, se tiver, a categoria) ou adicione os convidados um a um.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild className="h-11 px-5">
              <Link to="/admin/importar">
                <FileSpreadsheet className="size-4" /> Importar Excel
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-5">
              <Link to="/admin/convidados?novo=1">
                <UserPlus className="size-4" /> Adicionar convidado
              </Link>
            </Button>
          </div>
        </section>
      </>
    )
  }

  const pct = Math.round((s.present / s.total) * 100)

  return (
    <>
      <PageTitle title="Resumo" description="Actualiza sozinho a cada poucos segundos." />

      <section className="rounded-2xl border bg-card p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Entradas</h2>
          <span className="text-sm font-semibold text-muted-foreground tabular">{pct}%</span>
        </div>
        <p className="mt-1 tabular">
          <span className="text-4xl font-extrabold tracking-tight">{s.present}</span>
          <span className="ml-1.5 text-lg text-muted-foreground">de {s.total}</span>
        </p>
        <div className="mt-4">
          <Bar value={s.present} max={s.total} className="bg-ok" />
        </div>

        <ul className="mt-6 divide-y border-t">
          {CATEGORIES.map((cat) => {
            const c = s.perCategory[cat]
            return (
              <li key={cat} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 py-3.5">
                <span className="text-sm font-semibold">{CATEGORY_PLURAL[cat]}</span>
                <span className="text-sm text-muted-foreground tabular">
                  <span className="font-semibold text-foreground">{c.present}</span> / {c.total}
                </span>
                <div className="col-span-2">
                  <Bar value={c.present} max={c.total} className="bg-brand-500" />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Convites</h2>
            <Button asChild variant="ghost" size="sm" className="-mr-2">
              <Link to="/admin/convites">
                Gerir <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { k: 'Enviados', v: s.sent },
              { k: 'Por enviar', v: s.pending },
              { k: 'Falharam', v: s.failed },
            ].map(({ k, v }) => (
              <div key={k} className="rounded-xl bg-muted/60 px-2 py-3">
                <dd className="text-xl font-bold tabular">{v}</dd>
                <dt className="text-xs text-muted-foreground">{k}</dt>
              </div>
            ))}
          </dl>
          {!s.mail.configured && (
            <p className="mt-3 flex gap-2 rounded-lg bg-warn/15 p-3 text-sm text-foreground">
              <MailWarning className="mt-0.5 size-4 shrink-0 text-warn-foreground" />
              O servidor de email ainda não está ligado. Os links das credenciais já podem ser copiados e partilhados.
            </p>
          )}
          {s.job?.running && (
            <div className="mt-3">
              <p className="mb-1.5 text-sm text-muted-foreground tabular">
                A enviar {s.job.done} de {s.job.total}…
              </p>
              <Bar value={s.job.done} max={s.job.total} />
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-bold">Últimas entradas</h2>
          {s.recent.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Ainda ninguém entrou. As leituras aparecem aqui em tempo real.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {s.recent.map((r, i) => (
                <li key={`${r.at}-${i}`} className="flex items-center gap-3 py-2.5">
                  <span className="w-11 shrink-0 text-sm font-semibold tabular">{clock(r.at)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    {r.device && <p className="truncate text-xs text-muted-foreground">{r.device}</p>}
                  </div>
                  <CategoryBadge category={r.category} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
