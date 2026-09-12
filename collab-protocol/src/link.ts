/**
 * What a session needs from a connection to one other person, regardless of
 * how the two browsers found each other.
 *
 * Two implementations share this: `PeerLink` (connection.ts), negotiated by
 * hand when there is nothing else to negotiate over, and `AutoLink`
 * (autoLink.ts), negotiated through a public broker. `session.ts` is written
 * against this interface alone, so it never has to ask which one it is
 * holding.
 */
export type LinkKind = "manual" | "auto";
export type LinkStatus = "connecting" | "connected" | "failed" | "closed";

export interface LinkEvents {
  onDoc(message: Uint8Array, link: Link): void;
  onAwareness(message: Uint8Array, link: Link): void;
  /**
   * The awareness channel is open and presence can be sent.
   *
   * Deliberately separate from the link being usable: the two channels open
   * a moment apart, and this one drops anything handed to it before it is
   * ready rather than queueing it. Sending the first snapshot on the wrong
   * signal loses it silently, and nothing repeats it until the protocol's
   * own 15-second heartbeat - which is a long time to sit in a session that
   * looks empty.
   */
  onAwarenessReady(link: Link): void;
  /** Status changed: opened, or gone for good. */
  onStatus(link: Link): void;
}

export interface Link {
  readonly id: string;
  readonly kind: LinkKind;
  name: string;
  status: LinkStatus;
  /** Whether gathering found an address reachable from outside this
   *  network. Without one, only a browser on the same network can answer
   *  this link at all - worth saying out loud when nothing connects. */
  publicAddress: boolean;
  /** Distinguishes "they left" from "we never got through". */
  everConnected: boolean;
  /** A more specific explanation than the generic "could not reach the
   *  other browser" story `session.ts` falls back to, when one is known. */
  reason?: string;
  sendDoc(message: Uint8Array): void;
  sendAwareness(message: Uint8Array): void;
  close(): void;
}
