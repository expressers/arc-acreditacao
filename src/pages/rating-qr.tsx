import { Printer } from 'lucide-react'
import { useApi } from '@/lib/hooks'
import { ArcLogo, EventLockup, QrImage } from '@/components/brand'
import { Button } from '@/components/ui/button'
import type { EventSettings } from '@shared/guests'

function publicRatingLink() {
  return `${window.location.origin}/avaliar`
}

/**
 * Cartaz para projetar ou imprimir no evento: um único QR leva qualquer pessoa
 * à avaliação aberta, sem precisar do convite ou da credencial.
 */
export default function RatingQrPage() {
  const { data: s } = useApi<EventSettings>('/api/public/settings')
  const link = publicRatingLink()

  return (
    <main className="arc-sky relative isolate grid min-h-dvh place-items-center overflow-hidden px-6 py-10 text-white print:[background-image:none] print:bg-white print:text-brand-950">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <ArcLogo className="h-10 print:hidden" />
        {s && <EventLockup s={s} size="lg" className="mt-8 w-full" />}

        <div className="mt-9 rounded-[2rem] bg-white p-4 shadow-[0_24px_60px_-20px_oklch(0.2_0.08_250/0.55)]">
          <QrImage text={link} className="w-[min(72vw,21rem)]" />
        </div>

        <h1 className="display mt-8 text-4xl sm:text-5xl">Avalie o evento</h1>
        <p className="mt-3 max-w-md text-lg leading-snug text-white/90 print:text-brand-900">
          Aponte a câmara do telemóvel para o QR Code.
          <br />
          <strong className="font-bold">1 a 10 estrelas</strong> · comentário opcional
        </p>
        <p className="mt-5 text-sm font-semibold tracking-wide text-white/75 tabular print:text-brand-700">{link}</p>

        <Button
          variant="secondary"
          className="press mt-8 h-11 bg-white/15 text-white hover:bg-white/25 print:hidden"
          onClick={() => window.print()}
        >
          <Printer className="size-4" /> Imprimir cartaz
        </Button>
      </div>
    </main>
  )
}
