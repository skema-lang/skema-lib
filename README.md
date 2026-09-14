# skema-lib

The TypeScript packages shared by skema's editors, as one npm workspace.

| Package | What it is |
|---|---|
| [`@skema/diagram`](diagram) | The React Flow diagram canvas: nodes, groups, right-angle routing, the layout file |
| [`@skema/collab-protocol`](collab-protocol) | The Yjs wire protocol and invite encoding both editors' collaboration features speak |
| [`@skema/docs`](docs) | Renders the resolved model as Markdown, for both editors' documentation panes |

Consumed by [skema-editor](https://gitlab.com/skema-language/skema-editor)
(browser) and [skema-vscode](https://gitlab.com/skema-language/skema-vscode)
(extension webview). Model types come from `@skema/model`, and the WASM
bindings from `@skema/wasm` - both produced by
[`wasm-packaging/`](wasm-packaging) from a [language
repo](https://gitlab.com/skema-language/skema) release, not a workspace
package itself (see its own README:
[brain/tasks/10](../brain/tasks/10-move-npm-packaging-out-of-skema-lang.md)
moved this here so the language repo stays Rust-only).

> Architecture, open tasks and decisions spanning all four `skema-language`
> repos live in the shared [brain](../brain/README.md) — read it before
> starting non-trivial work here, and update it before you finish.

```bash
npm install
npm run build        # every package
npm run typecheck
npm run dev          # rebuild @skema/diagram on change
```

Both apps install these packages from the registry, not from this directory —
a change here reaches them once its version is published and handed down (see
Release). To try an unreleased change, `npm pack` the package and install the
tarball in the app (a `file:` directory dependency is symlinked, which breaks
TypeScript's resolution of `@skema/model`).

## Release

`@skema/diagram`, `@skema/docs` and `@skema/collab-protocol` share one version,
released through the skema-ci component on a push to `development` (RC) or a
merge to `main` (final). `@skema/model` and `@skema/wasm` are not workspace
packages: a `skema_lang_version` pipeline input publishes both at the
language's version instead ([wasm-packaging/](wasm-packaging)) and never
releases a skema-lib version of its own. Either path ends by handing the
versions it published down to skema-editor and skema-vscode.

`@skema/diagram` and `@skema/docs` take `@skema/model` as a peer dependency, so
the app decides which model it runs; a language input checks that every
package here still builds against the new one (`check-model`).

Mechanism and job contracts: [CLAUDE.md, "Releasing — the
chain"](../CLAUDE.md), [brain/release-chain.md](../brain/release-chain.md).

Both the `@skema` scope and the publish target are configured in the repo:
`.npmrc` points the scope at the skema-language **group** endpoint, which
resolves packages across every project in the group, and each package names its
own project endpoint in `publishConfig.registry`. Consumers need that same
`.npmrc` line to install from the registry.
