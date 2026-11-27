# SEGURANCA-ESTADO.md — O que bloqueia e o que só registra

> Inspirado na tabela de estado do projeto JarvisOS: dizer com honestidade onde a política é
> **aplicada** e onde ela só **classifica e audita** ("modo report"). Este documento descreve o
> código em `feat/mvp-029-endurecimento-agente` (2026-11-27) e precisa ser atualizado quando um
> caminho mudar de modo. Não pode ficar à frente do código.

## Legenda

- **Aplica** — a decisão do Policy Engine (ou barreira equivalente) impede a execução.
- **Report** — `policy.classify` é chamado e auditado, mas o resultado não barra nada.

## Caminhos de execução

| Caminho | Ação classificada | Modo | Observação |
|---|---|---|---|
| Terminal (`execution/terminal-engine.ts`) | `terminal.run-allowlisted` / `-destructive` | **Aplica** | Elevação bloqueada; binário e cwd fora da allowlist bloqueados; destrutivo pausa para aprovação; `shell: false`. Allowlistado não destrutivo é liberado (decisão do PI, 2026-08-28) |
| Sistema de ficheiros real (`execution/real-filesystem-engine.ts`) | ações `fs.*` | **Aplica** | Pausa em `requires-approval`; re-valida na retomada |
| Aprovação de Squad (`squads/squad-aprovacao.ts`) | ação sensível do Squad | **Aplica** | `allow` é tratado como erro de seed e falha fechado |
| Ponto único de IA (`ai/call-provider.ts`) | `api.external-call` | **Report** | O gate que aplica aqui é o de **orçamento**, não o de política. A F01 do MVP-029 reinjeta restrições no `system` (aviso ao modelo, não barreira) |
| Conectores (`connectors/connector-service.ts`) | `api.external-call` | **Report** | Chamada externa sai sem aprovação |
| Workflows/automações (`workflows/workflow-service.ts`) | `automation.upsert`, `workflow.toggle` | **Report** | Edição de catálogo; a execução de workflow é simulada |
| Allowlist de comandos (`policy/command-allowlist-repository.ts`) | `permissions.change` (alto) | **Report** | Ato do usuário pela UI; classificado e auditado, sem segunda confirmação |
| Credenciais por agente (`credentials/credential-service.ts`) | `secrets.change` | **Report** | Só classifica quando o ator é `agente` — **um agente que altere credencial é auditado, não impedido**. Candidato prioritário a enforcement |
| Simulação (`execution/simulation-engine.ts`) | ação da etapa | — | Não toca recurso real |
| Cronograma (`index.ts`) | `cronograma.*` | depende do consumidor | `avaliar` devolve a decisão; verificar se o serviço a respeita |

## Proteções transversais

| Proteção | Estado |
|---|---|
| Renderer sem Node, IPC tipado, `contextIsolation` | Implementado |
| Tokens no cofre do SO (`safeStorage`) | Implementado |
| Redação obrigatória em logs (ADR-005) | Implementado |
| Restrições persistentes reinjetadas em toda chamada (M29-F01) | Implementado no branch |
| Aprovação por passkey (M29-F02) | Núcleo implementado; transporte/UI pendentes |
| Janela de confiança (M29-F03) | Regra implementada; persistência/UI pendentes |
| Modelo local por recursos (M29-F04) | Regra implementada; ligação à rota pendente |

## Propostas (decisão do PI, não implementadas)

1. Enforcement de `secrets.change` quando o ator é `agente` — pausar em aprovação.
2. Enforcement de `api.external-call` em conectores com efeito externo (envio, publicação).
3. Revisar o item **Cronograma**: confirmar no `CronogramaService` que `block` é respeitado.
