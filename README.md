# Estoque e Pedidos para Cosméticos

Angular 22 + Angular Material + Supabase (Auth, Postgres, RLS, funções transacionais).

## Rodar
    npm install
    npm start          # http://localhost:4200
    npm run build      # produção (precisa de internet para embutir as fontes)

A conexão com o Supabase está em `src/app/core/config.ts` (URL + chave pública *publishable*; nunca coloque a service_role no front-end).

## Primeiro acesso
1. Em Supabase > Authentication > Users, crie o primeiro usuário (e-mail + senha, marque "Auto confirm"). Ele vira **administrador** automaticamente.
2. Desative "Allow new users to sign up" em Authentication > Sign In / Providers. Novos cadastros públicos ficam inativos de qualquer forma.
3. Entre no sistema e crie os demais usuários em Configurações > Usuários (usa a Edge Function `create-user`).
4. Cadastre localizações, produtos e preços; registre o estoque inicial em Estoque > Entrada (marque "saldo inicial").

## Banco de dados
Migrations aplicadas: tabelas/enums, RLS/views/triggers, funções (RPC). Regras críticas ficam no banco:
`save_order`, `confirm_order` (reserva FEFO atômica), `cancel_order`, `complete_picking`, `dispatch_order` (baixa única), `register_return`, `receive_stock`, `adjust_stock`, `block_lot`, etc.
O estoquista não lê preços, custos, clientes nem pedidos diretamente: a separação usa `get_pick_queue` e `get_pick_detail`.

## Backup
Ative backups diários (Supabase > Database > Backups; planos pagos) e teste a restauração periodicamente.

## Relatório: produtos vendidos por empresa
Em **Relatórios > Produtos vendidos por empresa (cliente ou marca)**:
- Botões **Esta semana** / **Semana passada** (segunda a domingo) ou período livre.
- **Agrupar por Cliente** (quem comprou) ou **Marca** (fornecedor) — cada empresa mostra seus produtos com a quantidade, nº de pedidos e valor, e um total.
- Considera pedidos confirmados no período (ignora rascunhos e cancelados).
- **Imprimir / PDF** (rota `/imprimir/vendas-empresa`) e **Exportar CSV**.
Não exige migration: usa as tabelas `order_items`, `orders`, `customers`, `products` e `brands`.
