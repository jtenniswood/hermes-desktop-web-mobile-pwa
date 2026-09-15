> ⚠️ **Unofficial** — this project is not affiliated with or endorsed by
> [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent).
> The code is AI-generated and AI-reviewed. Use it on a private network and
> review it before exposing it to the internet.

# Hermes Desktop Web

Hermes Desktop's chat interface as a browser app and installable PWA. The
Docker image contains the web interface only. You must already have a Hermes
gateway running separately.

## Run with Docker

You need:

- Docker
- A running Hermes gateway, normally listening on port `9119`
- A private network or a reverse proxy that provides HTTPS

### 1. Get the image

Build it locally:

```bash
docker build -t hermes-web .
```

Or use the nightly image published by this repository:

```bash
docker pull ghcr.io/jtenniswood/hermes-desktop-web-mobile-pwa:nightly
docker tag ghcr.io/jtenniswood/hermes-desktop-web-mobile-pwa:nightly hermes-web
```

The nightly image supports both `linux/amd64` and `linux/arm64`.

### 2. Create the container configuration

Create a file next to the repository called `hermes-web.env`:

```dotenv
# The gateway is running on the Docker host.
HERMES_GATEWAY_URL=http://host.docker.internal:9119

# Path inside the container. The run command below mounts ~/.hermes here.
HERMES_HOME=/data/hermes
```

If the gateway is on another machine, replace the first value with that
machine's hostname or private-network address. If the gateway is another
container, use its Docker service/container name instead, for example
`http://hermes-gateway:9119`, and put both containers on the same Docker
network.

Do not use `127.0.0.1` for a gateway running on the host: inside the web
container, `127.0.0.1` means the web container itself.

### 3. Start the web interface

The following command assumes the gateway's Hermes data is in `~/.hermes`:

```bash
docker run -d \
  --name hermes-web \
  --restart unless-stopped \
  -p 4174:80 \
  --add-host host.docker.internal:host-gateway \
  --env-file ./hermes-web.env \
  --mount type=bind,src="$HOME/.hermes",dst=/data/hermes \
  hermes-web
```

Open <http://localhost:4174> on the Docker host. From another device, use
the host's private-network address instead of `localhost`.

The `--add-host` option makes `host.docker.internal` work on Linux. It is
harmless on Docker Desktop and is useful when the gateway runs on the host.

### 4. Check or stop it

```bash
curl -f http://localhost:4174/
docker logs -f hermes-web
docker stop hermes-web
```

The GitHub Actions workflow also publishes multi-architecture images to
`ghcr.io/<owner>/<repo>` when changes are merged to `main`. Each build gets an
immutable `release-<commit>` tag, while the `main` and `latest` tags are
updated for convenient deployment. `v*` tags also produce semver image tags.
The build context excludes `.env`, `node_modules`, `dist`, `apps/desktop`, and
`apps/shared` via `.dockerignore`.

To start the same container again after stopping it, use `docker start
hermes-web`.

## Configuration

The container reads runtime settings from `--env-file` or from environment
variables passed with `-e`. The `hermes-web.env` file above is the recommended
way to keep the configuration in one place.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HERMES_GATEWAY_URL` | `http://127.0.0.1:9119` | URL of the Hermes gateway. The image proxies REST requests and WebSockets to this URL. Set this explicitly when using Docker. |
| `HERMES_HOME` | `/data/hermes` | Directory inside the container containing the mounted Hermes data. The image serves its `plugins/` and `desktop-plugins/` subdirectories to the web app. |

The container listens on port `80` inside the image. In `-p 4174:80`, `4174`
is the host port; change it if that port is already in use, for example
`-p 8080:80`.

The image is plain HTTP. If you use Caddy, nginx, Traefik, or another reverse
proxy, point it at `http://127.0.0.1:4174` and terminate HTTPS at the proxy.
Keep the gateway and web interface behind authentication and a private
network unless you have separately hardened the deployment.

### Mounting a different Hermes home

Change both sides of the mount if the data is stored somewhere else:

```bash
--mount type=bind,src="/path/to/hermes",dst=/data/hermes
```

If you set a different container path in `HERMES_HOME`, the destination of the
mount must match it:

```dotenv
HERMES_HOME=/config/hermes
```

```bash
--mount type=bind,src="/path/to/hermes",dst=/config/hermes
```

The gateway still needs access to its own configuration and data. The web
container mounts the Hermes home primarily so plugin files can be displayed;
it does not start or configure the gateway.

### Updating the image

To update a local build:

```bash
docker build --pull -t hermes-web .
docker stop hermes-web
docker rm hermes-web
# Run the docker run command above again.
```

By default, the Docker build fetches the latest `main` branch of the upstream
Hermes renderer. For a reproducible build, pin the renderer to a commit or
tag:

```bash
docker build \
  --build-arg HERMES_RENDERER_REV=<commit-or-tag> \
  -t hermes-web .
```

## Troubleshooting

**The page loads, but it cannot connect.** Check `HERMES_GATEWAY_URL` and
confirm that the gateway is reachable from a process inside the container.
For a host gateway, use `host.docker.internal` and keep
`--add-host host.docker.internal:host-gateway` in the run command.

**The gateway is in another container.** Put the containers on the same
Docker network and use the gateway container or service name in
`HERMES_GATEWAY_URL`, not `localhost`.

**Plugins do not appear.** Check that the host directory contains
`plugins/` or `desktop-plugins/` and that it is mounted at the same path as
`HERMES_HOME`.

**Port 4174 is already in use.** Change only the host side of the port mapping,
for example `-p 8080:80`, then open <http://localhost:8080>.

## Development

The Docker workflow is the recommended way to run a production-like copy.
For local development with hot reload:

```bash
pnpm install
pnpm --filter web-desktop run dev
```

The development server listens on port `5174`. It uses
`HERMES_GATEWAY_URL` from `apps/web-desktop/.env`, or defaults to
`http://127.0.0.1:9119` when the gateway runs directly on the development
machine. The Nix flake is an alternative build/development path; it is not
needed to build or run the Docker image.

## How it works

- The build fetches `apps/desktop` and `apps/shared` from
  `NousResearch/hermes-agent` and bundles them with this repository's web
  bridge.
- The runtime image is nginx serving static files.
- nginx proxies `/api`, `/auth`, `/login`, and `/api/ws` to
  `HERMES_GATEWAY_URL`, keeping browser authentication same-origin.
- `HERMES_HOME/plugins` and `HERMES_HOME/desktop-plugins` are exposed as the
  corresponding plugin paths in the web app.

The upstream renderer directories are supplied at build time and must not be
added to or edited in this repository. Local changes belong under
`apps/web-desktop/` and the nginx/entrypoint files at the repository root.

## Limitations

This web version does not provide Electron-only features such as the local
terminal, native file dialogs, native git operations, the pet overlay, or
desktop auto-update. Browser chat, gateway communication, PWA installation,
and gateway-backed features remain available.

## License and provenance

The first version of this code was created in
[`mdg-qc/hermes-desktop-web-mobile-pwa`](https://github.com/mdg-qc/hermes-desktop-web-mobile-pwa).
This repository is an unofficial community wrapper around the Hermes Desktop
renderer. The web bridge includes code ported from
[`przbadu/hermes-ui`](https://github.com/przbadu/hermes-ui) under its MIT
license. Upstream Hermes Agent code is fetched from its own repository at
build time; consult that project for its license and notices.
