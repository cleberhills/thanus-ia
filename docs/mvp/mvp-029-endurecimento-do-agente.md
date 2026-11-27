# MVP-029 — Endurecimento do agente

- Status: **proposta** — aguardando decisão do PI (nenhuma fatia `aprovada-pi` ainda).
- Origem: análise comparativa com o projeto público JarvisOS (`JarvisOSLinux/jarvisos`, GPL-3.0).
  Só **ideias** foram aproveitadas; todo o código é reimplementação própria em TypeScript, sem
  cópia — o rrb-jarvisOS continua `UNLICENSED`.
- Dimensionamento (DIMENSIONAMENTO.md): **T2 · R3** — mudanças pequenas e isoladas, mas no
  caminho de segurança (Policy Engine, aprovação, ponto único de IA).

## Objetivo

Fechar quatro lacunas que a comparação expôs, sem tocar no que já funciona:

1. regras de segurança dadas ao modelo **expiram** quando o contexto é compactado ("contexto
   esquecido");
2. a aprovação humana é um clique que não fica **ligado ao conteúdo** aprovado;
3. o tier médio pede aprovação para tudo, o que transforma aprovação em **ruído**;
4. a rota local carrega modelos **sem verificar se cabem** na memória.

## Fatias previstas

- [ ] **M29-F01** — Registro de restrições persistentes · [SPEC-Endurecimento-01](../spec/spec-endurecimento-01-registro-de-restricoes.md)
- [ ] **M29-F02** — Aprovação por passkey · [SPEC-Endurecimento-02](../spec/spec-endurecimento-02-aprovacao-por-passkey.md)
- [ ] **M29-F03** — Janela de confiança temporária · [SPEC-Endurecimento-03](../spec/spec-endurecimento-03-janela-de-confianca.md)
- [ ] **M29-F04** — Modelo local por recursos · [SPEC-Endurecimento-04](../spec/spec-endurecimento-04-modelo-local-por-recursos.md)

Transversal: [`docs/SEGURANCA-ESTADO.md`](../SEGURANCA-ESTADO.md) — o que cada caminho de execução
**bloqueia** e o que ainda está em **modo report**.

## O que já existe no branch `feat/mvp-029-endurecimento-agente`

O **núcleo puro** de cada fatia, com testes de Regras (50 novos, suíte `regras` inteira verde:
3710/3710). A F01 já está ligada ao ponto único de IA; F02–F04 têm núcleo e testes, e a ligação
à UI/IPC é o que resta em cada spec (§ Pendente).

## Fora

- Integração com o sistema operacional JarvisOS (polkit, `/dev/jarvis`, dmcp) — seria outro MVP.
- Enforcement do Policy Engine nos caminhos hoje em modo report — decisão do PI, listada em
  `SEGURANCA-ESTADO.md` como proposta, não implementada aqui.

## Pendências de processo

- Linhas na `docs/RASTREABILIDADE.md` para os requisitos novos (ausência bloqueia `aprovada-pi`).
- Issues de fatia: só depois de cada spec virar `aprovada-pi` (papel do Cowork).
