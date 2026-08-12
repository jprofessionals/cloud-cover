const MET_USER_AGENT = 'cloud-cover/0.1 github.com/runarbell/cloud-cover'
const MET_ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/complete'

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const incoming = new URL(request.url)
  const lat = incoming.searchParams.get('lat')
  const lon = incoming.searchParams.get('lon')
  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'lat og lon er påkrevd' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const upstream = await fetch(`${MET_ENDPOINT}?lat=${lat}&lon=${lon}`, {
    // MET krever en identifiserende User-Agent. Nettleser-JS kan ikke sette den,
    // derfor finnes denne funksjonen.
    headers: { 'User-Agent': MET_USER_AGENT },
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json',
      // MET ber om at svar caches. Ti minutter er godt innenfor deres krav.
      'cache-control': 'public, max-age=600',
    },
  })
}
