import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ArrowRight, Loader2, ScanLine, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateVenue, DotField, EventLockup, WaveLines } from '@/components/brand'
import { useSession, type Role } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? ''
    } catch {
      return ''
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* armazenamento indisponível */
    }
  },
}

export default function LoginPage() {
  const { session, ready, settings, login } = useSession()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>(() => (store.get('acr.role') === 'admin' ? 'admin' : 'door'))
  const [secret, setSecret] = useState('')
  const [post, setPost] = useState(() => store.get('acr.post'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (ready && session) return <Navigate to={session.role === 'door' ? '/porta' : '/admin'} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const s = await login(role, secret.trim(), role === 'door' ? post.trim() || 'Entrada' : undefined)
      store.set('acr.role', role)
      if (role === 'door') store.set('acr.post', post.trim())
      navigate(s.role === 'door' ? '/porta' : '/admin', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSecret('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-brand-950 md:flex-row">
      <section className="arc-sky relative isolate flex flex-1 flex-col justify-between overflow-hidden px-6 pt-[max(env(safe-area-inset-top),2rem)] pb-14 md:px-14 md:py-14">
        <WaveLines className="absolute inset-0 -z-10 h-full w-full" />
        <DotField className="absolute right-5 bottom-24 -z-10 h-16 w-28 opacity-70 md:bottom-16" />
        <p className="text-sm font-semibold text-white/90">Acreditação digital</p>
        {settings ? (
          <div className="mt-10 max-w-xl md:mt-0">
            <EventLockup s={settings} size="lg" />
            <div className="my-6 h-px w-full max-w-md bg-white/45" />
            <DateVenue s={settings} />
          </div>
        ) : (
          <div className="mt-10 h-48 max-w-xl animate-pulse rounded-xl bg-white/10" />
        )}
        <p className="mt-8 hidden text-sm text-white/80 md:block">{settings?.organizer}</p>
      </section>

      <section className="relative -mt-6 rounded-t-3xl bg-background px-6 pt-7 safe-bottom md:mt-0 md:flex md:w-[440px] md:flex-col md:justify-center md:rounded-none md:px-12">
        <h2 className="text-xl font-bold tracking-tight">Entrar</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha a sua função neste dispositivo.</p>

        <div role="tablist" aria-label="Função" className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(
            [
              { id: 'door', label: 'Entrada', icon: ScanLine },
              { id: 'admin', label: 'Organização', icon: ShieldCheck },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={role === id}
              onClick={() => {
                setRole(id)
                setError(null)
                setSecret('')
              }}
              className={cn(
                'press flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors',
                role === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4 pb-4">
          {role === 'door' && (
            <div className="space-y-1.5">
              <Label htmlFor="post">Posto</Label>
              <Input
                id="post"
                value={post}
                onChange={(e) => setPost(e.target.value)}
                placeholder="Ex.: Porta principal"
                maxLength={40}
                autoComplete="off"
                className="h-12 text-base"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="secret">{role === 'door' ? 'PIN da entrada' : 'Palavra-passe'}</Label>
            <Input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              inputMode={role === 'door' ? 'numeric' : undefined}
              autoComplete={role === 'door' ? 'one-time-code' : 'current-password'}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
              className="h-12 text-base tracking-wide"
              required
            />
            {error && (
              <p id="login-error" role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" disabled={busy || !secret} className="press h-12 w-full text-base font-semibold">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <>{role === 'door' ? 'Abrir leitor' : 'Abrir painel'}<ArrowRight className="size-5" /></>}
          </Button>
        </form>
      </section>
    </main>
  )
}
