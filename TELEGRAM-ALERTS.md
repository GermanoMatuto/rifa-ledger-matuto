# Avisos de pedidos em análise pelo Telegram

O servidor usa somente `sendMessage` do Bot API. Não chama `setWebhook`, `deleteWebhook`, `getUpdates` nem muda os comandos do bot existente.

Configure como segredos de produção na Vercel:
- `RAFFLE_TELEGRAM_BOT_TOKEN`: token do bot existente.
- `RAFFLE_TELEGRAM_CHAT_ID`: ID numérico da conversa privada ou do grupo autorizado. Reutilize o ID conhecido na configuração atual do seu bot. Para uma conversa privada, o destinatário precisa ter iniciado a conversa com esse bot.

Nunca coloque o token em variável VITE, GitHub, captura de tela ou conversa. Depois de salvar os segredos, faça um novo deploy. A integração permanece inativa e preserva a fila enquanto a configuração estiver ausente.

A migração `202611160001_review_alerts.sql` cria uma fila privada com um registro por pedido real que entra em `review`, incluindo os que já aguardavam análise. Pedidos de teste ficam fora. Antes de enviar, a rotina exclui os pedidos que já saíram de análise. O worker existente consulta a fila a cada minuto, após tentar a confirmação automática das carteiras vinculadas.

O aviso contém ID do pedido, valor, números, txid e links para o painel autenticado e explorador. Não contém nome, e-mail, telefone ou endereço de envio, e não permite aprovar pagamentos pelo Telegram.

Falhas são registradas sem URLs nem tokens e recebem até oito tentativas com intervalo crescente, respeitando `retry_after` quando informado. O Bot API não oferece chave de idempotência para `sendMessage`: se aceitar a mensagem e a resposta se perder antes da gravação, uma tentativa posterior pode repetir o aviso. O ID do pedido permite reconhecer a repetição. Uma resposta de envio aceita não comprova que o destinatário leu o alerta.
