/**
 * Aprovação por passkey (SPEC-Endurecimento-02).
 *
 * Hoje um `ApprovalRequest` é resolvido por um clique na interface. Isto acrescenta um segundo
 * jeito, mais forte: o usuário aprova **no telemóvel**, com a passkey dele (biometria/PIN), e o
 * que o telemóvel assina é o **digest exato do pedido** — ação, espaço e operação. O app só
 * aceita a aprovação se a assinatura conferir com uma chave previamente cadastrada.
 *
 * O que isso compra, em relação ao clique:
 *
 *  - **Liga a aprovação ao conteúdo.** O clique aprova "o pedido que estava na tela"; a passkey
 *    aprova "este digest". Se a operação mudar entre o pedido e a decisão, o digest muda e a
 *    aprovação não serve — não há como aprovar uma coisa e executar outra.
 *  - **Presença e verificação do usuário.** A asserção só vale com as flags UP e UV ligadas: um
 *    toque e uma biometria/PIN no autenticador. Um processo no computador, mesmo com a sessão
 *    aberta, não produz isso sozinho.
 *  - **Uso único e prazo curto.** Cada (nonce, pedido) é gasto uma vez, e a aprovação expira em
 *    no máximo `PRAZO_MAXIMO_S`. Uma asserção capturada não é reutilizável.
 *
 * Reimplementação própria (clean-room) da ideia de "aprovação assinada por passkey" descrita
 * publicamente pelo projeto JarvisOS; nenhum código foi copiado.
 *
 * **O que este módulo não faz:** não fala com o telemóvel, não serve a página WebAuthn e não
 * persiste nonces em disco. Ele recebe a asserção já transportada e decide se ela vale. O
 * transporte e a persistência são fatias seguintes (ver a spec).
 */

import { createHash, createPublicKey, verify as verificarEcdsa, type KeyObject } from 'node:crypto'

/** Validade máxima de uma aprovação, em segundos. Curta de propósito: aprova-se o que se vê. */
export const PRAZO_MAXIMO_S = 120

/** Flags do authenticatorData (WebAuthn §6.1). */
const FLAG_UP = 0x01
const FLAG_UV = 0x04

/** O mínimo de um pedido que entra no digest — exatamente o que define "o que será feito". */
export interface PedidoAprovavel {
  readonly id: string
  readonly action: string
  readonly workspace_id: string
  readonly operation: Readonly<Record<string, unknown>>
}

/** A asserção que chega do telemóvel. Campos binários em base64url. */
export interface AssercaoPasskey {
  readonly v: 1
  /** Id da chave cadastrada que assinou. */
  readonly chave: string
  readonly authenticatorData: string
  readonly clientDataJSON: string
  readonly assinatura: string
  /** Digests dos pedidos cobertos por esta aprovação (uma aprovação pode cobrir um lote). */
  readonly pedidos: readonly string[]
  /** Expiração, em segundos Unix. */
  readonly exp: number
  readonly nonce: string
}

/** Configuração do relying party: precisa casar com a página onde a passkey foi criada. */
export interface ConfigPasskey {
  readonly rpId: string
  readonly origem: string
}

/** Chave pública cadastrada (o contador anti-clonagem vive à parte, em `RegistroDeContadores`). */
export interface ChaveCadastrada {
  readonly chave: KeyObject
}

/**
 * Onde se gasta um nonce. `consumir` devolve `false` se a chave já foi gasta — e precisa ser
 * **atômico**: dois pedidos simultâneos com a mesma asserção não podem ambos receber `true`.
 */
export interface RegistroDeNonces {
  consumir(chave: string, expiraEm: number, agora: number): boolean
}

/**
 * Contadores de assinatura por chave. Autenticadores que contam (signCount > 0) nunca repetem
 * nem recuam; se recuarem, há duas cópias da mesma chave. Passkeys sincronizadas costumam
 * mandar sempre 0 — nesse caso não há o que comparar e a verificação é pulada.
 */
export interface RegistroDeContadores {
  ultimo(chave: string): number | undefined
  registrar(chave: string, contador: number): void
}

export type MotivoDeRecusa =
  | 'assercao-malformada'
  | 'versao-desconhecida'
  | 'chave-desconhecida'
  | 'tipo-invalido'
  | 'origem-invalida'
  | 'desafio-nao-confere'
  | 'rp-invalido'
  | 'sem-presenca-ou-verificacao'
  | 'assinatura-invalida'
  | 'contador-regrediu'
  | 'expirada'
  | 'prazo-longo-demais'
  | 'pedido-nao-coberto'
  | 'ja-utilizada'

export type ResultadoDaAprovacao =
  | { readonly ok: true; readonly chave: string }
  | { readonly ok: false; readonly motivo: MotivoDeRecusa }

export function base64urlParaBuffer(texto: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(texto)) throw new Error('base64url inválido')
  return Buffer.from(texto, 'base64url')
}

export function bufferParaBase64url(dados: Uint8Array): string {
  return Buffer.from(dados).toString('base64url')
}

/**
 * JSON canônico: chaves ordenadas, sem espaços, só ASCII. É o que torna o digest reproduzível
 * dos dois lados (app e página do telemóvel) sem depender da ordem de inserção dos campos.
 */
export function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    if (typeof valor === 'number' && !Number.isFinite(valor)) {
      throw new Error('número não finito não tem forma canônica')
    }
    return JSON.stringify(valor).replace(
      /[\u007f-￿]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
    )
  }
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`
  const entradas = Object.entries(valor as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entradas.map(([k, v]) => `${jsonCanonico(k)}:${jsonCanonico(v)}`).join(',')}}`
}

function sha256(dados: string | Uint8Array): Buffer {
  return createHash('sha256').update(dados).digest()
}

/** O digest de um pedido: o que o telemóvel mostra e assina. */
export function digestDoPedido(pedido: PedidoAprovavel): string {
  return sha256(
    jsonCanonico({
      id: pedido.id,
      action: pedido.action,
      workspace_id: pedido.workspace_id,
      operation: pedido.operation
    })
  ).toString('hex')
}

/** O desafio WebAuthn de uma aprovação. A página do telemóvel calcula o mesmo. */
export function desafioDaAprovacao(pedidos: readonly string[], exp: number, nonce: string): string {
  return bufferParaBase64url(
    sha256(jsonCanonico({ v: 1, pedidos: [...pedidos].sort(), exp, nonce }))
  )
}

/** Carrega uma chave pública PEM, aceitando só P-256 (ES256, o algoritmo das passkeys). */
export function carregarChavePublica(pem: string): KeyObject {
  const chave = createPublicKey(pem)
  const detalhes = chave.asymmetricKeyDetails
  if (chave.asymmetricKeyType !== 'ec' || detalhes?.namedCurve !== 'prime256v1') {
    throw new Error('a chave precisa ser P-256 (ES256)')
  }
  return chave
}

interface AssercaoDecodificada {
  readonly authData: Buffer
  readonly clientRaw: Buffer
  readonly assinatura: Buffer
  readonly client: {
    readonly type?: unknown
    readonly origin?: unknown
    readonly challenge?: unknown
  }
}

function decodificar(assercao: AssercaoPasskey): AssercaoDecodificada | undefined {
  try {
    if (
      typeof assercao.chave !== 'string' ||
      typeof assercao.nonce !== 'string' ||
      assercao.nonce.length < 16 ||
      !Number.isInteger(assercao.exp) ||
      !Array.isArray(assercao.pedidos) ||
      assercao.pedidos.length === 0 ||
      !assercao.pedidos.every((p) => typeof p === 'string' && /^[0-9a-f]{64}$/.test(p))
    ) {
      return undefined
    }
    const clientRaw = base64urlParaBuffer(assercao.clientDataJSON)
    const client: unknown = JSON.parse(clientRaw.toString('utf8'))
    if (typeof client !== 'object' || client === null) return undefined
    return {
      authData: base64urlParaBuffer(assercao.authenticatorData),
      clientRaw,
      assinatura: base64urlParaBuffer(assercao.assinatura),
      client: client as AssercaoDecodificada['client']
    }
  } catch {
    return undefined
  }
}

/**
 * Verifica só a criptografia e o vínculo com o RP: tipo, origem, desafio, rpIdHash, flags e a
 * assinatura ES256. Não olha prazo, pedido nem nonce — isso é `aprovarPorPasskey`.
 */
export function verificarAssercao(
  assercao: AssercaoPasskey,
  config: ConfigPasskey,
  chaves: ReadonlyMap<string, ChaveCadastrada>,
  contadores?: RegistroDeContadores
): ResultadoDaAprovacao {
  if (assercao?.v !== 1) return { ok: false, motivo: 'versao-desconhecida' }
  const d = decodificar(assercao)
  if (!d) return { ok: false, motivo: 'assercao-malformada' }
  const cadastrada = chaves.get(assercao.chave)
  if (!cadastrada) return { ok: false, motivo: 'chave-desconhecida' }

  if (d.client.type !== 'webauthn.get') return { ok: false, motivo: 'tipo-invalido' }
  if (d.client.origin !== config.origem) return { ok: false, motivo: 'origem-invalida' }
  if (d.client.challenge !== desafioDaAprovacao(assercao.pedidos, assercao.exp, assercao.nonce)) {
    return { ok: false, motivo: 'desafio-nao-confere' }
  }
  // authenticatorData = rpIdHash(32) | flags(1) | signCount(4) | ...
  if (d.authData.length < 37) return { ok: false, motivo: 'assercao-malformada' }
  if (!d.authData.subarray(0, 32).equals(sha256(config.rpId))) {
    return { ok: false, motivo: 'rp-invalido' }
  }
  const flags = d.authData[32] ?? 0
  if ((flags & FLAG_UP) === 0 || (flags & FLAG_UV) === 0) {
    return { ok: false, motivo: 'sem-presenca-ou-verificacao' }
  }

  const assinado = Buffer.concat([d.authData, sha256(d.clientRaw)])
  let valida = false
  try {
    valida = verificarEcdsa(
      'sha256',
      assinado,
      { key: cadastrada.chave, dsaEncoding: 'der' },
      d.assinatura
    )
  } catch {
    valida = false
  }
  if (!valida) return { ok: false, motivo: 'assinatura-invalida' }

  const contador = d.authData.readUInt32BE(33)
  if (contadores && contador > 0) {
    const anterior = contadores.ultimo(assercao.chave)
    if (anterior !== undefined && contador <= anterior) {
      return { ok: false, motivo: 'contador-regrediu' }
    }
    contadores.registrar(assercao.chave, contador)
  }
  return { ok: true, chave: assercao.chave }
}

export interface DependenciasDaAprovacao {
  readonly config: ConfigPasskey
  readonly chaves: ReadonlyMap<string, ChaveCadastrada>
  readonly nonces: RegistroDeNonces
  readonly contadores?: RegistroDeContadores
  /** Segundos Unix. Injetável para teste. */
  readonly agora?: () => number
}

/**
 * Decide se uma asserção aprova **este** pedido. Só devolve `ok: true` quando, nesta ordem:
 * a assinatura confere, a aprovação não expirou nem dura mais que `PRAZO_MAXIMO_S`, o digest do
 * pedido está entre os cobertos, e o par (nonce, digest) ainda não foi gasto.
 *
 * O nonce é gasto **por último**: uma asserção recusada por outro motivo não queima o nonce de
 * um pedido legítimo do mesmo lote.
 */
export function aprovarPorPasskey(
  pedido: PedidoAprovavel,
  assercao: AssercaoPasskey,
  deps: DependenciasDaAprovacao
): ResultadoDaAprovacao {
  const verificacao = verificarAssercao(assercao, deps.config, deps.chaves, deps.contadores)
  if (!verificacao.ok) return verificacao

  const agora = deps.agora?.() ?? Math.floor(Date.now() / 1000)
  if (assercao.exp <= agora) return { ok: false, motivo: 'expirada' }
  if (assercao.exp - agora > PRAZO_MAXIMO_S) return { ok: false, motivo: 'prazo-longo-demais' }

  const digest = digestDoPedido(pedido)
  if (!assercao.pedidos.includes(digest)) return { ok: false, motivo: 'pedido-nao-coberto' }

  const chaveDoNonce = sha256(`${assercao.nonce}:${digest}`).toString('hex')
  if (!deps.nonces.consumir(chaveDoNonce, assercao.exp, agora)) {
    return { ok: false, motivo: 'ja-utilizada' }
  }
  return verificacao
}

/**
 * Registro de nonces em memória. Suficiente para uma sessão do app: o prazo máximo é de dois
 * minutos, então um reinício do app depois disso já não tem nada a proteger. A versão em SQLite
 * (que sobrevive a reinício dentro da janela) fica para a fatia de persistência.
 */
export class RegistroDeNoncesEmMemoria implements RegistroDeNonces {
  private readonly gastos = new Map<string, number>()

  consumir(chave: string, expiraEm: number, agora: number): boolean {
    for (const [k, exp] of this.gastos) if (exp < agora) this.gastos.delete(k)
    if (this.gastos.has(chave)) return false
    this.gastos.set(chave, expiraEm)
    return true
  }
}

/** Contadores em memória — mesmo raciocínio do registro de nonces. */
export class RegistroDeContadoresEmMemoria implements RegistroDeContadores {
  private readonly vistos = new Map<string, number>()

  ultimo(chave: string): number | undefined {
    return this.vistos.get(chave)
  }

  registrar(chave: string, contador: number): void {
    this.vistos.set(chave, contador)
  }
}
