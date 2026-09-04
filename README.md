# Carom

Cliente HTTP de desktop — inspirado no Yaak — para compor, organizar e enviar requisições.
Tema escuro, navegação por teclado, variáveis com escopo por pasta e ambiente, e leitura
clara da resposta.

No app desktop as requisições saem nativamente: não há CORS, e `localhost`, IPs da sua rede
e serviços internos são alcançáveis como em qualquer cliente nativo.

## Download

Os instaladores estão em **[Releases](https://github.com/lucasdias1707/carom-client-api/releases/latest)**.

| Sistema | Arquivo |
| --- | --- |
| macOS Apple Silicon (M1/M2/M3/M4) | `Carom_<versão>_aarch64.dmg` |
| macOS Intel | `Carom_<versão>_x64.dmg` |
| Windows | `Carom_<versão>_x64-setup.exe` ou `_x64_en-US.msi` |
| Linux (Debian/Ubuntu) | `Carom_<versão>_amd64.deb` |
| Linux (Fedora/RHEL) | `Carom-<versão>-1.x86_64.rpm` |
| Linux (qualquer distro) | `Carom_<versão>_amd64.AppImage` |

---

## macOS: liberar o app no primeiro uso

Na primeira abertura o macOS mostra:

> **"A Apple não pôde verificar se o item Carom está livre de algum malware."**

Isso é esperado e **não** indica problema com o download. O Carom é assinado, mas com uma
assinatura *ad-hoc* — não com um certificado Apple Developer ID pago. Sem esse certificado a
Apple não tem como atestar a origem do app, então o Gatekeeper pede confirmação explícita.
A liberação é feita uma única vez; depois o app abre com duplo clique como qualquer outro.

Antes de qualquer coisa, arraste o **Carom** do `.dmg` para a pasta **Aplicativos**.

### Opção 1 — Terminal (uma linha)

```sh
xattr -cr /Applications/Carom.app
```

O comando remove o atributo `com.apple.quarantine`, que o navegador carimba em tudo que
baixa. Sem ele o Gatekeeper não intercepta a abertura. Abra o app normalmente em seguida.

### Opção 2 — pela interface, sem Terminal

1. Dê duplo clique no Carom. No aviso, clique em **OK** — **não** em "Mover para o Lixo".
2. Abra **Ajustes do Sistema → Privacidade e Segurança**.
3. Role até o fim da página. Vai aparecer a linha *"Carom foi bloqueado para proteger seu Mac"*
   com o botão **Abrir Mesmo Assim**.
4. Clique nele, autentique com Touch ID ou senha, e confirme **Abrir** no diálogo seguinte.

O antigo atalho de clicar com o botão direito e escolher "Abrir" não funciona mais nas
versões recentes do macOS para este caso — use um dos dois caminhos acima.

---

## Atualização

A partir da `v0.2.0` o Carom se atualiza sozinho. Ao abrir, ele consulta as releases deste
repositório. Se houver versão nova, duas coisas acontecem:

- um **aviso na tela** dizendo qual versão saiu;
- um **botão de download azul** aparece na barra de cima, ao lado da engrenagem — passando o
  mouse nele, o texto diz qual versão está disponível. Ele só existe quando há o que baixar,
  fica cinza enquanto baixa e verde (com ícone de reiniciar) quando termina.

Clicar nesse botão abre **Settings → Updates**, com as notas da versão e **Download and
install**. O download só acontece se você clicar — nunca sozinho. Terminando, é um clique em
**Restart now** e pronto.

A checagem automática pode ser desligada no mesmo lugar; aí o update só acontece quando você
clicar em **Check now**.

Dois detalhes:

- **A `v0.2.0` foi a última instalação obrigatoriamente manual**, por ser a primeira a
  trazer o updater. Quem está nela em diante recebe as próximas sozinho.
- **`.deb` e `.rpm` não se atualizam sozinhos.** Esses arquivos pertencem ao gerenciador de
  pacotes da distro, e o app sobrescrevê-los deixaria o sistema com um registro errado do que
  está instalado. Nesse caso o Carom detecta a situação, avisa que há versão nova e manda
  para a página da release. O `.AppImage` se atualiza normalmente.

No macOS há um efeito colateral bem-vindo: a quarentena é carimbada pelo **navegador**, e um
arquivo baixado pelo próprio app não recebe carimbo nenhum. Ou seja, o aviso do Gatekeeper
aparece só na primeira instalação manual — as atualizações seguintes abrem direto.

## Windows: liberar o app no primeiro uso

O SmartScreen mostra *"O Windows protegeu seu PC"* pelo mesmo motivo — o instalador não é
assinado com um certificado de code signing. Clique em **Mais informações → Executar assim
mesmo**.

## Linux

`.deb` e `.rpm` instalam pelo gerenciador de pacotes da distro. O `.AppImage` precisa de
permissão de execução:

```sh
chmod +x Carom_*_amd64.AppImage
./Carom_*_amd64.AppImage
```

Dependências de sistema: `libwebkit2gtk-4.1-0` e `libgtk-3-0` (o `.deb` e o `.rpm` já
declaram; o AppImage não).

---

## Por que os avisos existem, e como removê-los de vez

Nem o macOS nem o Windows olham para o conteúdo do app: eles olham para **quem assinou**.
Um binário sem certificado de uma autoridade reconhecida é tratado como origem desconhecida,
independentemente de ser inofensivo. Não existe caminho gratuito que remova o aviso — as
opções são:

- **macOS:** Apple Developer Program (US$ 99/ano) para um certificado *Developer ID
  Application*, mais notarização. O CI envia o `.dmg` para a Apple, que o analisa e devolve um
  ticket grampeado no arquivo; a partir daí o app abre no primeiro clique, sem diálogo. Isso
  entra no workflow existente por meio de secrets — o código do app não muda.
- **Windows:** certificado de code signing OV (~US$ 200–400/ano). Mesmo assinado, o
  SmartScreen só para de avisar depois de acumular reputação de downloads; um certificado EV
  dispensa essa espera e custa mais.
- **Sem custo:** distribuir por Homebrew (`brew install --cask --no-quarantine`) ou por um
  script de instalação com `curl`. A quarentena é carimbada pelo **navegador**, não pelo
  arquivo — um download que não passa por navegador não recebe o carimbo e não dispara o
  Gatekeeper. O app continua sem certificado; quem instala confia em você do mesmo jeito.

## Vindo do Postman

`Import Postman`, na barra lateral, lê uma **coleção (v2.1)** ou um **environment** exportados
do Postman — por arquivo ou colando o JSON.

Antes de importar você vê a árvore inteira e marca o que quer: marcar uma pasta leva tudo
abaixo dela, e dá para desmarcar uma request específica dentro de uma pasta marcada. Uma pasta
que você deixou desmarcada ainda vem junto se algo dentro dela foi marcado — sem ela a request
não teria onde ficar.

Também dá para escolher **para qual workspace** vai, inclusive um **criado ali na hora**. Útil
para não misturar uma coleção de terceiros com o seu trabalho.

A coleção vira uma pasta, e é ela que guarda as variáveis, a auth e os scripts que estavam no
nível da coleção. Assim tudo dentro continua herdando como herdava lá: uma request sem bloco
de auth fica em "Inherit from parent", uma que definia a sua mantém a sua.

Esquemas de auth que não existem aqui (OAuth, AWS, NTLM) viram "herdar" — nada é enviado, e a
aba Auth diz isso, em vez de fingir que o fluxo veio junto.

## Scripts

Cada request e cada pasta têm dois scripts: um antes de enviar e um depois da resposta.

```js
// pré-requisição
carom.set('nonce', Date.now());
carom.header('X-Nonce', carom.get('nonce'));

// pós-resposta
const body = carom.json();
carom.set('token', body.access_token);
```

Os de pasta rodam em volta dos da request: os pré de fora para dentro, os pós de dentro para
fora. O que um script escreve com `carom.set` vai para o ambiente ativo, então dura até a
próxima requisição. `console.log` e `pm.test` aparecem na aba **Console** do painel de
resposta.

O `pm` do Postman também funciona (`pm.environment.set`, `pm.response.json()`,
`pm.test`, `pm.expect`, `pm.request.headers.add`), para um script importado rodar sem ser
reescrito.

> **Scripts não rodam isolados.** São JavaScript com acesso a tudo que o app alcança,
> incluindo a rede. Leia os scripts de uma coleção que você não escreveu antes de enviar
> qualquer requisição dela.

## Rodar no navegador

Existe uma versão web, mas o navegador limita um cliente HTTP de duas formas: o CORS decide
quais APIs a página pode chamar, e uma página nunca alcança `localhost` nem a rede local.
Para contornar, o repositório traz um servidor de apoio que encaminha as requisições
(`POST /api/proxy`). **Ele não tem autenticação própria e encaminha qualquer destino**, então
precisa de um gate na frente antes de ir para a internet — veja `deploy/` para o runbook
completo. O app desktop não tem nenhuma dessas restrições e é o caminho recomendado.

## Desenvolvimento

```sh
pnpm install
pnpm --filter @workspace/api-workbench run dev          # frontend
pnpm --filter @workspace/api-server run dev             # servidor de apoio
pnpm --filter @workspace/api-workbench run desktop:dev  # app desktop (Tauri)
pnpm run check                                          # typecheck + testes
```

Para compilar o desktop no Linux é preciso Rust e as libs de sistema:
`libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf`.

Detalhes de arquitetura, variáveis de ambiente e decisões de projeto estão em
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Publicar uma versão

Instaladores só são publicados a partir de uma tag, e **só com a chave de assinatura do
updater configurada** — o workflow recusa publicar sem ela, porque instaladores não assinados
nunca conseguiriam se atualizar. São dois secrets no repositório
(`TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) mais a chave pública em
`tauri.conf.json`; veja a seção de atualização automática em
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

Bumpe a versão em `artifacts/api-workbench/src-tauri/tauri.conf.json` (e em `Cargo.toml` +
`Cargo.lock`), então:

- **Pelo GitHub:** Actions → *Desktop build* → *Run workflow*, branch `main`, marcando
  **"Publish installers to a release"**. A tag sai da versão do `tauri.conf.json`.
- **Pelo terminal:** `git tag v<versão> && git push origin v<versão>`.

Uma execução manual sem marcar *publish* compila as quatro plataformas e deixa os bundles
como artefatos da run, sem publicar nada.
