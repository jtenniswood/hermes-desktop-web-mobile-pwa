# Interface comparison preview

This review build offers **Desktop familiar** and **Browser focused** using the
same pinned Hermes Desktop renderer, gateway connection, providers, chat,
composer, session surfaces, Bot contributions, settings, and plugin discovery.
Neither experience is selected as the permanent product direction. Comparison
controls are included only when building with `HERMES_COMPARISON=1`.

Desktop familiar retains the upstream contribution controller and layout tree.
Browser focused supplies a header, Sessions/Bots/Tools navigation, a profile
selector, and a drawer below 48rem. Settings and contributed tools still use
upstream bodies and actions. Browser navigation and upstream layout preferences
are stored separately; theme, zoom and draft storage remain shared.

## Run the isolated preview

The `interface-comparison-preview` workflow builds and tests the actual nginx
image, then publishes an immutable amd64 PR image and its synthetic gateway.
Download the `comparison-images-<commit>` artifact for the exact image names.
From this branch, start a separate Docker Compose project:

```sh
docker compose --env-file comparison-images.env -f compose.comparison.yml up -d
```

Open `http://localhost:4186/?experience=desktop` or
`http://localhost:4186/?experience=browser`. Both links refer to the same preview.
An operator can expose that loopback port through their normal HTTPS access
layer. `HERMES_PREVIEW_PORT` changes the loopback port. The Compose project has
its own network and containers; it does not restart or join production.

The default gateway contains synthetic conversations and three profiles. It
streams deterministic responses without calling an external model. Its state is
in memory and resets when that preview gateway restarts. Do not put real private
conversations into this fixture. To use a real gateway instead, set
`HERMES_GATEWAY_URL` and optionally `HERMES_GATEWAY_NAME` in an untracked local
environment file; the normal runtime configuration and sign-in flow apply.

Build locally when CI images are not needed:

```sh
docker build --build-arg HERMES_COMPARISON=1 \
  --build-arg HERMES_WRAPPER_REV="$(git rev-parse HEAD)" \
  --build-arg HERMES_RELEASE_CHANNEL=comparison -t hermes-web:comparison .
docker build --target preview-gateway -t hermes-web:comparison-gateway .
docker compose -f compose.comparison.yml up -d
```

Stop only this preview with:

```sh
docker compose -f compose.comparison.yml down
```

## Walkthrough

1. Open a seeded session and send a message. Watch the shared streaming behavior.
2. Type an unsent text draft, then change **Experience**. The controlled reload
   retains the session hash, selected profile and persisted draft. The query
   selects an experience explicitly; otherwise the choice is remembered per tab,
   with Desktop familiar as the initial default.
3. Start a response, or attach a file without sending it. The selector explains
   why it is temporarily disabled. Cancel or finish the response, or send/remove
   the attachment, before switching. Recording and pending uploads also block a
   reload through the shared browser safety coordinator.
4. Open Research and Writer under Bots, then reopen a session. Try the Profile
   picker, settings, and contributed Tools. On a phone, opening a session or Bot
   closes navigation and returns focus to the conversation.
5. Compare phone and desktop widths, themes, zoom and keyboard navigation.

Build identity is available at `/build-info.json` and through the app's build
metadata. It identifies the wrapper commit, renderer commit, dependency lock,
build time and comparison channel; backend version is reported separately.

## Verification and compatibility

```sh
corepack pnpm typecheck
corepack pnpm test:foundation
HERMES_COMPARISON_IMAGE=hermes-web:comparison \
  corepack pnpm exec playwright test tests/browser/comparison.spec.mjs
```

Playwright starts an isolated synthetic gateway and tests through the actual
built nginx image. CI retains screenshots, test results and failure traces.
An explicit `HERMES_COMPARISON_URL` can instead test an already running synthetic
preview. The ordinary compatibility workflow separately verifies the stable
build, which excludes the selector and browser shell.

The adapter checks exact upstream shell entrypoint, wiring, controller,
titlebar, and storage contracts before enabling composition overrides. A changed
contract fails the comparison build for review. Fetched sources stay untouched.
This comparison PR is stacked on the foundation PRs and remains a draft for
trying both experiences. It does not enable automatic production rollout.
