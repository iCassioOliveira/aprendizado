# MesaZap Pro

MVP para empresas que atendem comercios: recebe pedidos vindos de WhatsApp/chatbot, mostra tudo em um dashboard operacional e oferece um cardapio digital para compras e reservas.

## Funcionalidades

- Dashboard com metricas de pedidos, faturamento, ticket medio, canais e itens mais vendidos.
- Pedidos vindos de WhatsApp/chatbot via endpoint de webhook.
- Cardapio digital com carrinho e fechamento de pedido no site.
- Reservas com data, horario, quantidade de pessoas e observacoes.
- API local usando Node.js puro, sem dependencias externas.
- Persistencia simples em `data/db.json`, ideal para demonstracao e evolucao para banco real.

## Como executar

```bash
node src/server.js
```

Depois acesse:

```text
http://localhost:3000
```

Se a porta `3000` estiver ocupada:

```bash
$env:PORT=3001; node src/server.js
```

## Endpoints principais

```text
GET    /api/state
GET    /api/menu
GET    /api/orders
GET    /api/reservations
GET    /api/metrics
POST   /api/orders
POST   /api/whatsapp/orders
POST   /api/reservations
PATCH  /api/orders/:id/status
```

## Exemplo de pedido vindo do chatbot WhatsApp

```bash
curl -X POST http://localhost:3000/api/whatsapp/orders ^
  -H "Content-Type: application/json" ^
  -d "{\"customer\":{\"name\":\"Marina\",\"phone\":\"+5511999998888\"},\"items\":[{\"productId\":\"burger-artesanal\",\"quantity\":2}],\"payment\":\"pix\",\"notes\":\"Sem cebola\"}"
```

## Proximos passos recomendados

- Integrar um provedor oficial do WhatsApp Business API.
- Trocar `data/db.json` por PostgreSQL ou outro banco gerenciado.
- Adicionar autenticacao por loja e permissoes por usuario.
- Criar painel multi-tenant para atender varios comercios na mesma plataforma.
