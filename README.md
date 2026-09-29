# Help Burguer PDV

Sistema de ponto de venda em desenvolvimento para desktop e tablet. A base atual inclui login, vendas, caixa, cardápio editável, pedidos persistentes e impressão pelo navegador. O PostgreSQL guarda os valores financeiros como `Decimal`.

## Estrutura

```text
apps/api/       API REST, autenticação, validações e acesso Prisma
apps/web/       interface React responsiva
prisma/         modelo PostgreSQL, migrações e seed de categorias/usuário
assets/         logo e referências visuais
docs/           arquitetura e etapas
```

## Início local

Requer Node.js 20+ e Docker Desktop com Compose. No PowerShell, use `npm.cmd` se a política bloquear `npm`.

1. Copie `.env.example` para `.env` e defina um `JWT_SECRET` seguro.
2. Inicie o PostgreSQL: `docker compose up -d postgres`.
3. Instale dependências: `npm install`.
4. Aplique as migrações: `npm run db:migrate -- --name init`.
5. Crie as categorias vazias e o usuário inicial: `npm run db:seed`.
6. Inicie API e interface: `npm run dev`.
7. Acesse `http://localhost:5173`.

Usuário de desenvolvimento: `admin` / `HelpBurguer2026!`. Troque a senha antes de qualquer implantação real. O seed não cria produtos; cadastre-os na seção **Cardápio**.

Comandos adicionais: `npm run build`, `npm test` e `npm run db:studio`. No desenvolvimento local, o Vite encaminha `/api` para `localhost:3333`. O `.env` não deve ser publicado.

## Publicar para teste (Render + Neon)

O arquivo `render.yaml` prepara um serviço gratuito no Render. O frontend e a API ficam no mesmo endereço, e o PostgreSQL fica no Neon. Use apenas para testes: a API gratuita do Render pode dormir quando fica sem acessos e o disco local é temporário. As fotos enviadas ao cardápio podem desaparecer após reinício ou novo deploy; mantenha cópias e não use como único registro das vendas.

1. Crie um projeto PostgreSQL no Neon e copie a conexão PostgreSQL com `sslmode=require`. Não publique essa URL nem a coloque no Git.
2. Coloque o código em um repositório Git privado no GitHub, sem o `.env` e sem arquivos de `apps/api/uploads/`.
3. No Render, crie um **Blueprint** conectando esse repositório e selecione `render.yaml`.
4. Durante a configuração, informe `DATABASE_URL` do Neon e crie uma senha forte em `ADMIN_INITIAL_PASSWORD`. O usuário inicial será `admin`; troque-o em `ADMIN_USERNAME` se preferir.
5. O Render instala, compila, aplica as migrações e cria o usuário inicial. Abra o endereço `onrender.com` criado e entre com o usuário e a senha configurados.

O seed também cria somente categorias vazias. Como o Render gratuito não mantém os arquivos enviados no disco local, evite cadastrar fotos importantes durante este teste. O WhatsApp continua desativado até preencher as variáveis da Meta na configuração do serviço Render e registrar o webhook HTTPS público.

## Operação disponível

- Login com senha bcrypt e token JWT.
- Cardápio: cadastrar categorias e produtos, editar informações, preços e fotos (PNG/JPG/WebP até 5 MB), ativar e desativar produtos.
- O seed cria apenas as categorias vazias e o administrador inicial.
- Abrir/fechar caixa; vendas exigem caixa aberto.
- Pedido com cliente, canal e pagamento. O servidor consulta o preço vigente, calcula subtotais com `Decimal` e persiste o histórico.
- Pedidos recentes lista todos os pedidos da data selecionada e relaciona o expediente aos caixas abertos/fechados. Encerrar o caixa não altera o status operacional dos pedidos nem remove o histórico.
- Balanço semanal: vendas, gastos, resultado estimado, pagamentos, vendas por dia e abertura/fechamento semanal do caixa.
- Despesas são associadas à sessão aberta, com descrição, categoria, valor, forma de pagamento, data/hora e usuário responsável.
- Impressão manual pelo navegador. Layout de cupom térmico, seleção de impressora e ponte local ainda pendentes.

As fotos são salvas em `apps/api/uploads/products/` e servidas pela API. Inclua essa pasta nos backups junto com o dump PostgreSQL; ela é ignorada pelo Git. O resultado semanal é vendas menos despesas registradas; sem custo dos ingredientes configurado, ainda não representa margem contábil completa.

## Integrações e pendências

WhatsApp permanece desativado até configurar credenciais Meta e publicar o webhook HTTPS. Alertas sonoros/visuais globais, envio de imagens e cardápio, despesas, relatórios, auditoria, backup automatizado, permissões detalhadas e testes de integração ainda precisam ser concluídos. Não considerar esta versão pronta para produção sem essas etapas e a revisão operacional.

### Backup manual

Com o container local ativo: `docker compose exec -T postgres pg_dump -U helpburguer helpburguer > backup.sql`. Restaurar em banco vazio: `docker compose exec -T postgres psql -U helpburguer helpburguer < backup.sql`.

### WhatsApp Cloud API

A tela **WhatsApp** recebe conversas por webhook, armazena mensagens no PostgreSQL e permite responder dentro do PDV. A integração usa a API oficial da Meta; não usa automação do WhatsApp Web. Antes de ativar, configure no `.env` do backend `WHATSAPP_PROVIDER=cloud_api`, `WHATSAPP_API_URL` (URL base Graph API com versão), `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET`, depois reinicie a API.

Cadastre no aplicativo Meta o webhook `https://SEU_DOMINIO/api/whatsapp/webhook`, use o mesmo `WHATSAPP_WEBHOOK_VERIFY_TOKEN` e assine o evento `messages`. O endpoint precisa ser HTTPS e acessível pela Meta. Para desenvolvimento local, use um túnel HTTPS. Os tokens ficam somente no backend. As conversas atualizam na tela por consulta periódica; mensagens recebidas e status de entrega são persistidos.
