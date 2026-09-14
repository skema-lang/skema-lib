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

CI does it: skema-lang hands its release down with the `skema_lang_version`
input, which runs `publish-language-packages` in
[.gitlab-ci.yml](../.gitlab-ci.yml). To publish a language version again, run
the skema-lib pipeline on `development` with that input set (`vX.Y.Z` or an
RC `vX.Y.Z-rc.N`). The job runs, from the repo root:

```bash
node wasm-packaging/scripts/fetch-artifact.mjs v0.3.2       # → pkg
node wasm-packaging/scripts/build-model-package.mjs 0.3.2   # → npm/model
node wasm-packaging/scripts/build-wasm-package.mjs 0.3.2    # → npm/wasm (pins npm/model)
publish-npm.mjs wasm-packaging/npm/model wasm-packaging/npm/wasm
```

`publish-npm.mjs` is skema-ci's, on `PATH` in its image
(`registry.gitlab.com/skema-language/skema-ci`) - not installed locally. It
tags a prerelease `rc`; only a final moves `latest`.

The version given to `build-*-package.mjs` must be the exact `skema-lang` tag
`fetch-artifact.mjs` downloaded - the two describe the same wasm-bindgen
output, and `@skema/wasm`'s generated manifest pins `@skema/model` to that
same version exactly, not a range.

`fetch-artifact.mjs` needs network access to `gitlab.com` (or
`SKEMA_REGISTRY`/`SKEMA_PROJECT` for a self-hosted mirror or fork); a private
`skema-lang` project needs `GITLAB_TOKEN` (a `read_api` token) or
`CI_JOB_TOKEN` set.

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
