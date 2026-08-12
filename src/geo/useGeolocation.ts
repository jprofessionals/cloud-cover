import { useCallback, useState } from 'react'
import type { Place } from './geocode'

export type GeolocationStatus = 'idle' | 'asking' | 'granted' | 'denied'

export function useGeolocation() {
  const [place, setPlace] = useState<Place | null>(null)
  const [status, setStatus] = useState<GeolocationStatus>('idle')
  // Øker for hver nye posisjon vi mottar, slik at forbrukere kan skille en
  // fersk posisjon (skal adopteres) fra samme posisjon liggende igjen fra et
  // tidligere kall (skal ikke overstyre et senere manuelt valg).
  const [fixId, setFixId] = useState(0)

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('denied')
      return
    }
    setStatus('asking')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPlace({
          name: 'Min posisjon',
          region: '',
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          elevation: position.coords.altitude ?? 0,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        setStatus('granted')
        setFixId((id) => id + 1)
      },
      // Avslag er ikke en feil. Brukeren får søkefeltet i stedet.
      () => setStatus('denied'),
      { timeout: 10_000 },
    )
  }, [])

  return { place, status, fixId, request }
}
