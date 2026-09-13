# @skema/docs

The skema model as Markdown reference documentation. Shared by
[skema-editor](https://gitlab.com/skema-language/skema-editor)'s
documentation pane and
[skema-vscode](https://gitlab.com/skema-language/skema-vscode)'s docs
preview — one description of what the generated documentation looks like,
not two that drift.

## What is in here, and what is not

`modelToMarkdown(model, getNote)` turns an `ExportedModel` into Markdown.
The model alone cannot tell the whole story — the prose lives in
`Meta { note = "…" }`, which `skema-hir` drops during resolution — so a
second argument, `getNote`, is the port a host fills in: given a
declaration's `file` and `name`, return its note if it wrote one. This is
the same shape `DiagramHost` (`@skema/diagram`) is: the package asks a
question, the host answers it however its own state is shaped.

Nothing about *where* a note comes from crosses this boundary. `skema-vscode`
reads it off a `skema/model` LSP response's `metas`; `skema-editor` reads it
off its own store's per-kind maps. Each host builds its own small lookup
(commonly backed by a `Map<string, string>` keyed by `` `${file}::${name}` ``)
and passes a plain function.

## Development

```bash
cd skema-lib && npm install && npm run build
npm run dev --workspace @skema/docs   # rebuild dist/ on change
```

Both consumers install this package from the registry once it is released —
see [skema-lib's README](../README.md) for trying an unreleased change out
first.
