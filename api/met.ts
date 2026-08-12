const MET_USER_AGENT = 'cloud-cover/0.1 github.com/runarbell/cloud-cover'
const MET_ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/complete'

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const incoming = new URL(request.url)
  const lat = Number(incoming.searchParams.get('lat'))
  const lon = Number(incoming.searchParams.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: 'lat og lon må være tall' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  // Bygges med URLSearchParams (ikke strengmal) slik at en ondsinnet verdi i
  // lat/lon ikke kan injisere ekstra spørreparametre i kallet mot MET.
  const upstreamParams = new URLSearchParams({ lat: String(lat), lon: String(lon) })
  const upstream = await fetch(`${MET_ENDPOINT}?${upstreamParams}`, {
    // MET krever en identifiserende User-Agent. Nettleser-JS kan ikke sette den,
    // derfor finnes denne funksjonen.
    headers: { 'User-Agent': MET_USER_AGENT },
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      // MET ber om at svar caches, men bare når det faktisk var et gyldig
      // svar — en forbigående 5xx skal ikke bli hengende i cachen i ti minutter.
      'cache-control': upstream.ok ? 'public, max-age=600' : 'no-store',
    },
  })
}
