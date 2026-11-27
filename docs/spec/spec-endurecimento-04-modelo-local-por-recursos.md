# SPEC-Endurecimento-04 — Modelo local por recursos

- MVP/Fatia: MVP-029 · M29-F04.
- Issue: — (criada pelo Cowork quando `aprovada-pi`).
- Status: **proposta** — regra e leitura de recursos implementadas; ligação à rota pendente.
- Depende de: SPEC-Providers-04 (roteamento), rota `ollama`.

## Objetivo

Evitar que a rota local carregue um modelo que não cabe na memória livre (swap, app travado).

## Dentro (implementado)

- `src/shared/domain/modelo-local-por-recursos.ts` — `escolherModeloLocal(instalados, recursos,
  preferido?)`. Memória necessária = `tamanho × 1,2 + 1024 MiB`. O preferido vence quando cabe;
  senão o maior que cabe; com CPU ≥ 85 %, o menor que cabe; nada cabe ⇒ sem modelo, com motivo.
  **Sem tabela de modelos**: o tamanho vem do Ollama (`/api/tags`).
- `src/main/ai/recursos-locais.ts` — lê memória total/livre e carga normalizada (`node:os`);
  Windows reporta carga 0 (só desliga a preferência por carga).

## Pendente

1. `OllamaAdapter` expor a lista de modelos com `size` (`/api/tags`).
2. Consultar a escolha antes da chamada local; se o modelo efetivo diferir do configurado,
   registrar no trace e avisar na UI. Se nada couber: erro claro com próximo passo
   ("feche aplicações ou escolha uma rota cloud"), nunca carregar mesmo assim.

## Fora

- Download automático de modelos.
- GPU/VRAM — a primeira versão mede só RAM do sistema.

## Critérios de aceite (da regra)

1. Preferido que cabe é mantido; que não cabe cai no maior que cabe.
2. Carga alta escolhe o menor que cabe; nada cabe ⇒ `memoria-insuficiente`.
3. Determinístico em empate (por nome).
4. `modelo-local-por-recursos.spec.ts` (8) e `recursos-locais.spec.ts` (3).

## Perguntas ao PI

1. Trocar o modelo automaticamente ou só avisar e pedir confirmação?
