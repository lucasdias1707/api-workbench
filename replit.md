# API Workbench

Um cliente HTTP no estilo desktop — inspirado no Yaak — para compor, organizar e enviar
requisições com foco em teclado, tema escuro e leitura clara da resposta.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — sobe o servidor de apoio (porta 8080, ver `artifact.toml`)
- `pnpm --filter @workspace/api-workbench run dev` — sobe o frontend
- `pnpm run check` — typecheck + testes de todos os pacotes
- `pnpm run test` — apenas os testes (Vitest)
- `pnpm run typecheck` — typecheck completo
- `pnpm run build` — typecheck + build de todos os pacotes
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks e schemas Zod a partir do OpenAPI
- `pnpm --filter @workspace/db run push` — aplica mudanças de schema (apenas dev)

### Variáveis de ambiente

| Variável | Onde | Para quê |
| --- | --- | --- |
| `PORT` | ambos | porta do serviço (obrigatória) |
| `HOST` | servidor | interface de escuta; padrão `0.0.0.0`. Use `127.0.0.1` atrás de um reverse proxy |
| `BASE_PATH` | frontend | base do Vite (obrigatória) |
| `API_PROXY_TARGET` | frontend (dev) | destino do proxy `/api`; padrão `http://127.0.0.1:8080` |
| `VITE_API_BASE_URL` | frontend | base da API quando ela não é same-origin; padrão `/api` |
| `ALLOWED_ORIGINS` | servidor | lista separada por vírgula de origens permitidas no CORS |
| `PROXY_ALLOW_PRIVATE_NETWORK` | servidor | libera destinos em rede privada; padrão: ligado fora de produção |
| `DATABASE_URL` | servidor | conexão Postgres (usada por `@workspace/db`) |
| `LOG_LEVEL` | servidor | nível do Pino; padrão `info` |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, CSS próprio com design tokens (sem framework de UI no app)
- API: Express 5
- Testes: Vitest
- DB: PostgreSQL + Drizzle ORM
- Validação: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (a partir do OpenAPI)
- Build: esbuild (bundle do servidor), Vite (frontend)

## Where things live

### Frontend (`artifacts/api-workbench/src`)

- `types.ts` — modelo de domínio (workspace, pasta, request, ambiente, resposta)
- `lib/http.ts` — monta a requisição (variáveis, params, auth, body) e envia via navegador ou proxy
- `lib/template.ts` — interpolação e tokenização de `{{variáveis}}`
- `lib/curl.ts` — importação e exportação de comandos curl
- `lib/storage.ts` / `lib/migrate.ts` — persistência versionada em localStorage e migração do formato antigo
- `lib/seed.ts`, `lib/factories.ts` — workspace inicial e construtores de registros
- `state/` — reducer, ações, store por contexto e seletores da árvore
- `components/sidebar|request|response|dialogs|layout|common` — UI por área
- `index.css` — design tokens (tema escuro e claro) e todos os componentes visuais

### Servidor (`artifacts/api-server/src`)

- `routes/proxy.ts` — `POST /api/proxy`, encaminha uma requisição e devolve o resultado bruto
- `lib/net-guard.ts` — validação de destino (esquema, hostname, resolução de DNS, redes privadas)
- `routes/health.ts` — `GET /api/healthz`

## Architecture decisions

- **Local-first.** Coleções, pastas, ambientes, abas e histórico vivem no navegador. Não há
  conta nem sincronização; `Settings → Export JSON` é o caminho de backup.
- **Dois modos de envio.** O navegador não alcança APIs sem CORS, coisa que um cliente desktop
  como o Yaak nunca enfrenta. O servidor de apoio expõe `/api/proxy` e o modo `auto` o usa
  quando ele responde ao health check, caindo para `fetch` direto quando não responde.
- **O proxy é um vetor de SSRF**, então `lib/net-guard.ts` resolve o hostname antes de sair:
  esquemas diferentes de http/https são recusados, endpoints de metadados de nuvem são sempre
  bloqueados e endereços privados só passam com `PROXY_ALLOW_PRIVATE_NETWORK`.
- **CORS restrito.** Em produção o servidor aceita apenas same-origin, a menos que
  `ALLOWED_ORIGINS` diga o contrário.
- **Estado em reducer.** Um único `WorkspaceState` versionado passa por `state/reducer.ts`,
  o que torna abas, exclusão em cascata de pastas e limites de histórico testáveis sem UI.
- **Respostas com orçamento.** Corpos são truncados em 128 KB e o gravador vai descartando
  respostas quando o localStorage estoura a cota, para nunca perder as requisições do usuário.

## Product

- Árvore de pastas aninhadas com menu de contexto (renomear, duplicar, excluir, nova pasta)
- Abas de requisições abertas, com fechamento por clique do meio
- Barra de URL com todos os métodos e destaque de `{{variáveis}}` (vermelho quando indefinida)
- Abas do compositor: Params, Body, Headers, Auth, Docs
- Body: nenhum, JSON (com formatação e validação), texto, XML, form URL-encoded, multipart, GraphQL
- Auth: nenhuma, Bearer, Basic, API key (header ou query)
- Linhas de chave/valor com liga/desliga individual
- Resposta: status colorido, tempo, tamanho, tipo; abas Pretty (árvore JSON dobrável com busca),
  Raw, Preview (HTML em iframe isolado), Headers, Cookies e History por requisição
- Cancelamento de requisição em andamento e timeout configurável
- Ambientes base + sobreposição, com editor de variáveis
- Paleta de comandos (⌘K) e atalhos: ⌘⏎ enviar, ⌘N nova, ⌘W fechar aba, ⌘E ambientes,
  ⌘B barra lateral, ⌘, configurações
- Importar de curl, copiar como curl, exportar/importar o workspace em JSON
- Painéis redimensionáveis, lado a lado ou empilhados; tema escuro, claro ou do sistema

## User preferences

_Nenhuma preferência persistente registrada._

## Gotchas

- No modo `browser` (ou quando o servidor de apoio está fora), endpoints remotos precisam
  liberar CORS; a falha aparece no painel de resposta.
- Upload de arquivo em multipart ainda não existe — os campos são enviados como texto.
- Variáveis e tokens do workspace de exemplo são demonstrativos. Segredos reais ficam em
  texto puro no localStorage; use um ambiente separado e evite máquinas compartilhadas.
- Alterar `lib/api-spec/openapi.yaml` exige rodar o codegen: os arquivos em
  `lib/api-zod/src/generated` e `lib/api-client-react/src/generated` são gerados.
- `artifacts/api-workbench/src/components/ui` é o scaffold do shadcn/ui e não é usado pelo app,
  que tem seu próprio sistema visual em `index.css`.

## Deploy

- `deploy/` traz um runbook para VM (Oracle Cloud Always Free), um unit do systemd e um
  Caddyfile. Leia a seção de segurança antes de expor: o `/api/proxy` encaminha qualquer
  requisição e não tem autenticação própria, então precisa de um gate na frente do site
  inteiro — senão vira proxy HTTP aberto.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
