import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { CATEGORIES, CATEGORY_LABEL, MAX_GUESTS, checkRows, type Category, type CheckedRow, type Guest } from '@shared/guests'
import { Button } from '@/components/ui/button'
import { CategoryBadge } from '@/components/brand'
import { api, errorMessage } from '@/lib/api'
import { useApi } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { PageTitle } from './layout'

type RawRow = { line: number; name: unknown; email: unknown; category?: unknown; organization?: unknown }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Reconhece as colunas pelo cabeçalho, seja qual for a ordem. */
function detectColumns(header: string[]) {
  const find = (re: RegExp) => header.findIndex((h) => re.test(fold(h)))
  return {
    name: find(/^(nome|name|nome completo|participante|convidado)/),
    first: find(/^(primeiro nome|first name|nome proprio)/),
    last: find(/^(apelido|ultimo nome|last name|sobrenome)/),
    email: find(/(e-?mail|correio)/),
    category: find(/^(categoria|category|tipo|perfil)/),
    organization: find(/(instituic|organizac|entidade|empresa|organization|company|orgao)/),
  }
}

async function parseFile(file: File): Promise<{ rows: RawRow[]; columns: string[] }> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, dense: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '', raw: false })
  // O cabeçalho é a primeira linha que tenha uma coluna de email reconhecível.
  const headerIdx = matrix.findIndex((r) => detectColumns(r.map(String)).email >= 0)
  if (headerIdx < 0) throw new Error('Não encontrei uma coluna de email. A primeira linha deve ter os títulos (Nome, Email, Categoria).')
  const header = matrix[headerIdx].map(String)
  const col = detectColumns(header)
  if (col.name < 0 && col.first < 0) throw new Error('Não encontrei a coluna do nome.')
  const rows = matrix.slice(headerIdx + 1).map((r, i) => ({
    line: headerIdx + i + 2,
    name: col.name >= 0 ? r[col.name] : `${r[col.first] ?? ''} ${col.last >= 0 ? (r[col.last] ?? '') : ''}`,
    email: r[col.email],
    category: col.category >= 0 ? r[col.category] : undefined,
    organization: col.organization >= 0 ? r[col.organization] : undefined,
  }))
  const columns = Object.entries(col)
    .filter(([, i]) => i >= 0)
    .map(([, i]) => header[i])
  return { rows: rows.filter((r) => String(r.name).trim() || String(r.email).trim()), columns }
}

async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([
    ['Nome', 'Email', 'Categoria', 'Instituição'],
    ['Maria da Conceição Neto', 'maria.neto@exemplo.ao', 'Convidado', 'Ministério das Finanças'],
    ['João Paulo Sebastião', 'joao.sebastiao@exemplo.ao', 'Orador', 'Universidade Agostinho Neto'],
    ['Ana Lukamba', 'ana.lukamba@exemplo.ao', 'Imprensa', 'Jornal de Angola'],
  ])
  ws['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 30 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Convidados')
  XLSX.writeFile(wb, 'modelo-lista-convidados.xlsx')
}

export default function ImportPage() {
  const navigate = useNavigate()
  const existing = useApi<Guest[]>('/api/guests')
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [raw, setRaw] = useState<RawRow[] | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [fallback, setFallback] = useState<Category>('convidado')
  const [parsing, setParsing] = useState(false)
  const [sending, setSending] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const existingEmails = useMemo(() => new Set((existing.data ?? []).map((g) => g.email)), [existing.data])
  const checked: CheckedRow[] = useMemo(() => (raw ? checkRows(raw, fallback, existingEmails) : []), [raw, fallback, existingEmails])
  const valid = checked.filter((r) => r.issues.length === 0)
  const invalid = checked.filter((r) => r.issues.length > 0)
  const byCat = CATEGORIES.map((c) => ({ c, n: valid.filter((r) => r.input.category === c).length }))

  async function pick(f: File | undefined) {
    if (!f) return
    if (f.size > 8 * 1024 * 1024) {
      toast.error('Ficheiro demasiado grande (máx. 8 MB).')
      return
    }
    setParsing(true)
    try {
      const { rows, columns } = await parseFile(f)
      if (!rows.length) throw new Error('O ficheiro não tem linhas com dados.')
      if (rows.length > MAX_GUESTS) throw new Error(`O ficheiro tem ${rows.length} linhas; o limite é ${MAX_GUESTS}.`)
      setFile(f)
      setRaw(rows)
      setColumns(columns)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setParsing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    void pick(e.dataTransfer.files[0])
  }

  async function submit() {
    if (!raw) return
    setSending(true)
    try {
      const r = await api.post<{ inserted: number; skipped: number }>('/api/guests/import', { fallbackCategory: fallback, rows: raw })
      toast.success(`${r.inserted} convidados importados${r.skipped ? ` · ${r.skipped} linhas ignoradas` : ''}.`)
      navigate('/admin/convidados')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setFile(null)
    setRaw(null)
    setColumns([])
  }

  return (
    <>
      <PageTitle
        title="Importar lista"
        description="Excel (.xlsx) ou CSV com uma linha de títulos. Basta Nome e Email; Categoria e Instituição são opcionais."
        actions={
          <Button variant="outline" className="h-10" onClick={() => void downloadTemplate()}>
            <FileSpreadsheet className="size-4" /> Modelo
          </Button>
        }
      />

      {!raw ? (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card px-6 py-14 text-center transition-colors',
            dragOver ? 'border-primary bg-accent' : 'hover:border-primary/50',
          )}
        >
          {parsing ? <Loader2 className="size-9 animate-spin text-primary" /> : <Upload className="size-9 text-primary" />}
          <span className="mt-4 font-semibold">{parsing ? 'A ler o ficheiro…' : 'Escolher ficheiro'}</span>
          <span className="mt-1 text-sm text-muted-foreground">ou arraste-o para aqui</span>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
      ) : (
        <div className="space-y-4">
          <section className="rounded-2xl border bg-card p-5">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{file?.name}</p>
                <p className="text-sm text-muted-foreground">Colunas reconhecidas: {columns.join(', ')}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Escolher outro ficheiro" onClick={reset}>
                <X />
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-ok/10 px-4 py-3">
                <p className="flex items-center gap-1.5 text-2xl font-bold text-ok tabular">
                  <CheckCircle2 className="size-5" /> {valid.length}
                </p>
                <p className="text-xs text-muted-foreground">prontos a importar</p>
              </div>
              <div className={cn('rounded-xl px-4 py-3', invalid.length ? 'bg-warn/15' : 'bg-muted/60')}>
                <p className="flex items-center gap-1.5 text-2xl font-bold tabular">
                  <AlertTriangle className={cn('size-5', invalid.length ? 'text-warn-foreground' : 'text-muted-foreground')} /> {invalid.length}
                </p>
                <p className="text-xs text-muted-foreground">com problemas (ficam de fora)</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {byCat.map(({ c, n }) => (
                <span key={c}>
                  {CATEGORY_LABEL[c]}: <strong className="text-foreground tabular">{n}</strong>
                </span>
              ))}
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium">Categoria para linhas sem categoria</legend>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={fallback === c}
                    onClick={() => setFallback(c)}
                    className={cn(
                      'press h-10 rounded-lg border text-sm font-semibold transition-colors',
                      fallback === c ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                    )}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            </fieldset>

            <Button className="press mt-5 h-12 w-full text-base" disabled={!valid.length || sending} onClick={submit}>
              {sending && <Loader2 className="size-4 animate-spin" />}
              Importar {valid.length} convidados
            </Button>
          </section>

          {invalid.length > 0 && (
            <section className="rounded-2xl border bg-card">
              <h2 className="border-b px-5 py-3 text-sm font-bold">Linhas com problemas</h2>
              <ul className="max-h-80 divide-y overflow-y-auto">
                {invalid.map((r) => (
                  <li key={r.line} className="flex gap-3 px-5 py-2.5 text-sm">
                    <span className="w-10 shrink-0 text-muted-foreground tabular">L{r.line}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.input.name || '—'}</p>
                      <p className="truncate text-muted-foreground">{r.input.email || '—'}</p>
                    </div>
                    <span className="shrink-0 text-right text-xs font-semibold text-destructive">{r.issues.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border bg-card">
            <h2 className="border-b px-5 py-3 text-sm font-bold">Pré-visualização</h2>
            <ul className="max-h-96 divide-y overflow-y-auto">
              {valid.slice(0, 60).map((r) => (
                <li key={r.line} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.input.name}</p>
                    <p className="truncate text-muted-foreground">{r.input.email}</p>
                  </div>
                  <CategoryBadge category={r.input.category} />
                </li>
              ))}
            </ul>
            {valid.length > 60 && <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">… e mais {valid.length - 60}.</p>}
          </section>
        </div>
      )}
    </>
  )
}
