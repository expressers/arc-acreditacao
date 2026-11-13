import { Download, Star } from 'lucide-react'
import { CATEGORY_LABEL } from '@shared/guests'
import { RATING_VALUES, type RatingRow, type RatingSummary } from '@shared/ratings'
import { dateTime } from '@shared/format'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryBadge } from '@/components/brand'
import { StarRating } from '@/components/star-rating'
import { useApi } from '@/lib/hooks'
import { PageTitle } from './layout'

async function exportXlsx(rows: RatingRow[]) {
  const XLSX = await import('xlsx')
  const data = rows.map((r) => ({
    Nome: r.name ?? 'Convidado removido',
    Email: r.email ?? '',
    Categoria: r.category ? CATEGORY_LABEL[r.category] : '',
    Instituição: r.organization ?? '',
    'Nota (1–10)': r.rating,
    Comentário: r.comment ?? '',
    'Enviado em': dateTime(r.createdAt),
    'Actualizado em': dateTime(r.updatedAt),
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 60 }, { wch: 18 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Avaliações')
  XLSX.writeFile(wb, `avaliacoes-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
      <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700 ease-[var(--ease-out-strong)]" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function RatingsPage() {
  const { data: s, loading } = useApi<RatingSummary>('/api/ratings', 15_000)

  if (loading || !s) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const comments = s.rows.filter((r) => r.comment)
  const max = Math.max(...s.distribution, 1)
  const average = s.average === null ? null : s.average.toFixed(1).replace('.', ',')
  const responseRate = s.attended ? Math.round((s.count / s.attended) * 100) : null

  return (
    <>
      <PageTitle
        title="Avaliações"
        description="Notas de 1 (insatisfeito) a 10 (muito satisfeito). Cada convidado tem uma avaliação; a mais recente substitui a anterior."
        actions={
          <Button variant="outline" className="h-10" disabled={!s.rows.length} onClick={() => void exportXlsx(s.rows)}>
            <Download className="size-4" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
        }
      />

      {s.count === 0 ? (
        <section className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
          <Star className="mx-auto size-8 text-muted-foreground/50" />
          <h2 className="mt-3 text-lg font-bold">Ainda não há avaliações</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Os convidados avaliam através do botão “Avaliar o evento” na credencial. Não é preciso enviar nada novo: quem tem o link da
            credencial já pode responder.
          </p>
        </section>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <section className="rounded-2xl border bg-card p-5 md:p-6">
              <h2 className="text-sm font-semibold text-muted-foreground">Média</h2>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-5xl font-extrabold tracking-tight tabular">{average}</span>
                <span className="text-lg text-muted-foreground">/ 10</span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground tabular">
                {s.count} {s.count === 1 ? 'avaliação' : 'avaliações'}
                {responseRate !== null && ` · ${responseRate}% dos ${s.attended} presentes`}
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-muted/60 px-2 py-3">
                  <dd className="text-xl font-bold tabular">{comments.length}</dd>
                  <dt className="text-xs text-muted-foreground">Com comentário</dt>
                </div>
                <div className="rounded-xl bg-muted/60 px-2 py-3">
                  <dd className="text-xl font-bold tabular">{s.rows.filter((r) => r.rating >= 8).length}</dd>
                  <dt className="text-xs text-muted-foreground">Notas 8 a 10</dt>
                </div>
              </dl>
            </section>

            <section className="rounded-2xl border bg-card p-5 md:p-6">
              <h2 className="text-sm font-semibold text-muted-foreground">Distribuição das notas</h2>
              <ul className="mt-3 space-y-1.5">
                {[...RATING_VALUES].reverse().map((v) => {
                  const n = s.distribution[v - 1] ?? 0
                  return (
                    <li key={v} className="grid grid-cols-[1.5rem_1fr_1.75rem] items-center gap-3">
                      <span className="text-right text-xs font-semibold text-muted-foreground tabular">{v}</span>
                      <Bar value={n} max={max} />
                      <span className="text-right text-xs text-muted-foreground tabular">{n}</span>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Star className="size-3 fill-amber-400 text-amber-400" /> 10 = muito satisfeito
                </span>
                <span>1 = insatisfeito</span>
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-2xl border bg-card p-5 md:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-bold">Comentários</h2>
              <span className="text-sm text-muted-foreground tabular">{comments.length}</span>
            </div>
            {comments.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum comentário por agora. As notas continuam registadas acima.</p>
            ) : (
              <ul className="mt-2 divide-y">
                {comments.map((r) => (
                  <li key={`${r.guestId ?? 'sem-convidado'}-${r.updatedAt}`} className="py-4 first:pt-2 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <StarRating readOnly value={r.rating} size="sm" />
                      <span className="text-sm font-bold tabular">{r.rating}/10</span>
                      {r.category && <CategoryBadge category={r.category} />}
                      <span className="ml-auto text-xs text-muted-foreground tabular">{dateTime(r.updatedAt)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line">{r.comment}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {r.name ?? 'Convidado removido'}
                      {r.organization && ` · ${r.organization}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}
