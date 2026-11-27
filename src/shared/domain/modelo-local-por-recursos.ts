/**
 * Escolha do modelo local pelos recursos da máquina (SPEC-Endurecimento-04).
 *
 * O Ollama aceita carregar um modelo maior que a memória livre — e aí a máquina inteira troca
 * para swap, o app trava e a geração demora minutos. Hoje a rota local usa o modelo
 * configurado sem perguntar se ele cabe. Esta função responde a essa pergunta **antes** de a
 * chamada sair.
 *
 * Decisões:
 *
 *  - **Sem tabela de modelos fixa.** O tamanho vem do próprio Ollama (`/api/tags` devolve
 *    `size` de cada modelo instalado). Uma tabela "modelo → RAM" escrita aqui envelheceria a
 *    cada quantização nova e violaria a regra "sem hardcode".
 *  - **O preferido vence quando cabe.** A escolha do usuário (ou da fase) é respeitada sempre
 *    que a memória permite; a função só intervém quando ela não cabe.
 *  - **Carga alta prefere o menor.** Com CPU acima de `CARGA_ALTA_PCT`, o modelo que cabe e é
 *    menor responde antes — e não disputa a máquina com o que o usuário está fazendo.
 *  - **Nada cabe ⇒ `undefined` com motivo.** Quem chama decide (rota cloud, aviso na UI); esta
 *    função nunca "escolhe mesmo assim".
 *
 * Inspirada na tabela RAM→modelo dos instaladores do JarvisOS; reescrita como regra sobre o
 * tamanho real informado pelo Ollama. Pura: o main lê memória e carga e passa os números.
 */

/** Folga mínima de memória livre além do modelo, em MiB (SO, app, contexto do modelo). */
export const FOLGA_MB = 1024

/** O modelo ocupa mais que o arquivo em disco (KV cache, buffers). Fator conservador. */
export const FATOR_DE_OCUPACAO = 1.2

/** Acima disto, a máquina está ocupada: prefere o menor modelo que cabe. */
export const CARGA_ALTA_PCT = 85

export interface ModeloInstalado {
  readonly nome: string
  /** Tamanho em bytes, como o Ollama informa em `/api/tags`. */
  readonly tamanhoBytes: number
}

export interface RecursosDaMaquina {
  readonly memoriaTotalMb: number
  readonly memoriaLivreMb: number
  /** Carga de CPU em % (0–100+), média de 1 minuto normalizada pelos núcleos. */
  readonly cargaPct: number
}

export type MotivoDaEscolha =
  | 'preferido-cabe'
  | 'maior-que-cabe'
  | 'menor-por-carga-alta'
  | 'nenhum-instalado'
  | 'memoria-insuficiente'

export interface EscolhaDoModelo {
  readonly modelo?: string
  readonly motivo: MotivoDaEscolha
  /** Memória estimada que o modelo escolhido vai ocupar, em MiB. */
  readonly necessarioMb?: number
}

/** Memória que um modelo precisa livre para rodar sem swap, em MiB. */
export function memoriaNecessariaMb(modelo: ModeloInstalado): number {
  return Math.ceil((modelo.tamanhoBytes / (1024 * 1024)) * FATOR_DE_OCUPACAO) + FOLGA_MB
}

/** O modelo cabe na memória livre agora? */
export function cabe(modelo: ModeloInstalado, recursos: RecursosDaMaquina): boolean {
  return memoriaNecessariaMb(modelo) <= recursos.memoriaLivreMb
}

/** Escolhe o modelo local a usar. Ver as decisões no cabeçalho. */
export function escolherModeloLocal(
  instalados: readonly ModeloInstalado[],
  recursos: RecursosDaMaquina,
  preferido?: string
): EscolhaDoModelo {
  const validos = instalados.filter(
    (m) => m.nome.trim() !== '' && Number.isFinite(m.tamanhoBytes) && m.tamanhoBytes > 0
  )
  if (validos.length === 0) return { motivo: 'nenhum-instalado' }

  const queCabem = validos
    .filter((m) => cabe(m, recursos))
    .sort((a, b) => a.tamanhoBytes - b.tamanhoBytes || (a.nome < b.nome ? -1 : 1))
  if (queCabem.length === 0) return { motivo: 'memoria-insuficiente' }

  const cargaAlta = recursos.cargaPct >= CARGA_ALTA_PCT
  const escolhaDe = (m: ModeloInstalado, motivo: MotivoDaEscolha): EscolhaDoModelo => ({
    modelo: m.nome,
    motivo,
    necessarioMb: memoriaNecessariaMb(m)
  })

  const pref = preferido === undefined ? undefined : queCabem.find((m) => m.nome === preferido)
  if (pref && !cargaAlta) return escolhaDe(pref, 'preferido-cabe')

  const menor = queCabem[0]
  const maior = queCabem[queCabem.length - 1]
  if (cargaAlta && menor) return escolhaDe(menor, 'menor-por-carga-alta')
  return maior ? escolhaDe(maior, 'maior-que-cabe') : { motivo: 'memoria-insuficiente' }
}
