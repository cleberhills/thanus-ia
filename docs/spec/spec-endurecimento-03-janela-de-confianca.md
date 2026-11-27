# SPEC-Endurecimento-03 — Janela de confiança temporária

- MVP/Fatia: MVP-029 · M29-F03.
- Issue: — (criada pelo Cowork quando `aprovada-pi`).
- Status: **proposta** — regra pura implementada; persistência, IPC e UI pendentes.
- Depende de: SPEC-Execucao-02 (Policy Engine).

## Objetivo

Deixar o usuário dispensar a aprovação de ações de **tier médio** escolhidas, num espaço, por
tempo limitado — para que a aprovação continue sendo lida quando aparece.

## Dentro (implementado)

`src/shared/policies/janela-de-confianca.ts`:

- `abrirJanela` — só `abertaPor: 'usuario'`; duração em `(0, 12 h]`; lista explícita de ações,
  todas de tier **médio** no seed (sem curinga, sem `alto`, sem desconhecida).
- `aplicarJanela` — troca `requires-approval` por `allow` **só** quando: tier médio, razão
  `classificada-pelo-seed`, não destrutivo, sensibilidade fora de
  `personal|financial|health|credential|secret`, janela vigente do mesmo espaço cobrindo a ação.
  Devolve `janelaId` para auditoria. Nunca altera `block`, `allow` nem o `tier`.

## Pendente

1. Persistência (tabela `trust_window`, migration) e expiração na leitura.
2. IPC `trustWindow.open/close/list` — abertura **só** pelo renderer, por ação explícita do
   usuário; abrir e fechar geram `AuditEvent`.
3. Ponto de aplicação: após `policy.classify` em `RealFileSystemEngine`, `ConnectorService` e
   demais caminhos que pausam em `requires-approval`. O terminal já libera allowlistados por
   decisão de 2026-08-28; a janela não muda o caminho destrutivo dele.
4. UI: indicador permanente de "janela aberta" com tempo restante e botão de fechar.

## Fora

- Rebaixar `alto` ou liberar destrutivo — proibido por construção.
- Janela aberta por agente, workflow ou modelo.

## Critérios de aceite (da regra)

1. Abertura recusada para não-usuário, duração inválida/acima de 12 h, lista vazia, ação
   desconhecida ou fora do tier médio.
2. Aplicação libera só nas condições acima; expirada, outro espaço ou ação fora da lista não
   libera; destrutivo, dado sensível e decisão elevada por path nunca são liberados.
3. `janela-de-confianca.spec.ts` — 12 testes.

## Perguntas ao PI

1. 12 h é o teto certo?
2. A janela fecha ao bloquear o ecrã / fechar o app?
