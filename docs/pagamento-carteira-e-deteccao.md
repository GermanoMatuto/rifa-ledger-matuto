# Pagamento com carteira opcional e acompanhamento na rede

## Referência de experiência

A documentação pública da Stripe descreve seleção do pagamento cripto, conexão da carteira, assinatura de titularidade, resumo do pagamento e confirmação separada na carteira. Usamos essa separação como referência de experiência; este checkout não utiliza Stripe e não herda certificações ou garantias da empresa.

Fontes: https://docs.stripe.com/payments/stablecoin-payments#payment-flow e https://support.stripe.com/user/questions/pay-with-crypto-faqs?locale=en-GB .

## Carteira conectada

O usuário escolhe uma carteira injetada no navegador (EIP-6963, com fallback EIP-1193). A conexão é opcional e só acontece por ação do usuário. O app pede o endereço público e a rede BNB Smart Chain. Antes de pagar, o servidor emite um desafio de uso único que inclui domínio, pedido, carteira, destinatário, contrato, rede, valor, nonce e validade de cinco minutos. A assinatura personal_sign é verificada no servidor com viem e o desafio é consumido. Esta versão verifica assinaturas de contas EOA; carteiras de contrato incompatíveis podem usar o QR.

A autorização de pagamento é outra solicitação, com uma chamada direta ERC-20 transfer para o contrato USDT configurado, valor exato e zero BNB de principal. Não há approve, permit, allowance ilimitada, assinatura de transação no servidor ou acesso a seed/chave privada. A taxa de rede em BNB é decidida na carteira.

O txid retornado é guardado no pedido pelo servidor e no navegador como referência pública de recuperação. Uma tentativa com resultado incerto bloqueia novo pagamento automático e pede conferência do histórico. O servidor só registra recebimento depois de verificar contrato, destinatário, valor, remetente da carteira vinculada, bloco canônico e finalização. O recebimento continua em análise; não há confirmação automática de participação.

## Sem conectar

O comprador pode usar o QR/endereço e pagar pela exchange ou carteira. Ele deve informar o txid para identificar sua transferência. O txid é conferido na blockchain e não é, sozinho, prova de titularidade do comprador. Não há conexão, assinatura ou acesso à carteira nesse caminho.

A busca de eventos usa um RPC compatível com eth_getLogs e verifica cada candidato por recibo em outro RPC. A consulta roda enquanto o checkout está aberto e ao retornar à página; não é um serviço contínuo de background/webhook. O cursor é salvo no banco para retomar buscas e só avança após uma consulta completa. Falha de RPC não deve ser apresentada como confirmação nem justificar reenviar valores.

Eventos detectados permanecem separados dos pedidos até que o comprador informe o txid. Pedidos de mesmo valor podem ser ambíguos; a expiração de um deles não remove a ambiguidade histórica. Tabelas e funções de detecção são restritas ao servidor por RLS e privilégios. O preço da campanha e as vendas públicas permanecem inalterados.
