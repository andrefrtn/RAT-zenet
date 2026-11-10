# RAT Digital ZENET

Aplicação para preencher o Relatório de Atendimento Técnico da ZENET, coletar assinaturas manuscritas e gerar um PDF para envio. O formulário mantém os campos do RAT fornecido e reutiliza a logomarca original. O PDF reorganiza esses campos em seções e cria páginas de continuação quando necessário.

## Executar localmente

Pré-requisitos: Node.js 22.15 ou superior e npm. Execute os comandos na raiz deste projeto.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Em macOS ou Linux, use `cp .env.example .env`. Abra `http://localhost:5173`. O Vite encaminha as chamadas `/api` para a API Express na porta `3001`. Para testar em um celular na mesma rede, use `http://IP-DO-COMPUTADOR:5173` e libere a porta no firewall dessa rede, se necessário. Use apenas dados fictícios nesse teste por HTTP.

A configuração inicial deixa `MAIL_TO` vazio. Ao finalizar, a aplicação oferece o download do PDF. O envio por e-mail fica disponível quando o servidor tem um destinatário e o SMTP está habilitado.

## Configurar o envio real

Edite `.env` no servidor ou configure as mesmas variáveis no serviço de hospedagem.

| Variável | Valor |
| --- | --- |
| `MAIL_MODE` | `smtp` habilita o envio com destinatário configurado. `test` mantém somente a geração do PDF. |
| `MAIL_TO` | Endereço de destino. Deixe vazio para disponibilizar apenas o PDF. |
| `SMTP_HOST` | Endereço do servidor do provedor. |
| `SMTP_PORT` | Em geral `587` com STARTTLS ou `465` com TLS direto. |
| `SMTP_SECURE` | `false` para exigir STARTTLS. `true` para TLS direto. |
| `SMTP_USER`, `SMTP_PASS` | Credenciais SMTP ou senha de aplicativo fornecida pelo provedor. |
| `SMTP_FROM` | Endereço remetente autorizado pelo provedor. |
| `REQUIRE_TECH_SIGNATURE` | `true` para exigir também a assinatura do técnico. |



Para usar o Gmail como remetente, configure `SMTP_HOST=smtp.gmail.com` e as credenciais de um remetente autorizado. Se a conta oferecer senhas de aplicativo, a opção exige verificação em duas etapas. [Ajuda da Conta do Google](https://support.google.com/accounts/answer/185833?hl=pt-BR). [Documentação SMTP do Nodemailer](https://nodemailer.com/smtp).

## Publicar

```sh
npm ci
npm run build
npm test
npm start
```

O Express serve o site e a API pela mesma origem. Em produção, execute `npm start` na raiz do projeto sob um supervisor ou serviço de hospedagem Node. Mantenha `client/public/zenet.png` junto ao build porque o gerador de PDF usa a logomarca. O servidor precisa de acesso de saída à porta SMTP selecionada.

O conteúdo público fica em `dist/client`. Os arquivos de revisão do Impeccable, os testes e o PDF de referência ficam no ambiente de desenvolvimento. Mantenha `MAIL_TO` vazio enquanto o destinatário estiver em aberto.

Coloque o processo atrás de um proxy HTTPS. Configure `PUBLIC_ORIGIN` com a origem externa completa, por exemplo `https://rat.suaempresa.com.br`, sem barra final. Se houver exatamente um proxy confiável, inacessível por caminhos que contornem o proxy, use `TRUST_PROXY_HOPS=1` para que o limite por IP use o endereço encaminhado pelo proxy. Em um contêiner, configure `HOST=0.0.0.0` se o proxy precisar conectar pela rede interna.

Execute uma instância e monte `RECEIPTS_DIR` em um volume persistente. Os comprovantes guardam UUID, hash e estado da tentativa. Dados do RAT, PDF e assinaturas não são gravados pelo servidor. Para uso interno, controle o acesso na rede ou no proxy. A versão inicial dispensa login e banco de dados.

## Regras de preenchimento

- Horários são interpretados em ordem a partir do comparecimento, com virada de dia quando o horário seguinte é menor. O intervalo completo deve ser inferior a 24 horas. A duração usa início e término. Horários de início e término iguais dão duração zero.
- KM aceita até três casas decimais e exige os dois valores quando há deslocamento informado. O KM final deve ser igual ou superior ao inicial.
- A assinatura do cliente é obrigatória. O técnico pode assinar no segundo quadro. Os textos técnicos aceitam até 12.000 caracteres por campo. O PDF usa fonte Noto Sans com suporte ao alfabeto latino e representa caracteres fora dessa fonte pelo código Unicode.
- O rascunho inclui as assinaturas e fica no navegador. Use **Descartar rascunho** para removê-lo. Depois da confirmação, o PDF fica disponível para download na tela de resultado até sair dela.
- Se a conexão cair durante o envio, tente novamente com o mesmo relatório. Se o SMTP tiver aceitado e o comprovante tiver sido gravado, o servidor devolve o PDF sem reenviar. Se a aceitação ficar indeterminada, o servidor bloqueia novo disparo para aquele UUID. Confira a caixa de entrada antes de criar outro relatório. Os comprovantes devem ser preservados durante o período em que rascunhos pendentes possam ser retomados.

## Verificações

```sh
npm test
npm run check
npm run build
```

Os testes cobrem cálculos, validação, PNG, geração e paginação do PDF, limite de corpo, destinatário vazio, repetição concorrente e recuperação de tentativas. O envio é simulado nos testes automatizados.

## Estrutura

- `client/` contém a interface React, a coleta de assinaturas por Pointer Events e o armazenamento local.
- `shared/` contém os campos, a validação Zod e os cálculos usados em ambos os lados.
- `server/` contém a API Express, a composição PDF, o SMTP e o controle de duplicidade.
- `tests/` contém os testes e os dados fictícios de verificação.

