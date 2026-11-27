/** Superfície pública do Policy Engine (SPEC-Execucao-02) e da allowlist (SPEC-Execucao-03). */
export { evaluate } from './evaluate'
export { isPathAllowed } from './allowlist'
export {
  canonicalizeBinary,
  isCommandAllowed,
  isElevationAttempt,
  PREFIXOS_DE_ELEVACAO,
  type CommandRequest
} from './command'
export {
  matchDestructivePattern,
  DESTRUCTIVE_PATTERNS,
  type DestructivePattern
} from './destructive-commands'
export { RISK_TAXONOMY, type TaxonomyEntry } from './taxonomy'
export {
  SENSITIVITIES,
  RISK_TIERS,
  POLICY_REASONS,
  isSensitivity,
  isRiskTier,
  type Sensitivity,
  type RiskTier,
  type PolicyOutcome,
  type PolicyContext,
  type PolicyDecision,
  type PolicyReason,
  type ActionId
} from './contracts'
export {
  RESTRICOES_DO_SISTEMA,
  INICIO_DO_BLOCO,
  FIM_DO_BLOCO,
  blocoDeRestricoes,
  comRestricoes,
  removerBloco,
  restricoesDoEspaco,
  restricoesPresentes,
  validarRestricoes,
  type Restricao,
  type ProblemaDeRestricao
} from './restricoes'
export {
  DURACAO_MAXIMA_MS,
  SENSIBILIDADES_FORA_DA_JANELA,
  abrirJanela,
  aplicarJanela,
  janelaVigente,
  type JanelaDeConfianca,
  type PedidoDeAbertura,
  type ResultadoDaAbertura,
  type MotivoDeRecusaDaJanela,
  type ContextoDaJanela,
  type DecisaoComJanela
} from './janela-de-confianca'
