# Deploying to an Oracle Cloud Always Free VM

Two things run on the box: the built frontend (static files) and the companion
API server (the request forwarder). One reverse proxy puts both on the same
origin, which is what the frontend expects — it calls `/api` relative to itself.

## What the forwarder can reach, and from where

Two send modes reach two different networks, and the difference decides your
setup:

- **Proxy mode** — the call is made by the VM, so it reaches the public
  internet and anything in your VCN. It is not limited by CORS.
- **Browser mode** — the call is made by *your browser*, so it reaches your own
  machine and your LAN. It is limited by CORS.

A VM in Oracle's datacenter cannot see your home or office network, and no
configuration changes that. If "internal" means `localhost:3000` on your
laptop, use browser mode against it (or run the whole thing locally); if it
means another instance in your VCN, that is proxy mode with private targets
enabled below.

## Read this before you expose anything

`POST /api/proxy` forwards any HTTP request it is handed. Reachable from the
internet without a gate in front, it is an open HTTP proxy: it will be found by
scanners, used to relay traffic through your IP, and get the instance suspended
for abuse. With private targets enabled it is worse — it becomes a way into
every service your VCN can reach.

A browser app cannot hold a secret, so the gate cannot live in the frontend.
It has to sit in front of the whole site. Pick one:

| Approach | Good for | How |
| --- | --- | --- |
| **Password on the whole site** | using it from anywhere | the `Caddyfile` here, with `basic_auth` |
| **No public exposure** | just you, one machine | skip Caddy, keep `HOST=127.0.0.1`, reach it over an SSH tunnel |
| **IP allowlist** | a fixed office/home IP | narrow the VCN security list source CIDR |

The SSH tunnel needs nothing on the server side beyond the systemd unit:

```bash
ssh -L 8080:127.0.0.1:8080 -L 8081:127.0.0.1:8081 ubuntu@<vm-ip>
```

Three things defend this, and you should leave all three in place:

- `HOST=127.0.0.1` keeps the API server off the public interface entirely, so
  the reverse proxy is the only way in even if a firewall rule is wrong.
- `PROXY_SHARED_SECRET` is injected by Caddy on every forwarded request and
  never reaches the browser, so talking to the server directly is useless.
  Without a matching `X-Proxy-Auth` header the forwarder answers 401.
- The OCI **instance metadata service** at `169.254.169.254` is blocked
  unconditionally, including when private targets are enabled. That is the
  endpoint that would hand out instance credentials.

### Enabling internal targets

Reaching private addresses is off in production by default. Turn it on in
`/etc/api-workbench.env`:

```
PROXY_ALLOW_PRIVATE_NETWORK=true
PROXY_SHARED_SECRET=$(openssl rand -hex 32)
```

The two go together by design: with private targets enabled and no secret set,
the forwarder refuses to serve at all and tells you why, rather than quietly
exposing the network around it. There is no configuration where it is both
open and reaching your private network.

## 1. Pick a shape

Always Free gives you either an Ampere A1 (ARM, up to 4 OCPU / 24 GB) or two
`VM.Standard.E2.1.Micro` (x86, 1 GB RAM each). Prefer the Ampere — Node builds
comfortably there.

On a 1 GB micro instance, `pnpm install` and the Vite build can run out of
memory. Either add swap first:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

…or build on your laptop and copy `artifacts/api-workbench/dist/public` and
`artifacts/api-server/dist` up with `rsync`.

## 2. Open the port in BOTH firewalls

This is the step that catches everyone on OCI. A port must be open in the
**VCN security list** (cloud side) *and* in the **instance firewall** (OS side).
Miss either one and the connection just times out with no error anywhere.

Cloud side: VCN → Subnet → Security List → add an ingress rule, source
`0.0.0.0/0`, TCP, destination port 80 and 443.

OS side, Ubuntu images:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

OS side, Oracle Linux images:

```bash
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

Note that only 80 and 443 are opened. Port 8080 stays closed, and the API
server is not listening on a public interface anyway.

## 3. Install the runtime

Node 22 or newer (verified on 22.x; the repo targets 24):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo corepack enable && corepack prepare pnpm@10 --activate
```

## 4. Build

```bash
sudo mkdir -p /srv/api-workbench && sudo chown "$USER" /srv/api-workbench
git clone https://github.com/lucasdias1707/carom-client-api.git /srv/api-workbench
cd /srv/api-workbench
pnpm install --frozen-lockfile
pnpm run check                                    # typecheck + tests
PORT=8080 BASE_PATH=/ pnpm run build
```

`BASE_PATH=/` matters: it is baked into the asset URLs at build time. Serve the
app under a subpath and it has to be rebuilt with that subpath instead.

## 5. Run the API server under systemd

```bash
sudo useradd --system --no-create-home apiworkbench
sudo cp deploy/api-workbench.env.example /etc/api-workbench.env
sudo vim /etc/api-workbench.env                # set the secret
sudo chown root:root /etc/api-workbench.env && sudo chmod 600 /etc/api-workbench.env
sudo cp deploy/api-workbench-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now api-workbench-api
systemctl status api-workbench-api
curl -s http://127.0.0.1:8080/api/healthz     # expect {"status":"ok"}
```

## 6. Put Caddy in front

```bash
sudo apt-get install -y caddy
sudo systemctl edit caddy                      # add: [Service] EnvironmentFile=/etc/api-workbench.env
caddy hash-password                            # paste the hash into the Caddyfile
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo vim /etc/caddy/Caddyfile                  # set your hostname and hash
sudo systemctl reload caddy
```

With a real hostname pointed at the instance, Caddy issues and renews TLS on
its own. Without one, use the `:80` variant noted in the file and treat it as
temporary — basic auth over plain HTTP sends the password in the clear.

## 7. Check it

```bash
# 1. no credentials at all -> expect 401 from Caddy
curl -so /dev/null -w '%{http_code}\n' https://workbench.example.com/api/healthz

# 2. past Caddy but without the injected secret -> expect 401 from the server
curl -u you:yourpassword -X POST https://workbench.example.com/api/proxy \
  -H 'Content-Type: application/json' \
  -d '{"method":"GET","url":"https://example.com"}'

# 3. the app itself, in a browser, after logging in -> should send normally
```

The first two are the ones that matter. Two 401s mean neither the public
internet nor a logged-in user can drive the forwarder without going through
Caddy. If either returns 200, stop and fix the gate before leaving the instance
running.

## Updating

```bash
cd /srv/api-workbench && git pull
pnpm install --frozen-lockfile
PORT=8080 BASE_PATH=/ pnpm run build
sudo systemctl restart api-workbench-api
```

## Do you even need the API server?

Only for APIs that do not send CORS headers. Public ones that do — PokeAPI,
the GitHub API, most documented public APIs — work from the frontend alone.
If that covers your use, deploy step 4 and 6 only, drop the `handle /api/*`
block from the Caddyfile, and skip the server entirely: nothing to attack.
