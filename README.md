# Rifa Ledger — Investidor Matuto

Aplicação independente do site principal. Página React/Vite e API Express em Vercel Functions.

## Estado

Vendas fechadas. Cadastro e recebimentos ficam indisponíveis até configurar Supabase, SMTP e ambiente da API. Nenhum segredo ou chave privada faz parte do repositório. O endereço público de recebimento está documentado em docs/recebimento-pendente.json.

## Desenvolvimento

Node.js 24. Execute `npm ci`, `npm test` e `npm run build`. `npm run dev` abre somente o frontend; para testar a API junto, use o ambiente Vercel de desenvolvimento configurado ou teste os handlers separadamente. Não existe pagamento simulado que libere números em produção.

## Vercel

Projeto de destino: `rifa-ledger-matuto`, equipe `germanomatutos-projects`.

A raiz do repositório é a raiz do build; framework Vite, `npm run build`, saída `dist`. A API é `api/raffle/[...path].ts`, separada do fallback de `/rifa-ledger`. A página principal já abre a rifa em `/`.

Depois de conectar o GitHub, instalar Supabase separado dos recursos existentes. Configurar as variáveis de `.env.raffle.example` em ambiente seguro. Manter `RAFFLE_SALES_ENABLED=false` até validar banco, e-mail e recebimento.

Consulte docs/recebimento-evm.md para a arquitetura, limitações, revisão de titularidade, taxas de saque e entrega ao vencedor. As notas de hospedagem do site antigo nesse documento são históricas; este repositório já inclui a entrada de API para Vercel. Banco e SMTP ainda não foram provisionados.

Não usar apenas o txid para liberar números: recebimento confirmado entra em análise. USDT BEP-20 / BNB Smart Chain, chain ID 56, contrato e 18 decimais fixados na configuração documentada.

