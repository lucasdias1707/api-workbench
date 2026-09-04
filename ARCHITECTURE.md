# Carom

Um cliente HTTP no estilo desktop — inspirado no Yaak — para compor, organizar e enviar
requisições com foco em teclado, tema escuro e leitura clara da resposta.

Este arquivo é a documentação interna (arquitetura e operação). O `README.md` é a porta de
entrada de quem só quer baixar e usar — inclusive o passo a passo de liberar o app no
Gatekeeper do macOS; mudou algo nesse fluxo, atualize os dois.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — sobe o servidor de apoio (`PORT=8080`)
- `pnpm --filter @workspace/api-workbench run dev` — sobe o frontend (`PORT=21728`, `BASE_PATH=/`)
- `pnpm run check` — typecheck + testes de todos os pacotes
- `pnpm run test` — apenas os testes (Vitest)
- `pnpm run typecheck` — typecheck completo
- `pnpm run build` — typecheck + build de todos os pacotes
- `pnpm --filter @workspace/api-workbench run desktop:dev` — roda o app desktop (Tauri)
- `pnpm --filter @workspace/api-workbench run desktop:build` — gera o executável e os instaladores
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
| `PROXY_SHARED_SECRET` | servidor | exige o header `X-Proxy-Auth`; obrigatório em produção com rede privada liberada |
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
- `lib/template.ts` — resolução em escopos com procedência (o que ganhou, o que foi sombreado)
- `lib/query.ts` — espelha a query string da URL na tabela de Params (a URL mantém a sua)
- `lib/inherit.ts` — de onde vêm a auth e os scripts de uma request: pasta mais próxima, ou ela mesma
- `lib/scripts.ts` — executa os scripts pré/pós, coletando variáveis, headers, logs e testes
- `lib/pm.ts` — objeto `pm` no formato do Postman, para scripts importados rodarem sem reescrita
- `lib/postman.ts` — leitura de uma coleção (v2.1) ou de um environment exportados do Postman
- `lib/updates.ts` — checagem, download e restart; único lugar que conhece o plugin do updater
- `hooks/use-update-check.ts` — estados da checagem; checa no mount, nunca baixa sozinho
- `lib/export.ts` — recorte de workspace: uma pasta com tudo abaixo dela, ou uma requisição
- `lib/json-lexer.ts` — tokeniza JSON incompleto para colorir enquanto se digita
- `lib/editor-keys.ts` — Tab, auto-fechamento de `{ [ "` e envolver seleção, como funções puras
- `components/request/CodeEditor.tsx` — textarea transparente sobre um espelho colorido
- `components/layout/FolderPane.tsx` — o painel da pasta: variáveis, auth e scripts dela
- `components/sidebar|request|response|dialogs|layout|common` — UI por área
- `index.css` — design tokens (tema escuro e claro) e todos os componentes visuais

### Brand

`artifacts/api-workbench/brand/logo.svg` é a fonte. `public/favicon.svg` é a mesma arte sem
o comentário, e `src/components/common/AppMark.tsx` é o mesmo desenho sem o fundo, com os
traços em `currentColor` para servir o badge da sidebar e qualquer uso monocromático — os
três precisam mudar juntos.

Os ícones do app saem de `brand/logo.png` (rasterizado a 1024px) com
`pnpm exec tauri icon brand/logo.png`, rodado de dentro de `artifacts/api-workbench`.
O comando também gera `icons/android/` e `icons/ios/`; apague, não há alvo móvel.

Restrições que o desenho respeita: sem gradiente (não sobrevive a 16px), traço com 11% da
tela (a silhueta tem que aguentar tamanho de aba), e legível em uma cor só, que é o que a
barra de menu do macOS e a bandeja do Windows pedem.

### Desktop (`artifacts/api-workbench/src-tauri`)

- `tauri.conf.json` — janela, bundle e comandos de build
- `src/lib.rs` — registra o plugin HTTP, que faz as requisições em Rust
- `capabilities/default.json` — escopo do que a webview pode chamar

### Servidor (`artifacts/api-server/src`)

- `routes/proxy.ts` — `POST /api/proxy`, encaminha uma requisição e devolve o resultado bruto
- `lib/net-guard.ts` — validação de destino (esquema, hostname, resolução de DNS, redes privadas)
- `routes/health.ts` — `GET /api/healthz`

## Architecture decisions

- **Local-first.** Coleções, pastas, ambientes, abas e histórico vivem no navegador. Não há
  conta nem sincronização; `Settings → Export JSON` é o caminho de backup.
- **Três transportes, escolhidos por `chooseTransport`.** No app desktop as requisições saem
  do Rust: sem CORS, sem preflight, e `localhost` e a rede local ficam acessíveis — é o que o
  Yaak faz. Na web, o servidor de apoio expõe `/api/proxy` e o modo `auto` o usa quando ele
  responde ao health check, caindo para `fetch` direto quando não responde.
- **O proxy é um vetor de SSRF**, então `lib/net-guard.ts` resolve o hostname antes de sair:
  esquemas diferentes de http/https são recusados, endpoints de metadados de nuvem são sempre
  bloqueados e endereços privados só passam com `PROXY_ALLOW_PRIVATE_NETWORK`.
- **CORS restrito.** Em produção o servidor aceita apenas same-origin, a menos que
  `ALLOWED_ORIGINS` diga o contrário.
- **Estado em reducer.** Um único `WorkspaceState` versionado passa por `state/reducer.ts`,
  o que torna abas, exclusão em cascata de pastas e limites de histórico testáveis sem UI.
- **Herança de auth pela árvore de pastas.** Uma request nova nasce com `inherit` e usa a
  escolha da pasta mais próxima que fez uma; escolher qualquer outra coisa — inclusive
  "nenhuma" — a desliga da pasta para sempre. Toda request escrita antes disso carrega um
  tipo concreto, então nenhuma mudou de comportamento sozinha.
- **Scripts empilham; auth não.** Um script de pasta existe para rodar *além* do da request,
  não no lugar dele: os pré rodam de fora para dentro, os pós de dentro para fora. Auth é uma
  escolha só, então vence a pasta mais próxima.
- **Scripts não são isolados.** São JavaScript compilado com `Function` e executado com tudo
  que o app alcança — no desktop, isso inclui a rede e a máquina. É inerente à funcionalidade
  (um script que não age não serve para nada), e por isso o aviso fica visível na própria aba
  de Scripts e no diálogo de importação, não escondido num tooltip.
- **Respostas com orçamento.** Corpos são truncados em 128 KB e o gravador vai descartando
  respostas quando o localStorage estoura a cota, para nunca perder as requisições do usuário.

## Product

- Árvore de pastas aninhadas com menu de contexto (renomear, duplicar, excluir, nova pasta)
- Abas de requisições abertas, com fechamento por clique do meio
- Barra de URL com todos os métodos e destaque de `{{variáveis}}` (vermelho quando indefinida)
- Abas do compositor: Params, Body, Headers, Auth, Scripts, Docs
- Body: nenhum, JSON (com formatação e validação), texto, XML, form URL-encoded, multipart, GraphQL
- Auth: herdar da pasta (padrão), nenhuma, Bearer, Basic, API key (header ou query)
- Clicar numa pasta abre o painel dela: variáveis, auth herdada por tudo abaixo, e scripts
- Scripts pré-requisição e pós-resposta em request e em pasta, com aba Console na resposta
- Importar uma coleção (v2.1) ou um environment do Postman
- Linhas de chave/valor com liga/desliga individual
- Resposta: status colorido, tempo, tamanho, tipo; abas Pretty (árvore JSON dobrável com busca),
  Raw, Preview (HTML em iframe isolado), Headers, Cookies e History por requisição
- Cancelamento de requisição em andamento e timeout configurável
- Múltiplos workspaces, cada um com suas pastas, requests e ambientes
- Arrastar requests entre pastas, reordenar e soltar na raiz do workspace
- Variáveis em três escopos: pasta (local, sempre azul), ambiente e base (cor escolhida
  por ambiente). A pasta mais próxima ganha, depois o ambiente ativo, depois a base
- Passar o mouse numa `{{variável}}` mostra valor e origem; clicar abre um popover que
  edita no lugar, gravando na pasta ou ambiente de onde o valor veio
- Cores do JSON configuráveis, com presets (Workbench, Monokai, Nord, Solarized)
- Ambientes base + sobreposição, com editor de variáveis e cor
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
- `carom.set` e `pm.environment.set` gravam no ambiente ativo (ou no base, se não houver
  outro). Não gravam na request: o sentido de um script escrever uma variável é ela
  sobreviver até a próxima requisição.
- O `pm` é uma camada de compatibilidade, não uma reimplementação: cobre variáveis, resposta,
  header, `pm.test` e um `expect` pequeno. `pm.sendRequest` avisa que não existe em vez de
  quebrar no meio. Esquemas de auth sem equivalente aqui (OAuth, AWS, NTLM) viram `inherit`.
- Variáveis e tokens do workspace de exemplo são demonstrativos. Segredos reais ficam em
  texto puro no localStorage; use um ambiente separado e evite máquinas compartilhadas.
- Alterar `lib/api-spec/openapi.yaml` exige rodar o codegen: os arquivos em
  `lib/api-zod/src/generated` e `lib/api-client-react/src/generated` são gerados.
- `artifacts/api-workbench/src/components/ui` é o scaffold do shadcn/ui e não é usado pelo app,
  que tem seu próprio sistema visual em `index.css`.

## Desktop

O app se chama **Carom** (os pacotes do workspace seguem com o nome `api-workbench`,
que é estrutura de repositório e não produto).

O identificador do bundle é `dev.carom.client`, e **trocá-lo apaga os dados de todo mundo na
prática**: é ele que nomeia o diretório de armazenamento da webview, então um identificador
novo abre um workspace vazio e obriga cada pessoa a exportar do app antigo e importar no
novo. Já aconteceu uma vez, num renome; não faça sem motivo forte. Ele também não pode
terminar em `.app`, que colide com a extensão de bundle do macOS e o `tauri build` reclama.

O executável é a forma mais completa de rodar: sem CORS, sem servidor de apoio e com acesso
à rede local. `desktop:build` gera `.deb`, `.rpm` e `.AppImage` no Linux; o workflow
`.github/workflows/desktop.yml` compila também `.dmg` (Intel e Apple Silicon) e `.msi`/`.exe`,
já que webview não cross-compila. O workflow só publica instaladores em Releases quando há
uma tag: uma tag `v*` enviada, ou uma run manual com `publish` marcado (a tag sai da versão
em `tauri.conf.json`). Run manual sem `publish` builda as quatro plataformas e deixa os
bundles como artefatos da run.

### Drag and drop

`dragDropEnabled: false` na janela é obrigatório, não preferência. Ligado (o padrão), o
Tauri instala um handler de drag do sistema operacional sobre a webview; no macOS esse
handler intercepta **qualquer** arrasto, não só arquivos — a subclasse de WKWebView do wry
sobrescreve `draggingEntered:` e `performDragOperation:` incondicionalmente e o handler do
Tauri sempre responde "tratei", então nada chega ao conteúdo da página e o drop nunca
acontece. No Windows é igual; o backend GTK só reage a arrasto de arquivo, por isso o bug
não aparecia no Linux. Desligar devolve o arrasto para a página, e não se perde nada: o app
não tem nenhum recurso que aceite arquivo solto na janela. Coberto por
`src/__tests__/tauri-config.test.ts`, já que JSON não tem onde escrever o motivo.

### Atualização automática

O app checa as releases do GitHub ao abrir, avisa quando há versão nova, e baixa **só se a
pessoa clicar**. A checagem é desligável em Settings; o download nunca é automático.

**Assinatura é obrigatória, não opcional.** O updater verifica uma assinatura minisign antes
de instalar qualquer coisa. Existe uma chave privada que assina toda release (secrets
`TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) e a pública fica embutida
em `tauri.conf.json`. **Perder a privada trava todo mundo**: nenhum app instalado aceita
update de outra chave, e a saída seria reinstalação manual em toda a base. Gerar com
`pnpm --filter @workspace/api-workbench exec tauri signer generate -w <arquivo>`.

Três armadilhas que já custaram tempo aqui:

- **`bundle.createUpdaterArtifacts` vem desligado.** Sem ele a release sai com instaladores e
  **nenhum** artefato de update, e todo app checando encontra nada. Coberto por
  `src/__tests__/tauri-config.test.ts`.
- **`tauri-action` apaga e substitui asset de mesmo nome.** Com quatro jobs de matriz
  publicando na mesma release, cada um sobrescreve o `latest.json` do anterior e sobra uma
  plataforma só — o update funcionaria em uma e falharia calado nas outras três. Por isso o
  job `updater-manifest` roda **depois** da matriz e compõe o manifesto uma vez
  (`scripts/src/updater-manifest.ts`), recusando-se a emitir manifesto parcial.
- **O manifesto é montado a partir dos assets da release, não da pasta de build.** Os dois
  conjuntos não são iguais: o bundler também escreve um `.AppImage.tar.gz` que o
  `tauri-action` **não** publica, e cópias em minúsculo de cada bundle que colidem por
  case-insensitivity dentro do zip de artefato do Actions. Apontar para qualquer um deles
  gera um manifesto que parece completo e dá 404 na plataforma correspondente.
- **`generate_context!` precisa de `serde_json` no crate** assim que existe um bloco
  `plugins` no `tauri.conf.json`. Sem a dependência o build quebra com um erro que não
  menciona plugin nenhum.

**`.deb` e `.rpm` não se auto-atualizam** — os arquivos são do gerenciador de pacotes. O
comando `install_kind` em `lib.rs` detecta isso (`$APPIMAGE` só existe dentro de um AppImage)
e a UI troca o botão por um link para a release.

**`createUpdaterArtifacts: true` exige chave privada e derruba o build inteiro sem ela** —
publicando ou não, e independentemente de a pubkey estar preenchida ou vazia (verificado nos
dois casos). Por isso o passo `Set up updater signing`, quando não há chave, escreve um
`--config` desligando o flag só naquela run. O config versionado mantém o flag ligado, que é
o estado que uma release precisa.

A chave privada é exportada nesse mesmo passo, para o `$GITHUB_ENV`, e **só quando tem
valor**: secret inexistente no Actions vira string vazia, não variável ausente, e o Tauri lê
"definida mas vazia" como "assine com esta chave" e falha ao decodificá-la. Foi assim que a
primeira tentativa quebrou.

O workflow recusa publicar enquanto a pubkey estiver vazia ou o secret não existir: um app
publicado sem chave pública nunca consegue verificar — e portanto aplicar — um update.

A chave em uso é a minisign `8D6027C8903DED7`. Trocá-la ou apagá-la deixa toda instalação
existente sem caminho de update; `src/__tests__/tauri-config.test.ts` falha se ela sumir do
config.

### Assinatura (macOS e Windows)

Os bundles não são assinados com um certificado pago, então o sistema não reconhece o
publisher. No macOS o build usa **assinatura ad-hoc** (`APPLE_SIGNING_IDENTITY: '-'` no
workflow) — isso não é cosmético: em Apple Silicon um `.app` arm64 *sem assinatura nenhuma*
é rejeitado pelo Gatekeeper com a mensagem "está danificado e não pode ser aberto", que
parece corrupção de download mas é falha de validação. Com ad-hoc a assinatura é válida e o
primeiro run vira o aviso de que a Apple não conseguiu verificar o app, que dá para aceitar
(`xattr -cr /Applications/Carom.app`, ou Ajustes do Sistema → Privacidade e Segurança →
Abrir Mesmo Assim; botão direito → Abrir não vale mais no macOS recente). O passo a passo
para quem instala está no README. O step `Verify macOS signature` roda `codesign -dv` e
`codesign --verify` no bundle e deixa a prova no log.

Para tirar o aviso de vez é preciso Apple Developer ID pago + notarização: `tauri-action`
aceita `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD` e `APPLE_TEAM_ID` como secrets. Cuidado ao ligar: `APPLE_ID`
e `APPLE_PASSWORD` definidos como string vazia fazem o tauri tentar notarizar e falhar, então
eles precisam ser injetados só quando existirem, não com `${{ secrets.X }}` direto. No
Windows o SmartScreen mostra "Windows protected your PC" pelo mesmo motivo (More info → Run
anyway); remover exige um certificado de code signing.

Para compilar localmente no Linux é preciso Rust e as libs do sistema:
`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf`.

## Deploy

- `deploy/` traz um runbook para VM (Oracle Cloud Always Free), um unit do systemd e um
  Caddyfile. Leia a seção de segurança antes de expor: o `/api/proxy` encaminha qualquer
  requisição e não tem autenticação própria, então precisa de um gate na frente do site
  inteiro — senão vira proxy HTTP aberto.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
