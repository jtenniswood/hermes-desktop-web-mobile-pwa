# AGENTS.md — for AI coding agents working in this repo

This file is addressed to AI coding agents (e.g. the Hermes agent). It is NOT
user-facing documentation; keep user-facing content in `README.md`.

## Project

Hermes Web — the **Hermes Desktop chat UI** as a web app / PWA
(`apps/web-desktop`). An **unofficial community wrapper** of
`NousResearch/hermes-agent` (not affiliated). The renderer sources
(`apps/desktop`, `apps/shared`) are **not in this repo** — they are fetched from
the pinned `hermes-agent` at build time.

## Non‑negotiable rules

- **English only** — every comment, doc, description and commit message in English.
- **Never edit `apps/desktop/` or `apps/shared/`** — they are upstream renderer
  sources fetched at build time (read‑only in the nix store). Change rendering
  only through our files: `apps/web-desktop/src/`, `src/web-bridge/`,
  `src/overrides/`, `vite.config.ts`, `web.css`.
- **Never force‑push / rewrite history.** `origin` is the GitHub repository for
  this project. Keep `main` and feature branches on that repository, and open
  all pull requests there.
- **Never commit secrets or VPS‑identifying data.** `.env` is gitignored and
  stays local; `.env.example` holds placeholders only; `PLAN.md` is gitignored
  (internal); do not add LAN IPs, tailnet hostnames or `/home/ubuntu` paths to
  tracked files.
- **The VPS never builds nix locally** (house rule) — real builds run on GitHub
  Action (`nightly-docker-image.yml`). `nix eval` / `nix flake
  show` locally is fine.

## Remotes & push discipline

- `origin` — GitHub (`https://github.com/jtenniswood/hermes-desktop-web-mobile-pwa.git`) — **primary** and the target for all pull requests.
- The upstream of `main` is `origin/main`.

After every meaningful commit:
```bash
git push origin <branch>
```

## Build & dev

- **Docker (primary image, NIX‑FREE):** `docker build -t hermes-web .`. The build
  fetches the renderer at `HERMES_RENDERER_REV` (default `main` = always the
  latest upstream stream; pin with `--build-arg HERMES_RENDERER_REV=<sha|tag>`).
- **Nix flake (VPS path only):** `nix build .#` / `nix develop`.
- **Dev loop:** `nix develop` → `pnpm install` → `pnpm --filter web-desktop run dev`
  (port 5174). Production preview: `pnpm --filter web-desktop run preview` (4174).
- **Verify:** `pnpm run typecheck`; lint/build are covered by GitHub Actions.

## Errors / self‑repair via Hermes

If something breaks — an error, a button that does not react, something that
fails to start, a chat that hangs — **paste the error / describe the symptom**
to the **Hermes** agent (on the VPS) and ask for a fix. The agent reviews the
code and config, **finds the root cause and fixes it**, then **rebuilds and
reloads the web/docker** — that should be enough.

Self‑repair loop:
1. Receive the problem: “X doesn't work — error: …"
2. Diagnose (container logs, nginx, code) and fix.
3. Rebuild image / web + `docker restart` (reload).
4. Re‑verify via `https://prod-server.emu-nessie.ts.net:8444/` (HTTPS).
