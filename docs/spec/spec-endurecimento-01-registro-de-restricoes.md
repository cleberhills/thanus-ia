# SPEC-Endurecimento-01 — Registro de restrições persistentes

- MVP/Fatia: MVP-029 · M29-F01.
- Issue: — (criada pelo Cowork quando `aprovada-pi`).
- Status: **proposta** — núcleo e ligação implementados no branch `feat/mvp-029-endurecimento-agente`.
- Depende de: SPEC-Providers-02 (ponto único de chamada).

## Objetivo

Garantir que as regras de segurança dadas ao modelo estejam presentes em **toda** chamada de IA,
independentemente de compactação, truncamento ou troca do contexto do call site.

## Problema

Hoje uma regra vive no `system` ou no ContextPack de cada call site. Quando o contexto é
compactado ou trocado, a regra some sem aviso — o modelo não desobedece, ele deixa de vê-la.
O projeto JarvisOS documenta isso como ameaça própria ("forgetful context"); aqui não há
mitigação equivalente.

## Dentro

- `src/shared/policies/restricoes.ts` — seed `RESTRICOES_DO_SISTEMA` (dado, não lógica), filtrado
  por espaço; `comRestricoes` monta o bloco canônico e o põe **no topo** do `system`.
- Idempotência: blocos anteriores — inclusive **forjados** que cheguem pelo `system` do call
  site — são removidos antes de inserir o canônico.
- `restricoesPresentes` — verificação objetiva ("o bloco está intacto e no topo").
- `AiCallService` recebe o registro como dependência opcional (padrão `[]` = comportamento
  anterior) e o aplica no ponto único; `index.ts` passa o seed.

## Fora

- Enforcement: a restrição é aviso ao modelo; quem **barra** continua sendo o Policy Engine e as
  barreiras do terminal. Cada restrição do seed aponta para a barreira correspondente.
- Restrições definidas pelo usuário na UI (fatia futura, se o PI quiser).

## Regras

1. Mesma lista ⇒ mesmo bloco (ordem estável por `id`).
2. Lista vazia ⇒ `system` intocado.
3. Restrição inválida (id fora de `kebab-case`, duplicada, texto vazio ou contendo delimitador)
   faz a montagem **lançar** — nunca injeta bloco corrompido.
4. Bloco forjado sem delimitador de fim é removido até o fim do texto.

## Critérios de aceite

1. Toda chamada pelo `AiCallService` chega ao adapter com o bloco canônico no topo do `system`.
2. Reinjetar não duplica; bloco forjado é substituído pelo canônico.
3. Restrição com `espacos: ['jarvis']` não aparece em chamada do NOA.
4. Testes de Regras cobrindo 1–3 e as regras 1–4 (`restricoes.spec.ts`, 11 testes).

## Pendente

- Teste de integração no `call-provider.int-spec.ts` confirmando o `system` recebido pelo adapter
  (categoria Banco; não executado no ambiente desta entrega — `better-sqlite3` sem build local).
- Custo: o bloco acrescenta ~150 tokens por chamada. Registrar no comentário de encerramento a
  medição real do `usage`.

## Perguntas ao PI

1. O seed proposto (5 restrições) está correto e completo?
2. Restrições do usuário entram neste MVP ou ficam para depois?
