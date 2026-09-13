# @skema/collab-protocol

The interoperability contract between every host that can join a skema
collaboration session: [skema-editor](https://gitlab.com/skema-language/skema-editor)
(browser) and [skema-vscode](https://gitlab.com/skema-language/skema-vscode)
(extension).

## What is in here, and what is not

Only the part that must be byte-identical across hosts for a Yjs document to
sync at all:

- `protocol.ts` — how a Yjs sync/awareness message is framed on the wire.
- `link.ts` — the `Link` transport interface a session programs against,
  regardless of how the two hosts found each other.
- `invite.ts` — the `Invite` data shapes and their encode/decode functions
  (base64url over a deflated, JSON-serialized invite).
- `projectMap.ts` — the shared project's `Y.Doc` shape: which key holds the
  `Y.Text` per file, which key names the root. `skema-editor`'s
  `collab/projectBinding.ts` and `skema-vscode`'s `collab/projectSync.ts`
  both key a session's shared files this way
  ([brain/tasks/21](../../brain/tasks/21-extract-shared-project-map-shape.md)) -
  everything that reads or writes the map's *content* (the diff algorithm,
  the store wiring, seeding/adopting a project) stays in each host, only the
  map's shape moved here.

Session orchestration, the transport implementation (WebRTC, a broker), and
UI stay in each host's own repo — the two runtimes (browser DOM + React vs.
a Node extension host) are different enough that forcing them into one
module would be artificial. See the workspace brain's `decisions.md`,
"Collaboration across hosts", for the reasoning (outside this repo's git
history — a sibling checkout, not a published doc).

Reading an invite out of a URL (`window.location`) is host-specific and
deliberately **not** here — only `skema-editor` has a URL fragment to read
one from today. `tokenFromText` (parsing a token out of pasted text, no
`window` needed) stayed; `inviteUrl`/`takeInviteFromUrl` (both need
`window.location`) did not.

## Base64, not `btoa`/`atob`

`invite.ts` hand-rolls base64url instead of calling `btoa`/`atob` — browser
globals a Node extension host doesn't reliably have — or `Buffer` — a Node
global the browser doesn't have. Plain arithmetic over a `Uint8Array` is the
one thing both runtimes share.

## Development

```bash
cd skema-lib && npm install && npm run build
npm run dev --workspace @skema/collab-protocol   # rebuild dist/ on change
```

Both consumers install this package from the registry once it is released —
see [skema-lib's README](../README.md) for trying an unreleased change out
first.

## A note on `yjs`/`y-protocols`

Declared as `peerDependencies`, not `dependencies`. A `Y.Doc`/`Awareness`
instance crosses this package's boundary by reference; if npm ever resolves
two separate copies of `yjs` in a consumer's tree (this package's own copy,
nested, plus the host's), Yjs's own runtime check rejects them as
incompatible ("multiple Yjs instances"). After wiring this package into a
host, verify with `npm ls yjs y-protocols` — exactly one resolved version of
each, no nesting.
