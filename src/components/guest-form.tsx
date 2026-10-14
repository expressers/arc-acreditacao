import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { CATEGORIES, CATEGORY_LABEL, isValidEmail, normalizeEmail, type Category, type Guest } from '@shared/guests'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

export function GuestForm({ guest, onSaved }: { guest?: Guest; onSaved: (g: Guest) => void }) {
  const [name, setName] = useState(guest?.name ?? '')
  const [email, setEmail] = useState(guest?.email ?? '')
  const [organization, setOrganization] = useState(guest?.organization ?? '')
  const [category, setCategory] = useState<Category>(guest?.category ?? 'convidado')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!isValidEmail(normalizeEmail(email))) {
      setError('O email não parece válido.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = { name, email, organization: organization || null, category }
      const saved = guest ? await api.patch<Guest>(`/api/guests/${guest.id}`, body) : await api.post<Guest>('/api/guests', body)
      onSaved(saved)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="g-name">Nome completo</Label>
        <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoComplete="off" className="h-12 text-base" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-email">Email</Label>
        <Input id="g-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" className="h-12 text-base" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-org">Instituição (opcional)</Label>
        <Input id="g-org" value={organization} onChange={(e) => setOrganization(e.target.value)} maxLength={120} className="h-12 text-base" />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Categoria</legend>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                'press h-11 rounded-lg border text-sm font-semibold transition-colors',
                category === c ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </fieldset>
      {guest && normalizeEmail(email) !== guest.email && (
        <p className="text-sm text-muted-foreground">Ao mudar o email, o convite volta a ficar “por enviar”.</p>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="press h-12 w-full text-base">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {guest ? 'Guardar alterações' : 'Adicionar convidado'}
      </Button>
    </form>
  )
}
