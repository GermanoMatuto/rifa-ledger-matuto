# Recebimento EVM — implementação preparada, vendas desativadas

## O que está implementado

- Página React com cadastro por código de e-mail e campos privados nome/telefone com DDI e indicação de WhatsApp.
- Telefone/WhatsApp é informado, não verificado. Autenticação é pelo e-mail; marcar WhatsApp não verifica titularidade.
- API Express em /api/raffle. Tokens de sessão ficam em cookie HttpOnly, SameSite Strict, Secure em produção. Sem refresh persistente; sessão expira em até 1 hora.
- Identidade confirmada pelo Supabase Auth no servidor. Nenhuma senha é guardada por nosso código.
- PostgreSQL com estoque 1–1200, reservas de 30 minutos e bloqueio transacional para evitar duplicidade entre instâncias.
- Preço recalculado no servidor/banco: US$ 4 por número, 10% a partir de 4. Limite de 50 números por pedido e 3 pedidos pendentes por conta.
- Contato privado com RLS e sem acesso direto pelos papéis anon/authenticated. Não armazenar dados pessoais em blockchain.
- Recebimento em UM endereço, UMA rede, UM contrato de token por campanha. Moeda e rede precisam ser configuradas explicitamente.
- Txid verificado no RPC: chain ID, sucesso, bloco canônico finalizado, contrato do token, evento Transfer, destinatário, valor exato e transferência posterior à criação do pedido.
- Consulta somente leitura: a aplicação NÃO usa seed/chave privada e NÃO movimenta fundos.
- Índice único chain_id + txid: uma transação só pode ser apresentada para um pedido. Lotes com mais de um recebimento para a carteira não são aceitos automaticamente.

## A decisão de segurança mais importante

Recebimento verificado NÃO é prova de que quem informou o txid é quem pagou. Como o hash e as transferências são públicos, TODOS os pagamentos desta primeira versão entram em `review`. Não há liberação automática de números por cadastro+txid.

O operador precisa estabelecer vínculo com o comprador por evidência independente antes de aprovar: por exemplo, comprovação verificável do saque no contexto da conta do usuário. Screenshot/txid público isolado não são prova robusta. Contato por WhatsApp informado também não comprova pagamento. Uma disputa ou evidência insuficiente deve manter o caso pendente; não privilegiar simplesmente quem enviou o txid primeiro. Para eliminar essa revisão, precisamos acrescentar uma prova autenticada de pagamento (carteira assinante/contrato compatível) ou mudar a forma de cobrança para saques de exchanges.

A função administrativa `raffle_approve` não tem endpoint público; só service_role pode executá-la, com operador e referência de evidência registrados. Ela só libera números se todos ainda pertencem à reserva do pedido. Evitar guardar dados desnecessários no texto de evidência: usar uma referência a registro privado com controle de acesso.

`review` segura a reserva original por até 24 horas. Após isso, ela pode ser liberada; o registro do recebimento permanece para resolução. Recebimento em reserva já vencida NÃO recupera números de outro pedido. É necessário tratar restituição/reconciliação manual. Nunca reembolsar automaticamente para o endereço remetente de exchange.

## Configuração necessária (nenhum recurso externo foi criado)

1. Criar um projeto Supabase dedicado e aplicar supabase/migrations/202611140001_raffle.sql em ambiente de teste primeiro.
2. Configurar e-mail OTP no Supabase: template com código, SMTP de produção, limites e proteção antiabuso. Nenhum e-mail real foi enviado nos testes.
3. Copiar .env.raffle.example para o ambiente do servidor. Nunca usar prefixo VITE para a service key, segredo de rate limit ou RPC privado. Não commitar .env.
4. Manter RAFFLE_SALES_ENABLED=false. Inserir raffle_settings com sales_enabled=false, moeda, chain ID, contrato oficial do token, decimals, carteira pública e data limite. Validar os endereços a partir do emissor e conferir a rede do RPC.
5. Este repositório atualmente publica só o Vite na Vercel. A API Express AINDA PRECISA ser hospedada e roteada em /api/raffle, antes do fallback do SPA. Não basta publicar os arquivos no hosting estático. Usar mesma origem para cookies e configurar TLS. Não ativamos ou mudamos a hospedagem existente.
6. Em proxy, definir limites de tráfego no edge e política confiável de IP. O rate limiter de banco protege OTP por e-mail e pedidos por usuário. O Express não confia em X-Forwarded-For arbitrário.
7. Executar testes em testnet, inclusive saques de exchange, taxas descontadas, pagamentos atrasados, sessões expiradas e disputas. Sem carteira/RPC/projeto provisionados, NÃO houve teste real com dinheiro ou Supabase remoto.
8. Depois da validação, preparar avisos de privacidade (responsável, canal de contato, retenção e exclusão), política de suporte e resolução. Definir rotina de reconciliação, expiração e alerta operacional. Esta versão verifica txids por solicitação; ainda não tem worker que descobre depósitos sem txid informado.
9. Só abrir vendas após configurar essas dependências e concluir uma revisão do fluxo real. Os dois bloqueios (env e tabela) precisam permitir vendas; nenhum dado de recebimento é mostrado antes de existir um pedido válido.

## Entrega ao vencedor

Usar o telefone/WhatsApp informado e o e-mail verificado para contato; permitir atualização de contato por fluxo autenticado antes da operação. Esse recurso de edição ainda não foi criado. Nunca escolher outro vencedor automaticamente apenas por ausência de resposta. Definir antecipadamente como localizar o vencedor e resolver impossibilidade de contato. Depois, solicitar endereço em canal privado e registrar rastreio/comprovação de entrega. Mensagens, transporte e confirmação de recebimento são processos operacionais, não garantias da blockchain.

## Verificação local

- vitest --config vitest.raffle.config.ts: regras de preço e verificador EVM com respostas RPC simuladas.
- verify-db.mjs: executa migration e cenários em PostgreSQL WASM (PGlite), incluindo privacidade, expiração e pagamento repetido. Dependência de QA isolada, não parte do runtime.
- Build Vite e bundle do servidor. A checagem TypeScript geral continua apontando os erros preexistentes do componente ui/calendar.tsx.

Limites: sem auditoria externa, sem deploy, sem envio real de OTP, sem validação de uma exchange real, sem saque/reembolso automático, sem sorteio implementado e sem coleta do endereço do vencedor. Cadastro e telefone não substituem prova de titularidade do pagamento.

## Escolha do organizador: USDT / BNB Smart Chain

- Chain ID: 56 (0x38); rede BEP-20, não opBNB, Ethereum ou Tron.
- Contrato aceito: 0x55d398326f99059ff775485246999027b3197955 (Binance-Peg BSC-USD, comumente identificado como USDT BEP-20).
- Decimais: 18, conferidos por eth_call decimals() no RPC público da BNB Chain. O cálculo usa inteiros BigInt; nunca tratar esse token como se tivesse 6 decimais.
- Destinatário informado: 0x6e578f4f5c137300fA256A01d2A36D2d109eE2a3.
- Configuração inicial opcional: supabase/seed-raffle-closed.sql. Ela mantém vendas fechadas e prazo vencido até que o operador defina uma data válida; não sobrescreve configurações existentes.
- Um pedido de 4 números requer 14,4 USDT líquidos (14.400.000.000.000.000.000 unidades base). Taxa de saque é separada.
- Carteira própria precisa de BNB para taxa. No saque, a exchange define suas taxas, precisão e mínimos. Validar o contrato/rede que ela efetivamente entrega; símbolos iguais não bastam.
