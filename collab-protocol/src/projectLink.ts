/**
 * A whole project packed into one URL-fragment token, so a website can link
 * straight into the editor. A token is attacker-controllable input and the
 * editor can write a project to disk, hence the strict validation on decode.
 */
import { Inflate, deflateSync, strFromU8, strToU8 } from "fflate";
import { fromBase64Url, toBase64Url } from "./base64url";

export const PROJECT_FRAGMENT_KEY = "project";

export const MAX_PROJECT_TOKEN_LENGTH = 64 * 1024;
export const MAX_PROJECT_BYTES = 1024 * 1024;

export interface ProjectLink {
  rootPath: string;
  files: Record<string, string>;
}

export function encodeProjectLink(link: ProjectLink): string {
  const { rootPath, files } = link;
  return toBase64Url(deflateSync(strToU8(JSON.stringify({ rootPath, files })), { level: 9 }));
}

export function decodeProjectLink(token: string): ProjectLink | undefined {
  if (token.length > MAX_PROJECT_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) return undefined;
  try {
    const json = inflateWithinLimit(fromBase64Url(token));
    return validatedProjectLink(JSON.parse(json));
  } catch {
    return undefined;
  }
}

const INFLATE_SLICE_BYTES = 1024;

// fflate's one-shot inflate has no output cap, so feed it in slices and stop
// at the limit; a slice expands to at most ~1 MiB.
function inflateWithinLimit(compressed: Uint8Array): string {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflate = new Inflate((chunk) => {
    total += chunk.length;
    if (total > MAX_PROJECT_BYTES) throw new Error("project too large");
    chunks.push(chunk);
  });
  for (let offset = 0; offset < compressed.length; offset += INFLATE_SLICE_BYTES) {
    const end = Math.min(offset + INFLATE_SLICE_BYTES, compressed.length);
    inflate.push(compressed.subarray(offset, end), end === compressed.length);
  }
  const joined = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    joined.set(chunk, position);
    position += chunk.length;
  }
  return strFromU8(joined);
}

function validatedProjectLink(candidate: unknown): ProjectLink | undefined {
  if (!isRecord(candidate)) return undefined;
  const { rootPath, files } = candidate;
  if (typeof rootPath !== "string" || !isRecord(files)) return undefined;
  if (!Object.hasOwn(files, rootPath)) return undefined;

  const validated: Record<string, string> = {};
  for (const [path, source] of Object.entries(files)) {
    if (typeof source !== "string" || !isSafeProjectPath(path)) return undefined;
    validated[path] = source;
  }
  return { rootPath, files: validated };
}

function isSafeProjectPath(path: string): boolean {
  if (!path.startsWith("/") || !path.endsWith(".skema") || path.includes("\\")) return false;
  return path
    .slice(1)
    .split("/")
    .every((segment) => segment !== "" && segment !== "..");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
