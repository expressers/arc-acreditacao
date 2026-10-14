import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, MailWarning, RotateCcw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/confirm'
import { api, errorMessage } from '@/lib/api'
import { useApi } from '@/lib/hooks'
import { PageTitle } from './layout'
import type { Stats } from './overview'

type Job = { running: boolean; total: number; done: number; failed: number; finishedAt: string | null } | null

export default function InvitesPage() {
  const stats = useApi<Stats>('/api/stats', 6000)
  const [job, setJob] = useState<Job>(null)
  const [confirm, setConfirm] = useState<'pending' | 'failed' | null>(null)
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const preview = useApi<{ html: string }>('/api/invites/preview')
  const reload = stats.reload

  // Enquanto houver envio em curso, acompanha o progresso de perto.
  useEffect(() => {
    const running = job?.running || stats.data?.job?.running
    if (!running) return
    const id = window.setInterval(async () => {
      const j = await api.get<Job>('/api/invites/job').catch(() => null)
      setJob(j)
      if (j && !j.running) {
        void reload()
        toast.success(`Envio concluído: ${j.done - j.failed} enviados${j.failed ? `, ${j.failed} falharam` : ''}.`)
      }
    }, 1500)
    return () => window.clearInterval(id)
  }, [job?.running, stats.data?.job?.running, reload])

  const s = stats.data
  const live = job ?? s?.job ?? null

  async function start(scope: 'pending' | 'failed') {
    try {
      setJob(await api.post<Job>('/api/invites/send', { scope }))
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      await api.post('/api/invites/test', { email: testTo })
      toast.success(`Email de teste enviado para ${testTo}.`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <PageTitle title="Convites" description="Cada convidado recebe um email com o seu QR Code individual e o link para a credencial digital." />

      {!s ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            {!s.mail.configured && (
              <section className="flex gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm">
                <MailWarning className="mt-0.5 size-5 shrink-0 text-warn-foreground" />
                <div>
                  <p className="font-semibold">O servidor de email ainda não está ligado</p>
                  <p className="mt-1 text-muted-foreground">
                    Falta definir as credenciais SMTP do remetente no servidor. Até lá, pode copiar ou partilhar o link de cada credencial a partir da lista de convidados.
                  </p>
                </div>
              </section>
            )}

            <section className="rounded-2xl border bg-card p-5">
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  { k: 'Por enviar', v: s.pending },
                  { k: 'Enviados', v: s.sent },
                  { k: 'Falharam', v: s.failed },
                ].map(({ k, v }) => (
                  <div key={k} className="rounded-xl bg-muted/60 px-2 py-3">
                    <dd className="text-2xl font-bold tabular">{v}</dd>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                  </div>
                ))}
              </dl>

              {live?.running ? (
                <div className="mt-5" aria-live="polite">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">A enviar…</span>
                    <span className="text-muted-foreground tabular">
                      {live.done} / {live.total}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(live.done / live.total) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Pode sair desta página: o envio continua no servidor.</p>
                </div>
              ) : (
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Button className="press h-12 text-base sm:flex-1" disabled={!s.mail.configured || s.pending === 0} onClick={() => setConfirm('pending')}>
                    <Send className="size-4" /> Enviar {s.pending} convites
                  </Button>
                  {s.failed > 0 && (
                    <Button variant="outline" className="h-12" disabled={!s.mail.configured} onClick={() => setConfirm('failed')}>
                      <RotateCcw className="size-4" /> Repetir {s.failed} falhados
                    </Button>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <h2 className="font-bold">Enviar um teste</h2>
              <p className="mt-1 text-sm text-muted-foreground">Veja o convite na sua caixa de correio antes de enviar a todos. O QR do teste não abre a porta.</p>
              <form
                className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendTest()
                }}
              >
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="test-to">Email</Label>
                  <Input id="test-to" type="email" inputMode="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} required className="h-11" />
                </div>
                <Button type="submit" variant="outline" className="h-11" disabled={!s.mail.configured || testing}>
                  {testing && <Loader2 className="size-4 animate-spin" />}
                  Enviar teste
                </Button>
              </form>
              {s.mail.from && <p className="mt-3 text-xs text-muted-foreground">Remetente: {s.mail.from}</p>}
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl border bg-card">
            <h2 className="border-b px-5 py-3 text-sm font-bold">Pré-visualização do email</h2>
            {preview.data ? (
              <iframe title="Pré-visualização do convite" srcDoc={preview.data.html} sandbox="" className="h-[640px] w-full bg-[#eaf3fa]" />
            ) : (
              <Skeleton className="m-4 h-[600px]" />
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'failed' ? `Repetir ${s?.failed ?? 0} envios?` : `Enviar ${s?.pending ?? 0} convites?`}
        description="Os emails saem de imediato para os convidados reais. Confirme antes que os dados do evento (data, hora, local) estão correctos."
        confirmLabel="Enviar agora"
        onConfirm={() => start(confirm ?? 'pending')}
      />
    </>
  )
}
