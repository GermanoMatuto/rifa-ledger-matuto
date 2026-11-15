# Checkout sem conta obrigatória

O comprador informa nome, e-mail e telefone em um formulário único. O servidor recalcula o preço, reserva os números e cria o pedido antes de mostrar QR e endereço. A autenticação por código de e-mail fica no fluxo de recuperação, sem interromper a primeira compra.

## Acesso aos pedidos

- Um token aleatório de 256 bits fica em cookie HttpOnly/Secure/SameSite Strict por até 30 dias. O banco guarda apenas SHA-256 do token, e o acesso consulta a validade no servidor.
- A sessão permite retomar o pedido no mesmo navegador. O botão Sair revoga a sessão de convidado no banco e apaga os cookies.
- Em outro dispositivo, o comprador confirma o e-mail via Supabase Auth. Uma função restrita ao servidor vincula os pedidos somente ao e-mail confirmado existente em auth.users.
- O e-mail preenchido na compra não é considerado verificado e não concede acesso a pedidos anteriores. Não há tokens em URL, localStorage ou respostas da API.
- A tela consulta o estado do pedido ao voltar da carteira/exchange e periodicamente enquanto aguarda pagamento. Essa atualização não descobre depósitos por conta própria: nesta versão o comprador ainda informa o txid.
- Recebimento finalizado continua em análise de titularidade, conforme o modelo de segurança existente.

## Teste de 1 USDT

`/checkout?teste=1` mostra um número de teste TESTE-0001, sem participação na campanha. O valor de 100 centavos é fixado no banco, não enviado pelo navegador. São necessárias a variável RAFFLE_TEST_ENABLED=true e uma entrada habilitada em raffle_test_access para o e-mail utilizado. A restrição de e-mail permite gerar a cobrança de teste; não equivale à autenticação do organizador. A sessão de pedidos segue privada.

O teste não ocupa raffle_numbers e não altera o preço da campanha. O QR usa a rede e carteira reais: enviar 1 USDT é movimentar moeda real. Vendas públicas continuam fechadas por RAFFLE_SALES_ENABLED=false e raffle_settings.sales_enabled=false.

## Validação

O teste guest-checkout.test.mjs executa PostgreSQL em memória e a API Express com fornecedores externos simulados: preço, isolamento, cookie, bloqueio de replay, recuperação por e-mail confirmado, expiração, RLS e cobrança de teste isolada. O verificador EVM mantém seus testes próprios. A validação de interface e da produção é feita à parte, sem movimentação automática de fundos.
