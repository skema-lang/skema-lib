/**
 * The two handshake styles this feature supports, packed into links.
 *
 * An `"auto"` invite is the common case: a room id and nothing else, meant
 * to be resolved through a public broker. It carries no SDP because there is
 * nothing to hand-carry - the broker introduces the two peers directly. It
 * is also the only kind that is safe to reuse: the same link can be opened
 * by more than one guest, since the broker hands every connection attempt
 * to the same room id straight to the host.
 *
 * An `"offer"`/`"answer"` invite is the fallback, used when that broker
 * cannot be reached. There the offer and the answer have to travel by
 * whatever channel the two people already use - that makes the link the
 * whole handshake, and, until it is answered, the only thing standing
 * between the project and whoever holds it. Unlike an auto invite, it is
 * single-use: it is tied to one peer connection that only ever accepts one
 * answer.
 *
 * An SDP with its candidates is a few kilobytes of very repetitive text, so
 * it is deflated before it is encoded: the difference between a link that
 * survives a chat window and one that does not. Auto invites are small
 * enough not to need this, but go through the same encoding for one format
 * rather than two.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";

export type InviteKind = "offer" | "answer" | "auto";

interface InviteBase {
  /** Which invitation this belongs to: a host with several outstanding
   *  manual ones has to know which pending connection an answer completes;
   *  for an auto invite, this is the host's own broker room id. */
  id: string;
  /** The sender's display name, so the other side knows who is asking. */
  name: string;
}

/** A room id, resolved through a public broker - no SDP, since there is
 *  nothing to hand-carry. */
export interface AutoInvite extends InviteBase {
  kind: "auto";
}

/** The fallback: an SDP that has to travel by hand. */
export interface ManualInvite extends InviteBase {
  kind: "offer" | "answer";
  sdp: string;
}

export type Invite = AutoInvite | ManualInvite;

/** The fragment key a host embeds an encoded invite token under, e.g.
 *  `#collab=<token>` in a URL. Shared so every host recognizes the same
 *  marker even though reading one out of a URL is host-specific (only
 *  `skema-editor` has a `window.location` to read it from today). */
export const FRAGMENT_KEY = "collab";

export function inviteId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * RFC 4648 base64url, hand-rolled rather than reached for `btoa`/`atob`
 * (browser-only) or `Buffer` (Node-only) - plain arithmetic over a
 * `Uint8Array` is the one thing every host this package targets shares. No
 * padding is emitted, matching base64url convention.
 */
function toBase64Url(bytes: Uint8Array): string {
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    output += BASE64_ALPHABET.charAt((chunk >> 18) & 0x3f);
    output += BASE64_ALPHABET.charAt((chunk >> 12) & 0x3f);
    if (i + 1 < bytes.length) output += BASE64_ALPHABET.charAt((chunk >> 6) & 0x3f);
    if (i + 2 < bytes.length) output += BASE64_ALPHABET.charAt(chunk & 0x3f);
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bytes: number[] = [];
  for (let i = 0; i < base64.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(base64.charAt(i));
    const c1 = BASE64_ALPHABET.indexOf(base64.charAt(i + 1));
    const char2 = base64.charAt(i + 2);
    const char3 = base64.charAt(i + 3);
    const c2 = char2 === "" ? -1 : BASE64_ALPHABET.indexOf(char2);
    const c3 = char3 === "" ? -1 : BASE64_ALPHABET.indexOf(char3);
    bytes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
    if (c2 !== -1) bytes.push(((c1 << 4) | (c2 >> 2)) & 0xff);
    if (c3 !== -1) bytes.push(((c2 << 6) | c3) & 0xff);
  }
  return new Uint8Array(bytes);
}

export function encodeInvite(invite: Invite): string {
  return toBase64Url(deflateSync(strToU8(JSON.stringify(invite)), { level: 9 }));
}

export function decodeInvite(token: string): Invite | undefined {
  try {
    const parsed = JSON.parse(strFromU8(inflateSync(fromBase64Url(token)))) as Partial<InviteBase> & {
      kind?: InviteKind;
      sdp?: string;
    };
    if (!parsed.id) return undefined;
    const name = parsed.name || "Anonymous";
    if (parsed.kind === "auto") return { kind: "auto", id: parsed.id, name };
    if ((parsed.kind === "offer" || parsed.kind === "answer") && parsed.sdp) {
      return { kind: parsed.kind, id: parsed.id, name, sdp: parsed.sdp };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** The token out of whatever was pasted: a whole link or the token alone. */
export function tokenFromText(text: string): string | undefined {
  const trimmed = text.trim();
  const marker = `#${FRAGMENT_KEY}=`;
  const at = trimmed.indexOf(marker);
  const token = at === -1 ? trimmed : trimmed.slice(at + marker.length);
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : undefined;
}
