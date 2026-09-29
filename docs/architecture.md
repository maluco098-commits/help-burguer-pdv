# Arquitetura e etapas

A API Express/TypeScript valida entradas com Zod, autentica usuários com bcrypt/JWT e acessa PostgreSQL por Prisma. O frontend React/Vite usa a API autenticada; o servidor consulta os preços no banco e recalcula os pedidos. Valores monetários são armazenados como `Decimal(10,2)`.

## Implementado

- Monorepo, autenticação, usuários e papéis.
- Categorias iniciais vazias; cadastro, edição, foto, ativação e desativação de produtos. Imagens ficam em `apps/api/uploads/products/` e o banco guarda seu caminho.
- Catálogo de venda, caixa, carrinho, pagamentos, pedidos persistentes e histórico básico.
- Consulta de pedidos por dia; fechar o caixa encerra o movimento, mantendo pedidos e status individuais.
- Balanço semanal de vendas e despesas, abertura/fechamento do caixa e valor esperado em dinheiro.
- O seed não preenche produtos. Itens de demonstração existentes na base local foram desativados; registros vinculados a pedidos permanecem para preservar o histórico.

## Próximas etapas

1. Adicionais, estoque e ordenação do cardápio.
2. Observações por item, endereço completo de entrega, descontos autorizados e histórico de estados.
3. Sangria, suprimento e relatórios exportáveis.
4. Precificação, ingredientes e simulações.
5. Cupom térmico e serviço local de impressão.
6. Alertas globais de WhatsApp, envio de mídia/cardápio e atualização via WebSocket.
7. Testes abrangentes, rate limiting, auditoria, recuperação de senha e hardening de produção.

WhatsApp Cloud API já tem webhook assinado, persistência de conversas/mensagens e envio de texto pelo inbox do PDV. A integração permanece desativada até configurar credenciais Meta e disponibilizar o webhook em HTTPS.
