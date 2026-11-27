# SPEC-Endurecimento-02 — Aprovação por passkey

- MVP/Fatia: MVP-029 · M29-F02.
- Issue: — (criada pelo Cowork quando `aprovada-pi`).
- Status: **proposta** — núcleo de verificação implementado; transporte e UI pendentes.
- Depende de: SPEC-ExecucaoReal-01/02 (fila de `ApprovalRequest`).

## Objetivo

Permitir que um `ApprovalRequest` seja aprovado no telemóvel do usuário, com passkey (WebAuthn),
de modo que a aprovação fique **ligada ao conteúdo exato** do pedido.

## Dentro (implementado)

`src/main/approval/passkey-approval.ts`:

- `digestDoPedido` — SHA-256 do JSON canônico de `{id, action, workspace_id, operation}`.
- `desafioDaAprovacao` — desafio WebAuthn sobre `{v:1, pedidos (ordenados), exp, nonce}`; a
  página do telemóvel calcula o mesmo.
- `verificarAssercao` — tipo `webauthn.get`, origem, desafio, rpIdHash, flags **UP e UV**,
  assinatura **ES256** (DER) com chave cadastrada, e contador anti-clonagem quando > 0.
- `aprovarPorPasskey` — acima + expiração, prazo máximo de **120 s**, digest coberto e nonce de
  uso único por (nonce, pedido). O nonce é gasto por último.
- Registros em memória de nonces e contadores; `carregarChavePublica` aceita só P-256.
- Resultado tipado com motivo de recusa (14 motivos), sem exceção para entrada hostil.

## Pendente (próximas fatias, decisão do PI)

1. **Cadastro de chave**: fluxo `navigator.credentials.create()` numa página servida pelo app e
   persistência da chave pública (tabela nova, migration). Cadastrar chave é ação de alto risco
   (`permissions.change`), feita só pela UI.
2. **Transporte**: como a página do telemóvel chega ao app (rede local, túnel, QR code com URL de
   loopback). Exige origem HTTPS estável — ponto em aberto.
3. **Ligação ao fluxo**: `TerminalEngine.resolveApproval` / `RealFileSystemEngine` aceitarem
   `decisao: 'aprovado'` também via passkey; `resolved_by` registra `passkey:<id-da-chave>`.
4. **Nonces em SQLite**, para sobreviver a reinício dentro da janela de 120 s.

## Fora

- Substituir o clique: a passkey é opção adicional; o clique continua válido.
- Aprovação de gates do planejamento (`Approval` da SPEC-Planejamento-06) — semântica distinta.

## Critérios de aceite (do núcleo)

1. Asserção válida aprova exatamente o pedido assinado; mudar a operação invalida.
2. Reuso do mesmo (nonce, pedido) é recusado.
3. Sem UV, origem/RP/tipo/desafio errados, chave não cadastrada, assinatura adulterada,
   expirada ou com prazo > 120 s ⇒ recusa com motivo.
4. Contador que regride ⇒ recusa; contador 0 (passkey sincronizada) não é comparado.
5. `passkey-approval.spec.ts` — 16 testes, com par de chaves P-256 gerado no teste.

## Perguntas ao PI

1. A passkey deve ser **obrigatória** para algum tier (ex.: `alto`) ou sempre opcional?
2. Qual transporte prefere para o telemóvel (rede local, túnel, outro)?
