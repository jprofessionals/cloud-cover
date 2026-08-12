import { describe, it, expect } from 'vitest'
import { formatPercent, compassName } from './index'

describe('formatPercent', () => {
  it('runder til nærmeste hele prosent', () => {
    expect(formatPercent(0.874)).toBe('87 %')
  })
})

describe('compassName', () => {
  it('gir nord for 0 grader', () => {
    expect(compassName(0)).toBe('nord')
  })
  it('gir vest for 270 grader', () => {
    expect(compassName(270)).toBe('vest')
  })
  it('gir nordvest for 315 grader', () => {
    expect(compassName(315)).toBe('nordvest')
  })
  it('håndterer verdier over 360', () => {
    expect(compassName(361)).toBe('nord')
  })
})
