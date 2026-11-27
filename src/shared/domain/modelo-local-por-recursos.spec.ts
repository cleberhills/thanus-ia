import { describe, expect, it } from 'vitest'
import {
  FOLGA_MB,
  cabe,
  escolherModeloLocal,
  memoriaNecessariaMb,
  type ModeloInstalado,
  type RecursosDaMaquina
} from './modelo-local-por-recursos'

const GB = 1024 * 1024 * 1024
const PEQUENO: ModeloInstalado = { nome: 'qwen2.5-coder', tamanhoBytes: 2 * GB }
const MEDIO: ModeloInstalado = { nome: 'llama3.1', tamanhoBytes: 4.7 * GB }
const GRANDE: ModeloInstalado = { nome: 'qwen3:8b', tamanhoBytes: 5.2 * GB }
const TODOS = [GRANDE, PEQUENO, MEDIO]

function recursos(livreGb: number, cargaPct = 20): RecursosDaMaquina {
  return { memoriaTotalMb: 32 * 1024, memoriaLivreMb: livreGb * 1024, cargaPct }
}

describe('modelo local por recursos (SPEC-Endurecimento-04)', () => {
  it('memória necessária = tamanho × fator + folga', () => {
    expect(memoriaNecessariaMb({ nome: 'x', tamanhoBytes: 1 * GB })).toBe(
      Math.ceil(1024 * 1.2) + FOLGA_MB
    )
  })

  it('o preferido vence quando cabe', () => {
    expect(escolherModeloLocal(TODOS, recursos(16), 'llama3.1')).toMatchObject({
      modelo: 'llama3.1',
      motivo: 'preferido-cabe'
    })
  })

  it('preferido que não cabe cai no maior que cabe', () => {
    // 6.8 GB livres: o de 5.2 GB precisa de ~7.2 GB; o de 4.7 GB precisa de ~6.6 GB.
    const r = recursos(6.8)
    expect(cabe(GRANDE, r)).toBe(false)
    expect(escolherModeloLocal(TODOS, r, 'qwen3:8b')).toMatchObject({
      modelo: 'llama3.1',
      motivo: 'maior-que-cabe'
    })
  })

  it('sem preferido escolhe o maior que cabe', () => {
    expect(escolherModeloLocal(TODOS, recursos(16)).modelo).toBe('qwen3:8b')
  })

  it('carga alta prefere o menor que cabe, mesmo com preferido', () => {
    expect(escolherModeloLocal(TODOS, recursos(16, 95), 'qwen3:8b')).toMatchObject({
      modelo: 'qwen2.5-coder',
      motivo: 'menor-por-carga-alta'
    })
  })

  it('nada cabe ⇒ sem modelo, com motivo', () => {
    expect(escolherModeloLocal(TODOS, recursos(2))).toEqual({ motivo: 'memoria-insuficiente' })
  })

  it('nenhum instalado (ou entradas inválidas) ⇒ nenhum-instalado', () => {
    expect(escolherModeloLocal([], recursos(16))).toEqual({ motivo: 'nenhum-instalado' })
    expect(
      escolherModeloLocal(
        [
          { nome: '', tamanhoBytes: GB },
          { nome: 'x', tamanhoBytes: Number.NaN }
        ],
        recursos(16)
      )
    ).toEqual({ motivo: 'nenhum-instalado' })
  })

  it('é determinístico com tamanhos iguais (desempate por nome)', () => {
    const a = { nome: 'a', tamanhoBytes: GB }
    const b = { nome: 'b', tamanhoBytes: GB }
    expect(escolherModeloLocal([b, a], recursos(16, 95)).modelo).toBe('a')
  })
})
