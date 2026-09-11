# @skema/diagram

The skema diagram canvas: the React Flow view that draws a model as tables,
enums and relationships. Shared by [skema-editor](https://gitlab.com/skema-language/skema-editor)
(browser) and [skema-vscode](https://gitlab.com/skema-language/skema-vscode)
(extension webview).

## What is in here, and what is not

The package draws a model and reports gestures. It does not know how to read a
file, edit one, or scroll an editor — that is the host's job, handed over as a
`DiagramHost`. Anything that looks different per host (`DetailCard`, the
toolbar) is injected as `DiagramChrome` and stays in the app.

Collaboration is the same deal: `DiagramPresence` is an optional port. Without
it the canvas draws normally; a host that has a presence implementation passes
one in and remote drags appear.

## What it draws

Positions and the corners of right-angle lines come from `.skema/layout.json`
beside the model (`layoutFile.ts`), never from a `.skema` source. Lines are
routed through those corners by `route.ts`, which replaces React Flow's
single-bend `step` routing.

## Development

Both consumers point at this directory until it is published:

```bash
cd skema-lib && npm install && npm run build
npm run dev            # rebuild diagram/dist on change
```

Model types come from `@skema/model`, generated in the language repo.
