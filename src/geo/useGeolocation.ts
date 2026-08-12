import { useCallback, useState } from 'react'
import type { Place } from './geocode'

export type GeolocationStatus = 'idle' | 'asking' | 'granted' | 'denied'

export function useGeolocation() {
  const [place, setPlace] = useState<Place | null>(null)
  const [status, setStatus] = useState<GeolocationStatus>('idle')

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
      },
      // Avslag er ikke en feil. Brukeren får søkefeltet i stedet.
      () => setStatus('denied'),
      { timeout: 10_000 },
    )
  }, [])

  return { place, status, request }
}
