# API Workbench

Um cliente desktop-like para compor, organizar e enviar requisições HTTP com uma experiência rápida e legível.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/api-workbench run dev` — run the API Workbench frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-workbench/src/App.tsx` — shell, request composer, response viewer, history and local persistence
- `artifacts/api-workbench/src/index.css` — visual theme and responsive layout
- `artifacts/api-workbench` — deployable frontend artifact

## Architecture decisions

- O primeiro fluxo é local-first: coleções, rascunhos, ambientes e histórico são persistidos no navegador.
- O envio usa `fetch` diretamente para manter o cliente útil com qualquer endpoint compatível com CORS.
- A interface mantém composição e resposta lado a lado em telas largas e troca para uma visão por vez em janelas estreitas.

## Product

- Navegação por coleções e pastas com requests iniciais de exemplo.
- Editor de método, URL, parâmetros, headers e body JSON/texto.
- Seleção de ambientes com interpolação de variáveis `{{variable}}`.
- Envio real de requisições com status, tempo, tamanho, headers, payload e erros de rede.
- Histórico local, criação de requests, busca e layout responsivo.

## User preferences

_Nenhuma preferência persistente registrada._

## Gotchas

- Endpoints remotos precisam aceitar requisições do navegador (CORS); falhas aparecem no painel de resposta.
- As variáveis e tokens de exemplo são dados locais demonstrativos e devem ser substituídos pelo usuário.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
