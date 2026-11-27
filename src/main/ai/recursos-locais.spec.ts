import { describe, expect, it } from 'vitest'
import { lerRecursosDaMaquina } from './recursos-locais'

const MB = 1024 * 1024

describe('recursos locais (SPEC-Endurecimento-04)', () => {
  it('converte para MiB e normaliza a carga pelos núcleos', () => {
    expect(
      lerRecursosDaMaquina({
        totalmem: () => 16384 * MB,
        freemem: () => 8000 * MB,
        loadavg: () => [6, 4, 2],
        nucleos: () => 8
      })
    ).toEqual({ memoriaTotalMb: 16384, memoriaLivreMb: 8000, cargaPct: 75 })
  })

  it('Windows (loadavg zerado) e zero núcleos não quebram', () => {
    expect(
      lerRecursosDaMaquina({
        totalmem: () => 1024 * MB,
        freemem: () => 512 * MB,
        loadavg: () => [],
        nucleos: () => 0
      }).cargaPct
    ).toBe(0)
  })

  it('lê a máquina real sem lançar', () => {
    const r = lerRecursosDaMaquina()
    expect(r.memoriaTotalMb).toBeGreaterThan(0)
    expect(r.memoriaLivreMb).toBeLessThanOrEqual(r.memoriaTotalMb)
  })
})
