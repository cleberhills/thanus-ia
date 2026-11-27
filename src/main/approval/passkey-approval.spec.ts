import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  PRAZO_MAXIMO_S,
  RegistroDeContadoresEmMemoria,
  RegistroDeNoncesEmMemoria,
  aprovarPorPasskey,
  bufferParaBase64url,
  carregarChavePublica,
  desafioDaAprovacao,
  digestDoPedido,
  jsonCanonico,
  type AssercaoPasskey,
  type ConfigPasskey,
  type DependenciasDaAprovacao,
  type PedidoAprovavel
} from './passkey-approval'

const CONFIG: ConfigPasskey = { rpId: 'jarvis.local', origem: 'https://jarvis.local' }
const AGORA = 1_800_000_000

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const PEDIDO: PedidoAprovavel = {
  id: 'apr-1',
  action: 'terminal.run-destructive',
  workspace_id: 'jarvis',
  operation: { binary: 'rm', args: ['-rf', 'build'], cwd: '/home/u/proj' }
}

function sha(dados: string | Buffer): Buffer {
  return createHash('sha256').update(dados).digest()
}

interface Opcoes {
  readonly pedidos?: readonly string[]
  readonly exp?: number
  readonly nonce?: string
  readonly flags?: number
  readonly contador?: number
  readonly origem?: string
  readonly rpId?: string
  readonly tipo?: string
  readonly desafio?: string
  readonly chavePrivada?: KeyObject
}

/** Simula o que o navegador do telemóvel produz numa navigator.credentials.get(). */
function assinar(o: Opcoes = {}): AssercaoPasskey {
  const pedidos = o.pedidos ?? [digestDoPedido(PEDIDO)]
  const exp = o.exp ?? AGORA + 60
  const nonce = o.nonce ?? 'nonce-aleatorio-0001'
  const contador = Buffer.alloc(4)
  contador.writeUInt32BE(o.contador ?? 0)
  const authData = Buffer.concat([
    sha(o.rpId ?? CONFIG.rpId),
    Buffer.from([o.flags ?? 0x05]),
    contador
  ])
  const clientRaw = Buffer.from(
    JSON.stringify({
      type: o.tipo ?? 'webauthn.get',
      challenge: o.desafio ?? desafioDaAprovacao(pedidos, exp, nonce),
      origin: o.origem ?? CONFIG.origem
    })
  )
  const assinatura = sign(
    'sha256',
    Buffer.concat([authData, sha(clientRaw)]),
    o.chavePrivada ?? privateKey
  )
  return {
    v: 1,
    chave: 'telemovel',
    authenticatorData: bufferParaBase64url(authData),
    clientDataJSON: bufferParaBase64url(clientRaw),
    assinatura: bufferParaBase64url(assinatura),
    pedidos,
    exp,
    nonce
  }
}

function deps(extra: Partial<DependenciasDaAprovacao> = {}): DependenciasDaAprovacao {
  return {
    config: CONFIG,
    chaves: new Map([['telemovel', { chave: carregarChavePublica(PEM) }]]),
    nonces: new RegistroDeNoncesEmMemoria(),
    agora: () => AGORA,
    ...extra
  }
}

describe('aprovação por passkey (SPEC-Endurecimento-02)', () => {
  it('aprova uma asserção válida para o pedido exato', () => {
    expect(aprovarPorPasskey(PEDIDO, assinar(), deps())).toEqual({ ok: true, chave: 'telemovel' })
  })

  it('o digest depende do conteúdo, não da ordem dos campos', () => {
    const reordenado: PedidoAprovavel = {
      operation: { cwd: '/home/u/proj', args: ['-rf', 'build'], binary: 'rm' },
      workspace_id: 'jarvis',
      action: 'terminal.run-destructive',
      id: 'apr-1'
    }
    expect(digestDoPedido(reordenado)).toBe(digestDoPedido(PEDIDO))
    expect(
      digestDoPedido({ ...PEDIDO, operation: { ...PEDIDO.operation, args: ['-rf', '/'] } })
    ).not.toBe(digestDoPedido(PEDIDO))
  })

  it('JSON canônico escapa não-ASCII e recusa número não finito', () => {
    expect(jsonCanonico({ b: 1, a: 'ç' })).toBe('{"a":"\\u00e7","b":1}')
    expect(() => jsonCanonico({ a: Number.NaN })).toThrow()
  })

  it('recusa quando a operação mudou depois da assinatura', () => {
    const alterado = { ...PEDIDO, operation: { ...PEDIDO.operation, args: ['-rf', '/'] } }
    expect(aprovarPorPasskey(alterado, assinar(), deps())).toEqual({
      ok: false,
      motivo: 'pedido-nao-coberto'
    })
  })

  it('cada (nonce, pedido) só vale uma vez', () => {
    const d = deps()
    const a = assinar()
    expect(aprovarPorPasskey(PEDIDO, a, d).ok).toBe(true)
    expect(aprovarPorPasskey(PEDIDO, a, d)).toEqual({ ok: false, motivo: 'ja-utilizada' })
  })

  it('um lote aprova cada pedido uma vez', () => {
    const outro = { ...PEDIDO, id: 'apr-2' }
    const d = deps()
    const a = assinar({ pedidos: [digestDoPedido(PEDIDO), digestDoPedido(outro)] })
    expect(aprovarPorPasskey(PEDIDO, a, d).ok).toBe(true)
    expect(aprovarPorPasskey(outro, a, d).ok).toBe(true)
  })

  it('recusa expirada e prazo maior que o máximo', () => {
    expect(aprovarPorPasskey(PEDIDO, assinar({ exp: AGORA }), deps()).ok).toBe(false)
    expect(aprovarPorPasskey(PEDIDO, assinar({ exp: AGORA + PRAZO_MAXIMO_S + 1 }), deps())).toEqual(
      { ok: false, motivo: 'prazo-longo-demais' }
    )
  })

  it('recusa sem verificação do usuário (UV) ou sem presença (UP)', () => {
    expect(aprovarPorPasskey(PEDIDO, assinar({ flags: 0x01 }), deps())).toEqual({
      ok: false,
      motivo: 'sem-presenca-ou-verificacao'
    })
    expect(aprovarPorPasskey(PEDIDO, assinar({ flags: 0x04 }), deps()).ok).toBe(false)
  })

  it('recusa origem, rpId, tipo e desafio errados', () => {
    const casos: [Opcoes, string][] = [
      [{ origem: 'https://atacante.example' }, 'origem-invalida'],
      [{ rpId: 'atacante.example' }, 'rp-invalido'],
      [{ tipo: 'webauthn.create' }, 'tipo-invalido'],
      [{ desafio: 'outro' }, 'desafio-nao-confere']
    ]
    for (const [o, motivo] of casos) {
      expect(aprovarPorPasskey(PEDIDO, assinar(o), deps())).toEqual({ ok: false, motivo })
    }
  })

  it('recusa assinatura de chave não cadastrada e chave desconhecida', () => {
    const intrusa = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
    expect(aprovarPorPasskey(PEDIDO, assinar({ chavePrivada: intrusa }), deps())).toEqual({
      ok: false,
      motivo: 'assinatura-invalida'
    })
    expect(aprovarPorPasskey(PEDIDO, { ...assinar(), chave: 'outro' }, deps())).toEqual({
      ok: false,
      motivo: 'chave-desconhecida'
    })
  })

  it('recusa assinatura adulterada sem lançar', () => {
    const a = assinar()
    const ruim = { ...a, assinatura: bufferParaBase64url(Buffer.from('lixo')) }
    expect(aprovarPorPasskey(PEDIDO, ruim, deps())).toEqual({
      ok: false,
      motivo: 'assinatura-invalida'
    })
  })

  it('recusa asserção malformada e versão desconhecida', () => {
    expect(aprovarPorPasskey(PEDIDO, { ...assinar(), pedidos: [] }, deps()).ok).toBe(false)
    expect(aprovarPorPasskey(PEDIDO, { ...assinar(), nonce: 'curto' }, deps()).ok).toBe(false)
    expect(aprovarPorPasskey(PEDIDO, { ...assinar(), clientDataJSON: '%%%' }, deps())).toEqual({
      ok: false,
      motivo: 'assercao-malformada'
    })
    expect(
      aprovarPorPasskey(PEDIDO, { ...assinar(), v: 2 } as unknown as AssercaoPasskey, deps())
    ).toEqual({ ok: false, motivo: 'versao-desconhecida' })
  })

  it('detecta autenticador clonado pelo contador que regride', () => {
    const contadores = new RegistroDeContadoresEmMemoria()
    const d = deps({ contadores })
    expect(
      aprovarPorPasskey(PEDIDO, assinar({ contador: 5, nonce: 'nonce-a-0000000001' }), d).ok
    ).toBe(true)
    expect(
      aprovarPorPasskey(PEDIDO, assinar({ contador: 5, nonce: 'nonce-b-0000000001' }), d)
    ).toEqual({ ok: false, motivo: 'contador-regrediu' })
  })

  it('contador zero (passkey sincronizada) não é comparado', () => {
    const d = deps({ contadores: new RegistroDeContadoresEmMemoria() })
    expect(aprovarPorPasskey(PEDIDO, assinar({ nonce: 'nonce-a-0000000001' }), d).ok).toBe(true)
    expect(aprovarPorPasskey(PEDIDO, assinar({ nonce: 'nonce-b-0000000001' }), d).ok).toBe(true)
  })

  it('só aceita chave P-256', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey
    expect(() =>
      carregarChavePublica(rsa.export({ type: 'spki', format: 'pem' }).toString())
    ).toThrow(/P-256/)
  })

  it('o registro de nonces descarta entradas vencidas', () => {
    const r = new RegistroDeNoncesEmMemoria()
    expect(r.consumir('k', AGORA + 10, AGORA)).toBe(true)
    expect(r.consumir('k', AGORA + 10, AGORA + 5)).toBe(false)
    expect(r.consumir('k', AGORA + 100, AGORA + 11)).toBe(true)
  })
})
