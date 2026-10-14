import { useEffect, useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import type { Category, ScanResult } from '@shared/guests'
import { clock } from '@shared/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryBadge } from '@/components/brand'
import { api, errorMessage } from '@/lib/api'
import { useDebounced } from '@/lib/hooks'
import { toast } from 'sonner'

interface Hit {
  id: string
  name: string
  category: Category
  organization: string | null
  checkedInAt: string | null
}

/** Plano B para quem não traz o QR: procurar pelo nome e registar à mão. */
export function GuestSearch({ onCheckedIn }: { onCheckedIn: (r: ScanResult) => void }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 220)
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (dq.trim().length < 2) {
      setHits([])
      return
    }
    let alive = true
    setLoading(true)
    api
      .get<Hit[]>(`/api/door/search?q=${encodeURIComponent(dq.trim())}`)
      .then((h) => alive && setHits(h))
      .catch((e) => alive && toast.error(errorMessage(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [dq])

  async function checkIn(hit: Hit) {
    setBusyId(hit.id)
    try {
      const r = await api.post<ScanResult>(`/api/checkin/${hit.id}`)
      if (r.status !== 'invalid') {
        setHits((hs) => hs.map((h) => (h.id === hit.id ? { ...h, checkedInAt: r.checkedInAt } : h)))
      }
      onCheckedIn(r)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome ou instituição"
          className="h-12 pl-10 text-base"
          enterKeyHint="search"
        />
        {loading && <Loader2 className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <ul className="mt-3 min-h-0 flex-1 divide-y overflow-y-auto">
        {hits.map((h) => (
          <li key={h.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{h.name}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <CategoryBadge category={h.category} />
                {h.organization && <span className="truncate">{h.organization}</span>}
              </div>
            </div>
            {h.checkedInAt ? (
              <span className="flex items-center gap-1 text-sm font-medium text-ok">
                <Check className="size-4" /> {clock(h.checkedInAt)}
              </span>
            ) : (
              <Button className="press h-10 px-4" onClick={() => checkIn(h)} disabled={busyId === h.id}>
                {busyId === h.id ? <Loader2 className="size-4 animate-spin" /> : 'Dar entrada'}
              </Button>
            )}
          </li>
        ))}
        {dq.trim().length >= 2 && !loading && hits.length === 0 && (
          <li className="py-8 text-center text-sm text-muted-foreground">Ninguém com “{dq.trim()}” na lista.</li>
        )}
      </ul>
    </div>
  )
}
