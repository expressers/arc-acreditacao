# Acreditação · VII Conferência ARC

PWA mobile-first para a **VII Conferência Anual sobre Concorrência e Regulação Económica em Angola** (ARC, 13 de Novembro de 2026), produzida para a Young.

- Importa a lista de convidados (Excel/CSV com nome e email; categoria e instituição opcionais), com limpeza e validação de dados.
- Três categorias: **Convidados, Oradores, Imprensa**.
- Cada convidado recebe um **token aleatório** (144 bits) e uma credencial digital com **QR Code individual** (`/c/<token>`).
- Envio dos convites por **email** (SMTP), com o QR embutido e o link da credencial; envio em lote com progresso, reenvio e teste.
- **Leitor de entrada** (câmara do telemóvel): regista a entrada de forma atómica — cada QR só entra uma vez, com aviso de "já entrou" e de QR inválido, som e vibração. Pesquisa por nome como plano B.
- Painel em tempo real: presentes por categoria, últimas entradas, exportação para Excel.
- Instalável (PWA), com o visual do evento (azul ARC, tipografia condensada).

## Acessos

| Função | Onde | Credencial |
|---|---|---|
| Organização (painel) | `/` → Organização | `ADMIN_PASSWORD` |
| Entrada (leitor) | `/` → Entrada | `DOOR_PIN` + nome do posto |
| Convidado | link do email `/c/<token>` | — |

## Stack

React 19 + Vite + Tailwind v4 + shadcn/ui (PWA via `vite-plugin-pwa`) · servidor Bun + Hono · Postgres.
Um único serviço serve a API (`/api/*`) e a app.

## Desenvolvimento

```bash
docker run -d --name arc-acreditacao-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=arc -p 54329:5432 postgres:17-alpine
cp .env.example .env   # ajustar valores
bun install
bun run dev:server     # API em :3107
bun run dev            # app em :5173 (proxy para a API)
```

## Produção (Render)

- Web Service (runtime Node, Bun detectado pelo `bun.lock`)
  - Build: `bun install --frozen-lockfile && bun run build`
  - Start: `bun run start`
  - Health check: `/api/health`
- Postgres do Render ligado por `DATABASE_URL`.
- Variáveis: `SESSION_SECRET`, `ADMIN_PASSWORD`, `DOOR_PIN`, `NODE_ENV=production` e, para email, `SMTP_*`.

As tabelas são criadas automaticamente no arranque.
