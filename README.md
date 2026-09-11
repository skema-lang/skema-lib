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
