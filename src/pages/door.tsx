import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import QrScanner from 'qr-scanner'
import { AlertTriangle, CameraOff, CheckCircle2, Flashlight, LayoutDashboard, LogOut, ScanLine, Search, SwitchCamera, WifiOff, XCircle } from 'lucide-react'
import { CATEGORY_LABEL, type ScanResult } from '@shared/guests'
import { clock } from '@shared/format'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { GuestSearch } from '@/components/guest-search'
import { api } from '@/lib/api'
import { feedback, unlockAudio } from '@/lib/feedback'
import { useApi } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

type Shown = ScanResult | { status: 'offline' }

const AUTO_CLEAR: Record<Shown['status'], number> = { ok: 2200, duplicate: 5000, invalid: 4000, offline: 4000 }

export default function DoorPage() {
  const { session, logout } = useSession()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const busyRef = useRef(false)
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  const clearTimer = useRef<number | undefined>(undefined)

  const [started, setStarted] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [result, setResult] = useState<Shown | null>(null)
  const [hasFlash, setHasFlash] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const stats = useApi<{ total: number; present: number }>('/api/door/stats', 10_000)

  // O leitor vive num ambiente escuro: a câmara e os resultados lêem-se melhor.
  useEffect(() => {
    document.documentElement.classList.add('dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0b1d2e')
    return () => document.documentElement.classList.remove('dark')
  }, [])

  const show = useCallback(
    (r: Shown) => {
      window.clearTimeout(clearTimer.current)
      setResult(r)
      feedback(r.status === 'offline' ? 'invalid' : r.status)
      if (r.status === 'ok') {
        stats.setData((s) => (s ? { ...s, present: s.present + 1 } : s))
      }
      clearTimer.current = window.setTimeout(() => {
        setResult(null)
        busyRef.current = false
      }, AUTO_CLEAR[r.status])
    },
    [stats],
  )

  const next = useCallback(() => {
    window.clearTimeout(clearTimer.current)
    setResult(null)
    busyRef.current = false
  }, [])

  const onDecode = useCallback(
    async (res: QrScanner.ScanResult) => {
      const code = res.data
      const now = Date.now()
      if (busyRef.current) return
      if (code === lastRef.current.code && now - lastRef.current.at < 3500) return
      lastRef.current = { code, at: now }
      busyRef.current = true
      try {
        show(await api.post<ScanResult>('/api/scan', { code }))
      } catch (e) {
        if (e instanceof Error && 'status' in e && (e as { status: number }).status === 0) show({ status: 'offline' })
        else show({ status: 'invalid' })
      }
    },
    [show],
  )

  const start = useCallback(async () => {
    unlockAudio()
    setCamError(null)
    if (!videoRef.current) return
    try {
      const scanner = new QrScanner(videoRef.current, onDecode, {
        preferredCamera: 'environment',
        maxScansPerSecond: 10,
        returnDetailedScanResult: true,
        highlightScanRegion: false,
        highlightCodeOutline: false,
      })
      scannerRef.current = scanner
      await scanner.start()
      setStarted(true)
      setHasFlash(await scanner.hasFlash().catch(() => false))
    } catch (err) {
      const msg = String(err)
      setCamError(
        /NotAllowed|Permission|denied/i.test(msg)
          ? 'O acesso à câmara foi recusado. Autorize a câmara nas definições do navegador para este site e volte a tentar.'
          : /NotFound|no camera/i.test(msg)
            ? 'Não foi encontrada nenhuma câmara neste dispositivo.'
            : 'Não foi possível abrir a câmara. Feche outras apps que a estejam a usar e tente de novo.',
      )
    }
  }, [onDecode])

  useEffect(
    () => () => {
      window.clearTimeout(clearTimer.current)
      scannerRef.current?.destroy()
    },
    [],
  )

  async function toggleFlash() {
    if (!scannerRef.current) return
    await scannerRef.current.toggleFlash().catch(() => {})
    setFlashOn(scannerRef.current.isFlashOn())
  }

  async function switchCamera() {
    const s = scannerRef.current
    if (!s) return
    const cams = await QrScanner.listCameras(true).catch(() => [])
    if (cams.length < 2) return
    const current = (s as unknown as { _preferredCamera: string })._preferredCamera
    const idx = cams.findIndex((c) => c.id === current)
    await s.setCamera(cams[(idx + 1) % cams.length].id).catch(() => {})
    setHasFlash(await s.hasFlash().catch(() => false))
  }

  const pct = stats.data && stats.data.total ? Math.round((stats.data.present / stats.data.total) * 100) : 0

  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden bg-[#06121d] text-white select-none">
      {/* Câmara */}
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* Moldura de leitura: escurece tudo à volta do quadrado */}
      {started && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative aspect-square w-[72vw] max-w-[340px] rounded-[28px] shadow-[0_0_0_200vmax_rgb(6_18_29/0.62)]">
            {['top-0 left-0 border-t-4 border-l-4 rounded-tl-[28px]', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-[28px]', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[28px]', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-[28px]'].map((c) => (
              <span key={c} className={cn('absolute size-12 border-brand-300', c)} />
            ))}
          </div>
        </div>
      )}

      {/* Barra superior */}
      <header className="relative z-10 flex items-center gap-3 bg-gradient-to-b from-[#06121d]/90 to-transparent px-4 pt-[max(env(safe-area-inset-top),0.875rem)] pb-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{session?.name}</p>
          <p className="text-xs text-white/70 tabular">
            {stats.data ? (
              <>
                <span className="font-bold text-white">{stats.data.present}</span> de {stats.data.total} presentes · {pct}%
              </>
            ) : (
              'A sincronizar…'
            )}
          </p>
        </div>
        {session?.role === 'admin' && (
          <Button asChild size="icon-lg" variant="ghost" className="text-white hover:bg-white/10" aria-label="Painel">
            <Link to="/admin">
              <LayoutDashboard />
            </Link>
          </Button>
        )}
        <Button size="icon-lg" variant="ghost" className="text-white hover:bg-white/10" aria-label="Sair" onClick={() => void logout()}>
          <LogOut />
        </Button>
      </header>

      {/* Ecrã inicial / erro de câmara */}
      {!started && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8 text-center">
          {camError ? (
            <>
              <CameraOff className="size-12 text-white/70" />
              <p className="mt-4 max-w-xs text-white/85">{camError}</p>
              <Button onClick={start} className="press mt-6 h-12 px-6 text-base">
                Tentar de novo
              </Button>
            </>
          ) : (
            <>
              <div className="grid size-24 place-items-center rounded-3xl bg-brand-600/30 ring-1 ring-brand-300/40">
                <ScanLine className="size-11 text-brand-300" />
              </div>
              <h1 className="display mt-6 text-4xl">Leitor de entrada</h1>
              <p className="mt-2 max-w-xs text-sm text-white/75">Lê o QR Code da credencial e regista a entrada. Cada código só entra uma vez.</p>
              <Button onClick={start} className="press mt-7 h-14 w-full max-w-xs text-base font-semibold">
                Iniciar leitor
              </Button>
            </>
          )}
        </div>
      )}

      {started && <div className="flex-1" />}

      {/* Barra inferior */}
      <footer className="relative z-10 bg-gradient-to-t from-[#06121d] via-[#06121d]/85 to-transparent px-4 pt-10 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {started && <p className="mb-4 text-center text-sm text-white/80">Aponte para o QR Code da credencial</p>}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="press h-13 flex-1 bg-white/12 text-base text-white hover:bg-white/20"
            onClick={() => {
              unlockAudio()
              setSearchOpen(true)
            }}
          >
            <Search className="size-5" /> Procurar por nome
          </Button>
          {started && hasFlash && (
            <Button
              size="icon-lg"
              variant="secondary"
              aria-label={flashOn ? 'Desligar lanterna' : 'Ligar lanterna'}
              aria-pressed={flashOn}
              className={cn('press size-13 bg-white/12 text-white hover:bg-white/20', flashOn && 'bg-amber-300 text-amber-950 hover:bg-amber-200')}
              onClick={toggleFlash}
            >
              <Flashlight className="size-5" />
            </Button>
          )}
          {started && (
            <Button size="icon-lg" variant="secondary" aria-label="Trocar câmara" className="press size-13 bg-white/12 text-white hover:bg-white/20" onClick={switchCamera}>
              <SwitchCamera className="size-5" />
            </Button>
          )}
        </div>
      </footer>

      {/* Resultado */}
      {result && <ResultPanel result={result} onNext={next} />}

      <Drawer open={searchOpen} onOpenChange={setSearchOpen}>
        <DrawerContent className="h-[85dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Procurar convidado</DrawerTitle>
            <DrawerDescription>Para quem não tem o QR consigo. Confirme a identidade antes de dar entrada.</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <GuestSearch
              onCheckedIn={(r) => {
                setSearchOpen(false)
                busyRef.current = true
                show(r)
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  )
}

function ResultPanel({ result, onNext }: { result: Shown; onNext: () => void }) {
  const tone = {
    ok: 'bg-[oklch(0.56_0.15_152)]',
    duplicate: 'bg-[oklch(0.74_0.16_70)] text-[oklch(0.22_0.05_60)]',
    invalid: 'bg-[oklch(0.55_0.21_27)]',
    offline: 'bg-[oklch(0.4_0.03_245)]',
  }[result.status]

  const Icon = { ok: CheckCircle2, duplicate: AlertTriangle, invalid: XCircle, offline: WifiOff }[result.status]
  const title = { ok: 'Entrada autorizada', duplicate: 'Já entrou', invalid: 'QR inválido', offline: 'Sem ligação' }[result.status]

  return (
    <button
      type="button"
      onClick={onNext}
      aria-live="assertive"
      className={cn(
        'absolute inset-x-0 bottom-0 z-20 flex min-h-[62dvh] flex-col rounded-t-[32px] px-6 pt-8 text-left text-white',
        'animate-in slide-in-from-bottom-8 fade-in-0 duration-300 ease-[var(--ease-out-strong)]',
        'pb-[max(env(safe-area-inset-bottom),1.25rem)]',
        tone,
      )}
    >
      <Icon className="size-14" strokeWidth={2.2} />
      <h2 className="display mt-4 text-[3.4rem]">{title}</h2>

      {(result.status === 'ok' || result.status === 'duplicate') && (
        <div className="mt-4">
          <p className="text-2xl leading-tight font-extrabold text-balance">{result.guest.name}</p>
          {result.guest.organization && <p className="mt-1 opacity-85">{result.guest.organization}</p>}
          <span className="display mt-4 inline-block rounded-lg bg-black/20 px-3 py-1.5 text-2xl">{CATEGORY_LABEL[result.guest.category]}</span>
          {result.status === 'duplicate' && (
            <p className="mt-4 text-base font-semibold">
              Entrada registada às {clock(result.checkedInAt)}
              {result.checkedInBy ? ` · ${result.checkedInBy}` : ''}. Não deixe entrar de novo sem confirmar.
            </p>
          )}
        </div>
      )}
      {result.status === 'invalid' && <p className="mt-4 text-lg opacity-90">Este código não pertence a nenhuma credencial deste evento. Procure a pessoa pelo nome.</p>}
      {result.status === 'offline' && <p className="mt-4 text-lg opacity-90">A entrada não foi registada. Verifique a rede e leia o código outra vez.</p>}

      <span className="mt-auto pt-6 text-center text-sm font-semibold opacity-85">Toque para ler o seguinte</span>
    </button>
  )
}
