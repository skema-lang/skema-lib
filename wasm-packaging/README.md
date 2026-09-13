# wasm-packaging

Turns a `skema-lang` release's raw `wasm-pack` build output into the two npm
packages the two editor front ends depend on:

| Package | What it is |
|---|---|
| `@skema/model` | TypeScript declarations for the skema model, generated from `skema-api` |
| `@skema/wasm` | The WASM glue, binary and browser-facing check/export functions |

Not itself an npm workspace package - it produces packages, and its two
inputs (a release tag, a downloaded build artifact) don't fit the
`tsc -p tsconfig.build.json` shape every workspace member here uses. It
depends on nothing outside Node's standard library, so no `npm install` is
needed to run it.

## Why this exists

`skema-lang` is Rust-only - see
[CLAUDE.md, "Where code belongs"](../../CLAUDE.md) and
[brain/tasks/10](../../brain/tasks/10-move-npm-packaging-out-of-skema-lang.md).
Its CI still builds the wasm bindings (`wasm-pack build`) and publishes the
raw output as a generic-package-registry artifact
(`skema-wasm.tar.gz`, one per tag) - that much is a Rust/WASM build, not npm
packaging. Turning that artifact into two publishable npm packages is JS by
nature, so it lives here instead.

## Releasing a new version

Same bar every other package in this repo meets today - see the root
[README](../README.md#release), "released by hand", no CI trigger yet
([brain/tasks/07](../../brain/tasks/07-close-the-release-chain.md) is the
open task for automating this handoff):

```bash
cd wasm-packaging
node scripts/fetch-artifact.mjs v0.3.2          # → ./pkg
node scripts/build-model-package.mjs 0.3.2      # → npm/model
node scripts/build-wasm-package.mjs 0.3.2       # → npm/wasm (depends on npm/model)

cd npm/model && npm publish && cd ../..
cd npm/wasm && npm publish && cd ../..
```

The version given to `build-*-package.mjs` must be the exact `skema-lang` tag
`fetch-artifact.mjs` downloaded - the two describe the same wasm-bindgen
output, and `@skema/wasm`'s generated manifest pins `@skema/model` to that
same version exactly, not a range.

`fetch-artifact.mjs` needs network access to `gitlab.com` (or
`SKEMA_REGISTRY`/`SKEMA_PROJECT` for a self-hosted mirror or fork); a private
`skema-lang` project needs `GITLAB_TOKEN` (a `read_api` token) or
`CI_JOB_TOKEN` set. `npm publish` needs credentials for this project's own
registry - `publishConfig.registry` in each generated manifest already names
it, so a plain `.npmrc` with an auth token for `gitlab.com` is enough.

## Local testing without a published tag

Point `SKEMA_WASM_DTS` at a local `wasm-pack build` output instead of
fetching one:

```bash
SKEMA_WASM_DTS=/path/to/skema-lang/crates/skema-wasm/pkg/skema_wasm.d.ts \
  node scripts/build-model-package.mjs 0.0.0-dev
```

`build-wasm-package.mjs` reads the other three runtime files
(`skema_wasm.js`, `skema_wasm_bg.wasm`, `skema_wasm_bg.wasm.d.ts`) from that
same directory.
