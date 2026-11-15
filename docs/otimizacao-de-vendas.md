# Página e checkout

A página consulta `/inventory` e `/config` na entrada, ao voltar à aba e a cada 30 segundos enquanto visível. O servidor expira reservas e retorna apenas números vendidos e reservados, sem dados pessoais. Vendidos são laranja #F7931A com cadeado; reservados têm relógio e outra cor. Ambos são bloqueados para seleção manual e automática. Falha de consulta pausa novas seleções. Números que se tornam indisponíveis são removidos com aviso; a criação da reserva continua validada atomicamente no servidor.

Os seletores de 1, 3 e 5 definem a quantidade total em todos os locais. Preservam os números já escolhidos até essa quantidade e completam com aleatórios disponíveis. A grade permite até 50 números por pedido, como a API. Os preços e economias aparecem antes do checkout. No celular, um resumo fixo permite continuar sem voltar ao final da grade.

O topo destaca 4 USDT, BNB Smart Chain, foto real da embalagem e o estado das vendas. A foto fornecida pelo organizador foi redimensionada para WebP sem metadados; não sofreu alteração de conteúdo. A imagem ilustrativa continua identificada. O valor de referência do aparelho foi recolhido em detalhes para não confundir com a participação.

Vendas fechadas são informadas antes de pedir dados. O checkout mantém três contatos necessários, sem senha ou endereço de entrega: nome, e-mail e telefone com país e formatação. Os números são normalizados para E.164 no servidor. O cliente valida e destaca erros por campo. No celular, o QR de conexão inclui link oficial para abrir o Trust Wallet; QR e cópia continuam disponíveis para outras carteiras. Abrir o aplicativo depende de sistema e instalação; não representa aprovação automática da conexão ou pagamento.

Regra publicada: apuração direta dos quatro últimos algarismos do 1º ao 5º prêmio da Federal, na ordem. Somente 0001–1200 pagos da lista definitiva podem vencer. Não vendidos, 0000 e acima de 1200 são ignorados; sem correspondência segue a próxima extração com a mesma lista. 20/12/2026 é início previsto, não limite absoluto. Segue o horário oficial da CAIXA em Brasília. Concurso inicial e encerramento continuam pendentes de divulgação antes da abertura. A função `federalWinner` é uma referência testada da regra; não realiza ou publica um sorteio por conta própria.

Navegação: contadores próprios agregados por dia, fase (prévia/vendas), dispositivo e três etapas (página, seleção, checkout). O navegador conta cada etapa uma vez por sessão da aba quando o armazenamento está disponível. Não transmite nomes, telefone, e-mail, carteira, URL ou identificador de sessão. Testes de pagamento são excluídos. São indicadores aproximados de navegação, distintos dos pagamentos efetivos do banco de dados. O painel administrativo mostra os últimos 30 dias; não promete uma taxa de conversão ou ganho de vendas.

As vendas públicas permanecem fechadas. Não houve criação de números fictícios vendidos nem novos pagamentos reais na validação.
