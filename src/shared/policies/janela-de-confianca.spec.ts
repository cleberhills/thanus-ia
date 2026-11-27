import { describe, expect, it } from 'vitest'
import { evaluate } from './evaluate'
import {
  DURACAO_MAXIMA_MS,
  abrirJanela,
  aplicarJanela,
  janelaVigente,
  type JanelaDeConfianca
} from './janela-de-confianca'

const AGORA = 1_000_000
const HORA = 60 * 60 * 1000

function janela(extra: Partial<JanelaDeConfianca> = {}): JanelaDeConfianca {
  const r = abrirJanela({
    id: 'j1',
    workspace: 'jarvis',
    acoes: ['api.external-call', 'fs.write-allowed'],
    duracaoMs: 2 * HORA,
    agora: AGORA,
    abertaPor: 'usuario'
  })
  if (!r.ok) throw new Error(r.motivo)
  return { ...r.janela, ...extra }
}

describe('janela de confiança (SPEC-Endurecimento-03)', () => {
  describe('abertura', () => {
    it('abre para ações de tier médio, com expiração calculada', () => {
      const j = janela()
      expect(j.expiraEm).toBe(AGORA + 2 * HORA)
      expect(j.abertaPor).toBe('usuario')
    })

    it('só o usuário abre — modelo, agente e workflow são recusados', () => {
      for (const abertaPor of ['modelo', 'agente', 'workflow', '']) {
        expect(
          abrirJanela({
            id: 'x',
            workspace: 'jarvis',
            acoes: ['api.external-call'],
            duracaoMs: HORA,
            agora: AGORA,
            abertaPor
          })
        ).toEqual({ ok: false, motivo: 'so-o-usuario-abre' })
      }
    })

    it('recusa duração inválida e acima de 12 h', () => {
      const base = {
        id: 'x',
        workspace: 'jarvis' as const,
        acoes: ['api.external-call'],
        agora: AGORA,
        abertaPor: 'usuario'
      }
      expect(abrirJanela({ ...base, duracaoMs: 0 }).ok).toBe(false)
      expect(abrirJanela({ ...base, duracaoMs: Number.NaN }).ok).toBe(false)
      expect(abrirJanela({ ...base, duracaoMs: DURACAO_MAXIMA_MS + 1 })).toEqual({
        ok: false,
        motivo: 'duracao-acima-do-maximo'
      })
      expect(abrirJanela({ ...base, duracaoMs: DURACAO_MAXIMA_MS }).ok).toBe(true)
    })

    it('recusa lista vazia, ação desconhecida e ação fora do tier médio', () => {
      const base = {
        id: 'x',
        workspace: 'jarvis' as const,
        duracaoMs: HORA,
        agora: AGORA,
        abertaPor: 'usuario'
      }
      expect(abrirJanela({ ...base, acoes: [] })).toEqual({ ok: false, motivo: 'sem-acoes' })
      expect(abrirJanela({ ...base, acoes: ['*'] })).toEqual({
        ok: false,
        motivo: 'acao-desconhecida',
        acao: '*'
      })
      expect(abrirJanela({ ...base, acoes: ['kanban.create-task'] })).toMatchObject({
        ok: false,
        motivo: 'acao-fora-do-tier-medio'
      })
    })

    it('intervalo de vigência é semiaberto', () => {
      const j = janela()
      expect(janelaVigente(j, AGORA - 1)).toBe(false)
      expect(janelaVigente(j, AGORA)).toBe(true)
      expect(janelaVigente(j, j.expiraEm)).toBe(false)
    })
  })

  describe('aplicação', () => {
    const contexto = { workspace: 'jarvis' as const, destrutivo: false }

    it('libera ação médio classificada pelo seed, dentro da janela', () => {
      const decisao = evaluate('api.external-call', { workspace: 'jarvis' })
      expect(decisao.outcome).toBe('requires-approval')
      const r = aplicarJanela(decisao, contexto, [janela()], AGORA + HORA)
      expect(r.decisao.outcome).toBe('allow')
      expect(r.decisao.tier).toBe('medio')
      expect(r.janelaId).toBe('j1')
    })

    it('não libera depois de expirar, em outro espaço ou para ação fora da lista', () => {
      const decisao = evaluate('api.external-call', { workspace: 'jarvis' })
      expect(
        aplicarJanela(decisao, contexto, [janela()], AGORA + 3 * HORA).janelaId
      ).toBeUndefined()
      expect(
        aplicarJanela(decisao, { ...contexto, workspace: 'noa' }, [janela()], AGORA).janelaId
      ).toBeUndefined()
      const outra = evaluate('provider.connect', { workspace: 'jarvis' })
      expect(aplicarJanela(outra, contexto, [janela()], AGORA).decisao.outcome).toBe(
        'requires-approval'
      )
    })

    it('nunca libera destrutivo', () => {
      const decisao = evaluate('api.external-call', { workspace: 'jarvis' })
      const r = aplicarJanela(decisao, { ...contexto, destrutivo: true }, [janela()], AGORA)
      expect(r.decisao.outcome).toBe('requires-approval')
    })

    it('nunca libera dado sensível, nem credencial/segredo', () => {
      const decisao = evaluate('api.external-call', { workspace: 'noa' })
      for (const sensitivity of ['personal', 'credential', 'secret'] as const) {
        const r = aplicarJanela(
          decisao,
          { workspace: 'noa', destrutivo: false, sensitivity },
          [janela({ workspace: 'noa' })],
          AGORA
        )
        expect(r.decisao.outcome).toBe('requires-approval')
      }
    })

    it('não libera decisão elevada por path fora da allowlist', () => {
      const decisao = evaluate('fs.write-allowed', { workspace: 'jarvis', pathAllowed: false })
      expect(decisao.reason).toBe('elevada-por-path-fora-da-allowlist')
      expect(aplicarJanela(decisao, contexto, [janela()], AGORA).decisao.outcome).toBe(
        'requires-approval'
      )
    })

    it('não toca em block nem em allow', () => {
      const bloqueada = evaluate('acao.inexistente', { workspace: 'jarvis' })
      expect(aplicarJanela(bloqueada, contexto, [janela()], AGORA).decisao).toBe(bloqueada)
      const livre = evaluate('kanban.create-task', { workspace: 'jarvis' })
      expect(aplicarJanela(livre, contexto, [janela()], AGORA).decisao).toBe(livre)
    })

    it('ignora janela forjada que não foi aberta pelo usuário', () => {
      const forjada = { ...janela(), abertaPor: 'modelo' } as unknown as JanelaDeConfianca
      const decisao = evaluate('api.external-call', { workspace: 'jarvis' })
      expect(aplicarJanela(decisao, contexto, [forjada], AGORA).janelaId).toBeUndefined()
    })
  })
})
