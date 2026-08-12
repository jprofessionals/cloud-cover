import { describe, it, expect } from 'vitest'
import { layerWeights, scoreSample } from './weights'

describe('layerWeights', () => {
  it('vekter cirrus lavt når sola står høyt', () => {
    expect(layerWeights(45).high).toBe(0.45)
  })
  it('vekter cirrus høyt når sola står lavt', () => {
    expect(layerWeights(1).high).toBe(0.85)
  })
  it('vekter lave skyer absolutt uansett solhøyde', () => {
    expect(layerWeights(45).low).toBe(1)
    expect(layerWeights(1).low).toBe(1)
  })
  it('bruker grensene inklusivt nedenfra', () => {
    expect(layerWeights(10).mid).toBe(0.9)
    expect(layerWeights(9.99).mid).toBe(0.95)
    expect(layerWeights(3).mid).toBe(0.95)
    expect(layerWeights(2.99).mid).toBe(1)
  })
})

describe('scoreSample', () => {
  it('gir full score ved skyfri himmel', () => {
    expect(scoreSample({ time: new Date(), low: 0, mid: 0, high: 0 }, 20)).toBe(100)
  })
  it('gir null score ved tett lavt skydekke', () => {
    expect(scoreSample({ time: new Date(), low: 100, mid: 0, high: 0 }, 20)).toBe(0)
  })
  it('kombinerer lag multiplikativt, ikke additivt', () => {
    // To lag på 50 % skal ikke gi 0. Med wM=0.9 og wH=0.55 ved 20 grader:
    // blokkert = 1 - (1-0.5*0.9)(1-0.5*0.55) = 1 - 0.55*0.725 = 0.60125
    const s = scoreSample({ time: new Date(), low: 0, mid: 50, high: 50 }, 20)
    expect(s).toBeCloseTo(39.875, 2)
  })
})
