/**
 * What travels over a link, in Yjs' own wire formats.
 *
 * Two data channels carry two protocols, so a message needs no type tag of
 * its own: the channel it arrived on is the tag. The document channel is
 * reliable and ordered because a lost update would silently diverge the
 * two projects; awareness is neither, because every awareness message is a
 * complete, clock-guarded snapshot of one client - a dropped cursor
 * position is corrected by the next one, and paying for retransmission
 * would only deliver a stale cursor late.
 */
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import type * as Y from "yjs";

import type { Awareness } from "y-protocols/awareness";

/** Opens the conversation: "here is what I have, send me the rest." */
export function syncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

export function syncUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

export interface SyncResult {
  /** What to send straight back, if the message asked for anything. */
  reply: Uint8Array | undefined;
  /** True once the other side has answered with everything we were
   *  missing - the point at which a guest's project is complete. */
  complete: boolean;
}

export function readSync(doc: Y.Doc, message: Uint8Array, origin: unknown): SyncResult {
  const decoder = decoding.createDecoder(message);
  const encoder = encoding.createEncoder();
  const kind = syncProtocol.readSyncMessage(decoder, encoder, doc, origin);
  return {
    reply: encoding.length(encoder) > 0 ? encoding.toUint8Array(encoder) : undefined,
    complete: kind === syncProtocol.messageYjsSyncStep2,
  };
}

export function awarenessUpdate(awareness: Awareness, clients: number[]): Uint8Array {
  return awarenessProtocol.encodeAwarenessUpdate(awareness, clients);
}

export function readAwareness(awareness: Awareness, message: Uint8Array, origin: unknown): void {
  awarenessProtocol.applyAwarenessUpdate(awareness, message, origin);
}

/** Drops the cursors of everyone who was reachable through a link that has
 *  just closed, rather than waiting out the 30s staleness timeout. */
export function forgetAwareness(awareness: Awareness, clients: number[], origin: unknown): void {
  awarenessProtocol.removeAwarenessStates(awareness, clients, origin);
}
