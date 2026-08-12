import { useState } from 'react'
import { LocationPicker } from './LocationPicker'
import { Verdict } from './Verdict'
import { Timeline } from './Timeline'
import { useForecast } from './useForecast'
import type { Place } from '../geo/geocode'
import './app.css'

export default function App() {
  const [place, setPlace] = useState<Place | null>(null)
  const state = useForecast(place)
  const timeZone = place?.timezone ?? 'Europe/Oslo'

  return (
    <main className="app">
      <div className="panel panel--left">
        <LocationPicker value={place} onChange={setPlace} />

        {state.status === 'idle' && (
          <p className="hint">Velg et sted for å se om du får sett formørkelsen.</p>
        )}
        {state.status === 'loading' && <p className="hint">Henter varsel…</p>}

        {state.status === 'no-eclipse' && (
          <p className="hint">Fant ingen solformørkelse synlig fra dette stedet.</p>
        )}

        {state.status === 'no-weather' && state.circumstances && (
          <p className="hint">
            Formørkelsen er {state.circumstances.peak.time.toLocaleDateString('nb-NO')}, men
            værvarsel finnes bare omtrent 16 dager fram i tid. Kom tilbake nærmere datoen.
          </p>
        )}

        {state.status === 'error' && (
          <p className="error">Fikk ikke hentet skydata: {state.error}</p>
        )}

        {state.status === 'ready' && state.circumstances && state.score && state.forecast && (
          <>
            <Verdict
              circumstances={state.circumstances}
              score={state.score}
              timeZone={timeZone}
              source={state.forecast.source}
            />
            <Timeline
              samples={state.windowSamples}
              circumstances={state.circumstances}
              timeZone={timeZone}
            />
          </>
        )}
      </div>

      <div className="panel panel--right">
        <p className="hint">Kart kommer i neste versjon.</p>
      </div>
    </main>
  )
}
