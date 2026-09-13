/**
 * The shared project map every co-editing session's `Y.Doc` carries: one
 * `Y.Text` per file, plus which one is the root - the second interop
 * contract a host needs, alongside `protocol.ts`'s wire framing.
 *
 * `skema-editor`'s `collab/projectBinding.ts` originated this shape
 * (`splice()`-based diffing, the Zustand `useProject` wiring) and is where
 * it stays - both are genuinely browser-only. Only the map's keys and the
 * two getters below are the part every host must agree on byte-for-byte,
 * so only that part moved here (brain/tasks/21-extract-shared-project-map-shape.md):
 * a `skema-vscode` session and a browser session must describe the same
 * file with the same key, or a guest reads `undefined` where it expected
 * content with no error to point at why.
 */
import type * as Y from "yjs";

const FILES_KEY = "files";
const META_KEY = "meta";

/** The key inside {@link sharedMeta} naming which file in {@link sharedFiles}
 *  is the project's root. */
export const ROOT_PATH_KEY = "rootPath";

export function sharedFiles(doc: Y.Doc): Y.Map<Y.Text> {
  return doc.getMap<Y.Text>(FILES_KEY);
}

export function sharedMeta(doc: Y.Doc): Y.Map<string> {
  return doc.getMap<string>(META_KEY);
}
