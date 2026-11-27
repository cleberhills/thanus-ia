/**
 * Janela de confiança temporária (SPEC-Endurecimento-03).
 *
 * Aprovação que vira ruído deixa de ser lida — é o argumento que o terminal-engine já usa para
 * liberar comandos allowlistados. A janela resolve o mesmo problema para o resto do tier
 * **médio**: o usuário diz, uma vez e de propósito, "durante as próximas 2 h, neste espaço,
 * estas ações não precisam me perguntar". Fora disso, tudo segue pedindo aprovação.
 *
 * O desenho é estreito de propósito. Cada restrição abaixo fecha um jeito de a janela virar
 * porta dos fundos:
 *
 *  - **Só o usuário abre.** `abertaPor: 'usuario'` é literal no tipo, e `abrirJanela` recusa
 *    qualquer outro valor. O modelo, um agente ou um workflow não abrem janela — se pudessem,
 *    a primeira coisa que um prompt injetado pediria seria abrir uma.
 *  - **Lista explícita de ações, todas de tier médio no seed.** Sem curinga. Ação `alto` não
 *    entra (a janela não rebaixa risco alto); ação `baixo` não precisa; ação fora do seed é
 *    desconhecida e o fail-closed não se negocia.
 *  - **Duração máxima de 12 h.** Janela que nunca fecha é allowlist disfarçada, e allowlist
 *    tem fluxo próprio, classificado como `permissions.change`.
 *  - **Só libera o que o seed classificou.** Decisão elevada por sensibilidade ou por path fora
 *    da allowlist continua pedindo aprovação: a elevação existe justamente porque aquele caso
 *    específico é mais arriscado que o médio de sempre.
 *  - **Nunca libera destrutivo nem dado sensível.** O padrão destrutivo do terminal e os dados
 *    `personal|financial|health|credential|secret` pausam sempre, com ou sem janela.
 *
 * Inspirado no `jarvis-unlock` do projeto JarvisOS (janela temporária aberta por quem tem mais
 * privilégio que o agente); reimplementação própria, sem código copiado.
 *
 * Puro: decide, não persiste. Quem guarda as janelas e audita abertura/uso é o main.
 */

import type { WorkspaceId } from '../domain/entities'
import type { ActionId, PolicyDecision, Sensitivity } from './contracts'
import { RISK_TAXONOMY } from './taxonomy'

/** Teto de uma janela: 12 horas. */
export const DURACAO_MAXIMA_MS = 12 * 60 * 60 * 1000

/** Sensibilidades que nenhuma janela libera — mais largas que `SENSIBILIDADES_PROTEGIDAS`. */
export const SENSIBILIDADES_FORA_DA_JANELA: readonly Sensitivity[] = [
  'personal',
  'financial',
  'health',
  'credential',
  'secret'
]

export interface JanelaDeConfianca {
  readonly id: string
  readonly workspace: WorkspaceId
  readonly acoes: readonly ActionId[]
  /** Epoch ms. */
  readonly abertaEm: number
  readonly expiraEm: number
  readonly abertaPor: 'usuario'
}

export interface PedidoDeAbertura {
  readonly id: string
  readonly workspace: WorkspaceId
  readonly acoes: readonly ActionId[]
  readonly duracaoMs: number
  readonly agora: number
  /** Quem pede. Só `'usuario'` abre; o resto existe para ser recusado com motivo. */
  readonly abertaPor: string
}

export type MotivoDeRecusaDaJanela =
  | 'so-o-usuario-abre'
  | 'duracao-invalida'
  | 'duracao-acima-do-maximo'
  | 'sem-acoes'
  | 'acao-desconhecida'
  | 'acao-fora-do-tier-medio'

export type ResultadoDaAbertura =
  | { readonly ok: true; readonly janela: JanelaDeConfianca }
  | { readonly ok: false; readonly motivo: MotivoDeRecusaDaJanela; readonly acao?: ActionId }

/** Valida um pedido de abertura e, se couber, devolve a janela pronta para persistir. */
export function abrirJanela(pedido: PedidoDeAbertura): ResultadoDaAbertura {
  if (pedido.abertaPor !== 'usuario') return { ok: false, motivo: 'so-o-usuario-abre' }
  if (!Number.isFinite(pedido.duracaoMs) || pedido.duracaoMs <= 0) {
    return { ok: false, motivo: 'duracao-invalida' }
  }
  if (pedido.duracaoMs > DURACAO_MAXIMA_MS) return { ok: false, motivo: 'duracao-acima-do-maximo' }
  if (pedido.acoes.length === 0) return { ok: false, motivo: 'sem-acoes' }
  for (const acao of pedido.acoes) {
    const entrada = RISK_TAXONOMY.get(acao)
    if (!entrada) return { ok: false, motivo: 'acao-desconhecida', acao }
    if (entrada.tier !== 'medio') return { ok: false, motivo: 'acao-fora-do-tier-medio', acao }
  }
  return {
    ok: true,
    janela: {
      id: pedido.id,
      workspace: pedido.workspace,
      acoes: [...new Set(pedido.acoes)],
      abertaEm: pedido.agora,
      expiraEm: pedido.agora + pedido.duracaoMs,
      abertaPor: 'usuario'
    }
  }
}

/** A janela está aberta neste instante? Intervalo semiaberto: `[abertaEm, expiraEm)`. */
export function janelaVigente(janela: JanelaDeConfianca, agora: number): boolean {
  return janela.abertaEm <= agora && agora < janela.expiraEm
}

/** O que o main sabe sobre a ação, além da decisão do Policy Engine. */
export interface ContextoDaJanela {
  readonly workspace: WorkspaceId
  readonly sensitivity?: Sensitivity
  /** O comando casou um padrão destrutivo (terminal) ou a ação é destrutiva por natureza. */
  readonly destrutivo: boolean
}

export interface DecisaoComJanela {
  readonly decisao: PolicyDecision
  /** Presente quando foi a janela que liberou — vai para o AuditEvent. */
  readonly janelaId?: string
}

/**
 * Aplica as janelas vigentes a uma decisão do Policy Engine. Só troca `requires-approval` por
 * `allow`; nunca toca em `block`, nunca em `allow`, nunca muda o `tier` registrado.
 */
export function aplicarJanela(
  decisao: PolicyDecision,
  contexto: ContextoDaJanela,
  janelas: readonly JanelaDeConfianca[],
  agora: number
): DecisaoComJanela {
  const elegivel =
    decisao.outcome === 'requires-approval' &&
    decisao.tier === 'medio' &&
    decisao.reason === 'classificada-pelo-seed' &&
    !contexto.destrutivo &&
    (contexto.sensitivity === undefined ||
      !SENSIBILIDADES_FORA_DA_JANELA.includes(contexto.sensitivity))
  if (!elegivel) return { decisao }

  const janela = janelas.find(
    (j) =>
      j.abertaPor === 'usuario' &&
      j.workspace === contexto.workspace &&
      j.acoes.includes(decisao.action) &&
      janelaVigente(j, agora)
  )
  if (!janela) return { decisao }
  return { decisao: { ...decisao, outcome: 'allow' }, janelaId: janela.id }
}
