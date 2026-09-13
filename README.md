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

Both apps install `@skema/diagram` from the registry, not from this directory —
a change here reaches them only once it is released and `npm update` has run
there. To try an unreleased change, `npm pack` the package and install the
tarball in the app (a `file:` directory dependency is symlinked, which breaks
TypeScript's resolution of `@skema/model`).

## Release

CI publishes every workspace package to this project's
[GitLab Package Registry](https://gitlab.com/skema-language/skema-lib/-/packages)
when a `vX.Y.Z` tag is pushed. The tag is the version:

```bash
# bump "version" in each package's package.json to X.Y.Z first
git commit -am "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z
```

`scripts/check-release.mjs` refuses to publish if a manifest disagrees with the
tag, so a mistyped bump fails the job instead of shipping a version that cannot
be traced back to a commit.

Both the `@skema` scope and the publish target are configured in the repo:
`.npmrc` points the scope at the skema-language **group** endpoint, which
resolves packages across every project in the group, and each package names its
own project endpoint in `publishConfig.registry`. Consumers need that same
`.npmrc` line to install from the registry.

Two things this repo does *not* do yet, both of them deliberate gaps rather
than design: a language release does not trigger a rebuild here, and
`@skema/diagram`'s dependency on `@skema/model` is a caret rather than the
exact version a release was built against. Which `@skema/model` a consumer
ends up with therefore depends on registry state at install time.
`wasm-packaging/` is the same gap in a second place: fetching a language
release's artifact and publishing `@skema/model`/`@skema/wasm` from it is a
runbook a person follows (its own README), not a CI job triggered by a
language tag. Both are [tasks/07](../brain/tasks/07-close-the-release-chain.md).
