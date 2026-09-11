# skema-lib

The TypeScript packages shared by skema's editors, as one npm workspace.

| Package | What it is |
|---|---|
| [`@skema/diagram`](diagram) | The React Flow diagram canvas: nodes, groups, right-angle routing, the layout file |

Consumed by [skema-editor](https://gitlab.com/skema-language/skema-editor)
(browser) and [skema-vscode](https://gitlab.com/skema-language/skema-vscode)
(extension webview). Model types come from `@skema/model`, generated in the
[language repo](https://gitlab.com/skema-language/skema).

```bash
npm install
npm run build        # every package
npm run typecheck
npm run dev          # rebuild @skema/diagram on change
```

Until the packages are published, the two apps depend on this directory by
path (`file:../skema-lib/diagram`). Those lines move to registry versions at
release time.

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

> **Currently blocked.** `@skema/diagram` depends on `@skema/model@^0.1.2`, and
> that package is not in the registry yet — skema-language/skema has tagged
> v0.1.0–v0.1.3 but its `publish-npm-model` job has never landed a package, so
> `npm ci` fails here with a 404. Once that job runs once, `npm install` will
> resolve it and the regenerated `package-lock.json` needs to be committed.
