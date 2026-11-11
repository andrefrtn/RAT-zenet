# RAT Digital ZENET

Aplicação React e TypeScript com API Express e PostgreSQL. O técnico preenche o RAT, seleciona os profissionais ativos, anexa fotografias, coleta as assinaturas e finaliza. O servidor atribui o número oficial e permite baixar ou regenerar o PDF. O envio por e-mail foi removido.

## Configurar

Requer Node.js 22.15 ou superior da série 22 e PostgreSQL 14 ou superior. Use o mesmo banco central em todas as instâncias.

```powershell
npm ci
Copy-Item .env.example .env
```

Preencha `DATABASE_URL` no `.env`. No computador use a URL externa do PostgreSQL. Se o provedor exigir TLS, use o parâmetro indicado por ele; para a conexão externa do Render, acrescente `?sslmode=verify-full` (ou `&sslmode=verify-full` se já houver outros parâmetros). Não use os valores de exemplo literalmente.

Não é necessário configurar senha de equipe, segredo de sessão nem chave de cifragem de relatórios. O conteúdo dos RATs não é arquivado no servidor.

| Variável | Finalidade |
| --- | --- |
| `DATABASE_URL` | Conexão do PostgreSQL central. Utilize TLS com validação do certificado em produção, conforme o provedor. |
| `NODE_ENV` | `production` no servidor publicado. |
| `PUBLIC_ORIGIN` | Origem HTTPS externa completa, sem barra final. Obrigatória em produção. |
| `HOST`, `PORT` | Interface e porta do servidor. No Render configure `HOST=0.0.0.0` e use a porta fornecida pela plataforma. |
| `TRUST_PROXY_HOPS` | Quantidade de proxies confiáveis. Use `1` somente quando existe um único proxy e o servidor não pode ser acessado contornando-o. |
| `PHOTO_MAX_COUNT` | Quantidade total de fotos por RAT, padrão 12, máximo 40. |
| `PHOTO_MAX_FILE_MB` | Limite de cada arquivo original, padrão 10 MB, máximo 15 MB. |
| `PHOTO_MAX_BYTES` | Limite do JPEG normalizado, padrão 600.000 bytes. |
| `PHOTO_MAX_EDGE` | Maior dimensão da foto após tratamento, padrão 1600 px. |
| `PHOTO_QUALITY` | Qualidade JPEG, padrão 78. |

```powershell
npm run db:migrate
npm run technicians -- list
npm run technicians -- add "NOME COMPLETO DO PROFISSIONAL"
npm run dev
```

Abra `http://localhost:5173`. O cadastro inicial de técnicos é vazio. A API lista apenas profissionais ativos. O gerenciamento é feito exclusivamente pelo comando administrativo com acesso às credenciais do banco. Para inativar ou reativar um técnico, use `npm run technicians -- deactivate UUID` ou `npm run technicians -- activate UUID`. Esse cadastro pode ser administrado a partir de um computador autorizado conectado ao mesmo PostgreSQL, inclusive quando a hospedagem não oferece terminal.

## Emissão e recuperação

O campo Nº RAT mostra uma prévia do próximo número, consultada sem gravar ou reservar nada no banco. A prévia é atualizada a cada minuto, ao voltar à aba e ao iniciar outro atendimento. Se outro técnico finalizar primeiro ou o dia mudar, o número definitivo pode ser diferente. Abandonar o formulário não consome a sequência. O número é atribuído exclusivamente ao finalizar. O formato é `AAAA-MM-DD-XXXX`, com data calculada no PostgreSQL em `America/Sao_Paulo`. O contador diário usa UPSERT com incremento atômico e limite de 9999. Restrições únicas protegem o número, a combinação de data e sequência e o identificador da operação.

O identificador da operação, o número e o contador são gravados na mesma transação. Um bloqueio transacional permite recuperar o mesmo número em novas tentativas concorrentes ou após perda de conexão. O banco mantém um hash SHA-256 do formulário para impedir que a mesma operação seja reutilizada com outros dados. Esse hash não armazena o formulário. IDs e nomes dos técnicos participantes são preservados junto ao número para que alterações posteriores no cadastro não mudem o PDF.

O PostgreSQL possui somente três tabelas:

- `rat_technicians`: nomes, IDs e situação dos técnicos.
- `rat_counters`: último número de cada dia.
- `rat_numbers`: números emitidos, data, identificador da operação, hash e nomes/IDs dos técnicos participantes.

Não são gravados no banco os dados de clientes, equipamento, textos do relatório, fotos, legendas, assinaturas nem PDFs. O conteúdo é enviado ao servidor por requisição, processado apenas em memória e descartado ao encerrar o processamento. A aplicação não registra esses corpos em logs nem os escreve em arquivos.

O PDF é gerado depois da emissão. Se falhar, o botão Baixar PDF reenvia o rascunho local original e utiliza o mesmo número. Não existe consulta central de RATs emitidos nem recuperação do conteúdo em outro dispositivo. Salve o PDF antes de iniciar outro atendimento ou limpar os dados do navegador. O número continuará registrado mesmo que o rascunho seja perdido.

### Atualizar a versão anterior

A migração transfere os números e seus identificadores de `rat_reports` para `rat_numbers`, preserva os técnicos e mantém o contador no maior valor já emitido. Em seguida remove a antiga tabela `rat_reports`, incluindo seu conteúdo arquivado. Isso ocorre ao executar `npm run db:migrate` ou ao iniciar o servidor atualizado. Nenhum contador é reiniciado. Se precisar de um PDF antigo cujo rascunho não está neste aparelho, baixe-o antes de aplicar esta atualização. Números legados sem nomes de técnicos registrados usam o cadastro atual ao regenerar a partir do rascunho original.

## Acesso

O acesso é direto, sem login ou senha de equipe. Qualquer pessoa com acesso ao endereço pode emitir RATs. Gerar novamente um PDF exige o conteúdo original do rascunho e seu identificador; não existe rota para consultar ou baixar relatórios arquivados. Operações mutáveis validam a origem; os limites de requisições e processamento simultâneo continuam ativos. O gerenciamento de técnicos exige as credenciais do banco pelo comando administrativo.

## Rascunhos e imagens

Os rascunhos usam IndexedDB e preservam textos, IDs dos técnicos, assinaturas, fotos, legendas e a operação de emissão. O identificador da operação é salvo antes de chamar o servidor. Se o armazenamento falhar, a emissão fica bloqueada para evitar perder a referência necessária à recuperação.

Ao abrir um rascunho antigo, os campos de texto e a assinatura do cliente são migrados. A referência manual antiga e a assinatura do técnico anterior ficam disponíveis para consulta, sem associação automática a um profissional do novo cadastro. Selecione os técnicos ativos e colete suas assinaturas novamente.

As fotografias aceitam JPEG, PNG e WebP e são preparadas no servidor antes de entrar no rascunho. A conexão é necessária para essa preparação. O servidor corrige a orientação EXIF, limita as dimensões, converte para JPEG e remove os metadados originais. O limite de entrada é de 36 megapixels. As fotos normalizadas permanecem em IndexedDB até iniciar outro atendimento ou descartar o rascunho. Não são arquivadas no banco nem no disco do servidor. O preparo e o PDF usam apenas memória durante a requisição.

## Publicar no Render

Suba o código atualizado e configure um PostgreSQL persistente. No serviço web use o build `npm ci --include=dev && npm run build` e o start `npm start`. Configure `NODE_ENV=production`, `HOST=0.0.0.0`, a origem HTTPS e `DATABASE_URL`. O processo aplica a migração de forma transacional e segura entre instâncias ao iniciar. O usuário do banco precisa poder criar o esquema inicial ou a migração deve ser executada previamente por um administrador.

Mantenha `client/public/zenet.png` disponível no servidor, pois o PDF utiliza a logomarca. O conteúdo público fica em `dist/client`. Credenciais, banco, testes e materiais de revisão ficam fora da pasta pública. O caminho de verificação de saúde é `/healthz`.

Os antigos arquivos locais de comprovantes e as variáveis SMTP pertencem à versão anterior. A nova emissão utiliza as tabelas `rat_technicians`, `rat_counters` e `rat_numbers`. PDFs antigos não recebem números oficiais retroativamente.

## Testes

Configure `TEST_DATABASE_URL` para um PostgreSQL exclusivo de testes e disponibilize a variável no ambiente do terminal. Os testes de integração criam e removem esquemas isolados com prefixo `rat_test_`. O comando recusa executar esses testes quando a conexão não está configurada.

```powershell
$env:TEST_DATABASE_URL="CONEXAO_DO_BANCO_DE_TESTES"
npm test
npm run build
```

Os testes cobrem sequência e virada diária, concorrência em múltiplas conexões, limite diário, unicidade e imutabilidade, idempotência, perda de conexão, recuperação após falha de PDF, acesso direto sem senha, validação de origem, técnicos, assinaturas, fotografias, orientação, compressão e migração de rascunhos, remoção do arquivo legado e ausência de conteúdo de RAT nas tabelas.
