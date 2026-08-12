import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type Place } from '../geo/geocode'
import { useGeolocation } from '../geo/useGeolocation'

type Props = {
  value: Place | null
  onChange: (place: Place) => void
}

export function LocationPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [error, setError] = useState<string | null>(null)
  const geo = useGeolocation()
  // Følger med hvilket søk som ble sendt sist, slik at et sent svar på et
  // eldre søk ikke overskriver resultatet av et nyere.
  const latestQuery = useRef('')
  // Husker hvilken GPS-posisjon som sist er adoptert, slik at vi kan skille
  // en fersk posisjon (adopter den, selv om brukeren har valgt noe annet
  // etterpå — knappen skal aldri bli dødt) fra samme posisjon liggende igjen
  // fra et tidligere kall (skal ikke dra brukeren tilbake ved en vilkårlig
  // rerender).
  const adoptedFixId = useRef(0)

  // Adopter posisjonen fra nettleseren automatisk hver gang en ny posisjon
  // kommer inn. Kjøres som effekt (ikke under render) for å unngå å sette
  // parent-state mens komponenten rendrer.
  useEffect(() => {
    if (geo.status === 'granted' && geo.place && geo.fixId !== adoptedFixId.current) {
      adoptedFixId.current = geo.fixId
      onChange(geo.place)
    }
  }, [geo.status, geo.place, geo.fixId, onChange])

  async function search(next: string) {
    setQuery(next)
    setError(null)
    latestQuery.current = next
    try {
      const found = await searchPlaces(next)
      if (latestQuery.current !== next) return
      setResults(found)
    } catch {
      if (latestQuery.current !== next) return
      setError('Fikk ikke kontakt med stedssøket.')
    }
  }

  return (
    <div className="location-picker">
      <button type="button" onClick={geo.request} disabled={geo.status === 'asking'}>
        {geo.status === 'asking' ? 'Finner posisjon…' : 'Bruk min posisjon'}
      </button>
      {geo.status === 'denied' && <p className="hint">Søk opp et sted i stedet.</p>}

      <input
        type="search"
        value={query}
        placeholder="Søk etter sted"
        onChange={(e) => void search(e.target.value)}
      />
      {error && <p className="error">{error}</p>}

      <ul>
        {results.map((place) => (
          <li key={`${place.lat},${place.lon}`}>
            <button type="button" onClick={() => onChange(place)}>
              {place.name}
              {place.region && <span className="region"> · {place.region}</span>}
            </button>
          </li>
        ))}
      </ul>

      {value && <p className="current">Valgt: {value.name}</p>}
    </div>
  )
}
