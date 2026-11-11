---
version: 1
slug: "client-src-app-tsx"
primary_target: "client/src/App.tsx"
related_targets: ["client/src/style.css"]
---

# Atendimento

Modo Operate. Técnicos de campo registram chamado, cliente, equipe e equipamento na primeira etapa do RAT. O escopo é a apresentação dessa etapa.

## Direction contract

**Tese.** Uma ficha técnica fácil de percorrer em campo, com os três grupos do formulário separados por linhas e com campos alinhados.

**Identidade.** Marca oficial sobre branco, texto escuro, azul institucional na etapa atual e na ação principal, e vermelho nos indicadores obrigatórios e nos erros.

**Fluxo.** Preencher os 13 campos existentes, consultar o progresso, retomar ou descartar o rascunho e continuar para Relatório técnico após a validação atual.

**Primeira tela.** No celular, progresso compacto acima de uma coluna com controles de 48 px e separação generosa entre grupos. No desktop, trilho à esquerda, formulário com grade à direita e ações ao fim da ficha.

**Forma.** Redesign localizado com duas referências aprovadas. [Mobile revisado](../mocks/atendimento-mobile-v2.png) e [desktop](../mocks/atendimento-desktop.png). Os dois recortes mobile representam uma única página com rolagem.

**Finish.** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implementação verificada

- Abaixo de 640 px, o formulário tem uma coluna, controles de 48 px, 20 px entre campos e 32 px entre seções. A partir de 640 px, usa duas colunas. A partir de 920 px, usa navegação lateral e controles de 42 px. A partir de 1100 px, as grades das três seções usam três, duas e quatro colunas.
- Os campos, tipos de controle, validação, salvamento local, descarte e transições entre etapas foram verificados na interface. A borda no estado hover foi reforçada após a revisão de contraste.
- A marca é a logomarca oficial já fornecida no projeto, em `client/public/zenet.png`. As imagens aprovadas são referências de desenvolvimento. O registro do redesign se limita a esta etapa.
- Capturas verificadas de [mobile](../review/mobile.png) e [desktop](../review/desktop.png).

## Acabamento do fluxo completo

O cabeçalho claro, a navegação, os controles e as ações de rascunho de Atendimento passaram a orientar as cinco etapas. No desktop, a navegação lateral mostra o progresso. O relatório técnico separa a descrição das respostas. Fechamento agrupa horários, duração e quilometragem. Assinaturas usa duas áreas lado a lado a partir de 920 px. Na revisão, os textos técnicos ocupam uma coluna de leitura. O azul identifica a ação principal, inclusive o envio. A finalização oferece o PDF. O envio por e-mail só aparece quando o servidor tem destinatário e SMTP configurados.

Capturas da versão final com dados fictícios em [mobile](../review/mobile.png), [desktop](../review/desktop.png) e [revisão](../review/revisao-desktop.png). O fluxo foi conferido até a geração do PDF com SMTP simulado. Os arquivos de design ficam fora de dist/client.

## Refinamento visual

A interface mantém a paleta ZENET e usa a tipografia nativa do sistema. No desktop, a ficha usa um painel branco com borda leve ao lado da navegação. No celular, a ficha conserva os controles de 48 px. As faixas, o número do RAT e os marcadores de seção do PDF usam o azul institucional. A logomarca oficial conserva suas cores.

## Emissão centralizada e anexos

O número é emitido pelo PostgreSQL ao finalizar, com operação idempotente e data de São Paulo. O acesso é direto, sem login ou senha de equipe. Os técnicos ativos são selecionados por ID, com uma assinatura por profissional. Fotos, legendas e assinaturas ficam apenas no rascunho IndexedDB do aparelho. O servidor gera o PDF em memória. O PostgreSQL mantém apenas técnicos, contadores e metadados mínimos dos números emitidos. Não há consulta central de relatórios. O PDF preserva o azul institucional e inclui o registro fotográfico. O cadastro de produção começa vazio. Os testes usam profissionais e imagens fictícios.
