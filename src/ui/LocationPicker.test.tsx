import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LocationPicker } from './LocationPicker'
import type { Place } from '../geo/geocode'

vi.mock('../geo/geocode', () => ({
  searchPlaces: vi.fn(),
}))

import { searchPlaces } from '../geo/geocode'

const searchPlacesMock = vi.mocked(searchPlaces)

const KOLSAAS: Place = {
  name: 'Kolsås',
  region: 'Akershus fylke, Norge',
  lat: 59.91363,
  lon: 10.51192,
  elevation: 85,
  timezone: 'Europe/Oslo',
}

const KOLBOTN: Place = {
  name: 'Kolbotn',
  region: 'Akershus fylke, Norge',
  lat: 59.8,
  lon: 10.8,
  elevation: 50,
  timezone: 'Europe/Oslo',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(globalThis.navigator, 'geolocation')
})

describe('LocationPicker — utdaterte søkesvar', () => {
  it('viser resultatet for det siste søket, selv om et eldre svar kommer inn senere', async () => {
    let resolveOlder!: (places: Place[]) => void
    let resolveNewer!: (places: Place[]) => void
    searchPlacesMock.mockImplementationOnce(() => new Promise((resolve) => (resolveOlder = resolve)))
    searchPlacesMock.mockImplementationOnce(() => new Promise((resolve) => (resolveNewer = resolve)))

    render(<LocationPicker value={null} onChange={() => {}} />)
    const input = screen.getByPlaceholderText('Søk etter sted')

    fireEvent.change(input, { target: { value: 'kol' } })
    fireEvent.change(input, { target: { value: 'kols' } })

    // Det nyere søket ("kols") svarer først, det eldre ("kol") svarer sent.
    resolveNewer([KOLSAAS])
    await waitFor(() => expect(screen.getByText('Kolsås')).toBeTruthy())

    resolveOlder([KOLBOTN])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.queryByText('Kolbotn')).toBeNull()
    expect(screen.getByText('Kolsås')).toBeTruthy()
  })
})

describe('LocationPicker — adopter GPS-posisjon én gang', () => {
  function mockGeolocation(coords: { latitude: number; longitude: number }) {
    const getCurrentPosition = vi.fn(
      (success: (position: { coords: { latitude: number; longitude: number; altitude: number | null } }) => void) => {
        success({ coords: { ...coords, altitude: null } })
      },
    )
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    })
  }

  it('kaller onChange én gang med GPS-posisjonen, og drar ikke brukeren tilbake etter et eget valg', async () => {
    mockGeolocation({ latitude: 59.9, longitude: 10.7 })
    const onChange = vi.fn()

    const { rerender } = render(<LocationPicker value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('Bruk min posisjon'))

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Min posisjon', lat: 59.9, lon: 10.7 }),
    )

    // Brukeren velger et annet sted fra søket. GPS-posisjonen henger fortsatt igjen
    // i hooken, men skal ikke overstyre valget nå som `value` er satt.
    rerender(<LocationPicker value={KOLSAAS} onChange={onChange} />)
    rerender(<LocationPicker value={KOLSAAS} onChange={onChange} />)

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('adopterer en fersk GPS-posisjon selv etter at brukeren har valgt et sted fra søket', async () => {
    mockGeolocation({ latitude: 60.39, longitude: 5.32 })
    const onChange = vi.fn()

    // Brukeren har allerede valgt et sted fra søket.
    render(<LocationPicker value={KOLSAAS} onChange={onChange} />)

    // "Bruk min posisjon" skal fortsatt virke, ikke være dødt fordi et sted
    // allerede er valgt.
    fireEvent.click(screen.getByText('Bruk min posisjon'))

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Min posisjon', lat: 60.39, lon: 5.32 }),
    )
  })
})
