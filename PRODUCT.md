# ZENET RAT Digital

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, TypeScript, Tailwind CSS e Vite no front-end. API Node.js com PostgreSQL central. Aplicação responsiva, com prioridade para smartphones e suporte a desktop.

## Users

Técnicos de campo da ZENET Informática que prestam serviços de TI, engenharia e telecomunicações. Durante o atendimento externo, o técnico registra o serviço pelo celular. O cliente participa na etapa de assinatura.

## Product Purpose

Substituir o formulário físico de Relatório de Atendimento Técnico (RAT) por um fluxo digital que o técnico consiga preencher, assinar e revisar no local do atendimento. O objetivo é concluir o registro com agilidade e conforto no smartphone, com os dados obrigatórios preenchidos e as assinaturas coletadas.

## Positioning

O ZENET RAT Digital é uma ferramenta de trabalho de campo. Seu diferencial é reunir o registro do serviço, os cálculos de fechamento, as assinaturas e a revisão em um fluxo guiado, pensado para o uso no celular durante o atendimento.

## Operating Context

1. **Atendimento.** Identificar cliente, equipamento e chamado, e selecionar os técnicos ativos do cadastro central.
2. **Relatório Técnico.** Registrar problemas, soluções e pendências, com fotografias e legendas opcionais.
3. **Fechamento.** Consolidar o tempo de atendimento e a quilometragem com os cálculos automáticos existentes.
4. **Assinaturas.** Coletar a assinatura do cliente e uma assinatura obrigatória por técnico participante, vinculada ao respectivo ID.
5. **Revisão.** Conferir os dados, as fotografias e as assinaturas. Ao finalizar, o servidor atribui o número oficial e permite baixar ou regenerar o PDF.

## Capabilities and Constraints

- Preservar a validação de campos obrigatórios, o salvamento local de rascunhos, os cálculos automáticos e o fluxo de cinco etapas.
- Preservar o traçado por toque, mouse e caneta. Todas as assinaturas dos técnicos selecionados e a assinatura do cliente são obrigatórias.
- O campo Nº RAT mostra uma prévia sem reserva. Apenas a finalização consome a sequência; a prévia pode mudar com outras emissões ou na virada do dia.
- A emissão oficial usa PostgreSQL central, transações e idempotência. O acesso é direto, sem login ou senha de equipe.
- Finalizar e disponibilizar o PDF sem envio por e-mail. O número oficial segue AAAA-MM-DD-XXXX, com data de São Paulo e limite diário de 9999. Rascunhos com fotos e assinaturas usam IndexedDB. O PostgreSQL guarda somente o cadastro dos técnicos e os números emitidos, com identificador e hash para evitar duplicidade. Dados de clientes, textos, fotos e assinaturas permanecem apenas no rascunho IndexedDB do aparelho. O servidor processa imagens e PDF em memória, sem arquivar o conteúdo. Não há histórico central nem recuperação entre dispositivos.

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
