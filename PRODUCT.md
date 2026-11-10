# ZENET RAT Digital

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, TypeScript, Tailwind CSS e Vite no front-end. Aplicação web responsiva, com prioridade para smartphones e suporte a desktop.

## Users

Técnicos de campo da ZENET Informática que prestam serviços de TI, engenharia e telecomunicações. Durante o atendimento externo, o técnico registra o serviço pelo celular. O cliente participa na etapa de assinatura.

## Product Purpose

Substituir o formulário físico de Relatório de Atendimento Técnico (RAT) por um fluxo digital que o técnico consiga preencher, assinar e revisar no local do atendimento. O objetivo é concluir o registro com agilidade e conforto no smartphone, com os dados obrigatórios preenchidos e as assinaturas coletadas.

## Positioning

O ZENET RAT Digital é uma ferramenta de trabalho de campo. Seu diferencial é reunir o registro do serviço, os cálculos de fechamento, as assinaturas e a revisão em um fluxo guiado, pensado para o uso no celular durante o atendimento.

## Operating Context

1. **Atendimento.** Identificar cliente, técnico, equipamento e chamado.
2. **Relatório Técnico.** Registrar problemas, soluções e pendências.
3. **Fechamento.** Consolidar o tempo de atendimento e a quilometragem com os cálculos automáticos existentes.
4. **Assinaturas.** Coletar as assinaturas manuscritas do cliente e do técnico diretamente na tela.
5. **Revisão e envio.** Conferir os dados e as assinaturas antes de finalizar o RAT. Após a confirmação, a interface disponibiliza o PDF para download.

## Capabilities and Constraints

- Preservar a validação de campos obrigatórios, o salvamento local de rascunhos, os cálculos automáticos e o fluxo de cinco etapas.
- Preservar a captura das duas assinaturas e o traçado com o dedo em telas sensíveis ao toque. A assinatura do cliente é obrigatória. A exigência da assinatura do técnico depende da configuração existente.
- Limitar as alterações ao front-end. Manter a lógica de negócio existente e deixar back-end, autenticação e banco de dados fora do escopo.
- Disponibilizar o PDF ao finalizar o RAT. O envio por e-mail fica disponível somente quando o servidor tem destinatário e SMTP configurados.

## Brand Commitments

- Usar o nome **ZENET RAT Digital**, a logomarca oficial da ZENET Informática e o [site institucional da ZENET](https://www.zenet.com.br/) como referência de marca.
- Respeitar o azul corporativo, o branco, os tons neutros e o vermelho de destaque indicados no briefing.
- Usar Linear, Stripe Dashboard e Vercel como referências de acabamento profissional. A identidade da aplicação é a da ZENET.
- Na revisão da interface, evitar cartões que ocupem espaço desproporcional, sombras exageradas, gradientes decorativos, arredondamento excessivo e ícones sem função clara.

## Evidence on Hand

- O formulário físico de referência está em `RAT ZENET.pdf`. A aplicação usa a logomarca oficial em `client/public/zenet.png`.

## Product Principles

- **Priorizar o atendimento em campo.** Avaliar as decisões primeiro pela rapidez e pelo conforto do técnico no celular. Aproveitar o espaço adicional do desktop para facilitar a leitura e a conferência.
- **Dar clareza a cada etapa.** Deixar fácil identificar o que precisa ser preenchido, o que ainda está pendente e o que será conferido antes da finalização.
- **Dar espaço ao que importa.** Usar hierarquia clara, densidade adequada e navegação consistente para reduzir a rolagem causada por espaços vazios e facilitar a leitura dos campos.
- **Proteger o trabalho já feito.** Preservar rascunhos, validações, cálculos e assinaturas ao revisar a interface.
