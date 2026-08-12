const COMPASS = [
  'nord', 'nordøst', 'øst', 'sørøst',
  'sør', 'sørvest', 'vest', 'nordvest',
] as const

export function compassName(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360
  const index = Math.round(normalized / 45) % 8
  return COMPASS[index]
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`
}

export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date)
}

export function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date)
}
