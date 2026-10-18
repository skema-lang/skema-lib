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
import { fromBase64Url, toBase64Url } from "./base64url";

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

/** The broker room id a host listens on for an auto invite. */
export function brokerRoomId(): string {
  return `skema-${inviteId()}`;
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

/** skema-vscode's own publisher.name id, from its `package.json`. */
export const VSCODE_EXTENSION_ID = "skema.skemavscode";

/** The `vscode://` link a browser hands an invite to VS Code with. No
 *  URL-encoding: base64url is already URL-safe. */
export function vscodeJoinUri(token: string, scheme = "vscode"): string {
  return `${scheme}://${VSCODE_EXTENSION_ID}/join?${FRAGMENT_KEY}=${token}`;
}

const QUERY_MARKER = new RegExp(`[?&]${FRAGMENT_KEY}=([^&#]*)`);

function asToken(candidate: string): string | undefined {
  return /^[A-Za-z0-9_-]+$/.test(candidate) ? candidate : undefined;
}

/** The token out of whatever was pasted: a whole link (editor `#collab=` or
 *  vscode `?collab=`) or the token alone. */
export function tokenFromText(text: string): string | undefined {
  const trimmed = text.trim();
  const fragmentMarker = `#${FRAGMENT_KEY}=`;
  const fragmentAt = trimmed.indexOf(fragmentMarker);
  if (fragmentAt !== -1) return asToken(trimmed.slice(fragmentAt + fragmentMarker.length));

  const queryMatch = trimmed.match(QUERY_MARKER);
  if (queryMatch) return asToken(queryMatch[1] ?? "");

  return asToken(trimmed);
}
