import type { EclipseCircumstances } from '../eclipse/types'
import type { LocationScore } from '../scoring/types'
import type { ForecastSource } from '../weather/types'
import { EclipseFacts } from './EclipseFacts'

const HEADLINE: Record<LocationScore['verdict'], string> = {
  clear: 'Ja, det ser bra ut',
  mixed: 'Kanskje, det veksler',
  clouded: 'Nei, overskyet',
  unknown: 'Vet ikke',
}

type Props = {
  circumstances: EclipseCircumstances
  score: LocationScore
  timeZone: string
  source: ForecastSource
}

export function Verdict({ circumstances, score, timeZone, source }: Props) {
  return (
    <section className={`verdict verdict--${score.verdict}`}>
      <h1>{HEADLINE[score.verdict]}</h1>
      <p className="reason">{score.reason}</p>
      <EclipseFacts circumstances={circumstances} timeZone={timeZone} />
      <p className="source">
        Skydata fra {source === 'met' ? 'MET (yr.no)' : 'Open-Meteo'}.
      </p>
    </section>
  )
}
