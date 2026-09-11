/**
 * The diagram's vocabulary, free of React.
 *
 * Split from `context.ts` deliberately: these declarations are also read by
 * code that never renders anything - an extension host resolving an LSP
 * payload, a test asserting on a model. `context.ts` calls `createContext`
 * at module scope, so importing it from such a place would drag React into
 * a Node process that has no use for it.
 *
 * Type-only React imports are fine here; they disappear at compile time.
 */
import type { ComponentType, ReactNode } from "react";

import type { EnumMeta, ExportedModel, GroupMeta, Location, TableMeta } from "@skema/model";
import type { DetailFact } from "./details";
import type { DiagramLayout, Position } from "./layoutFile";
import type { ProjectStyles } from "./style";

export type { DetailFact };

/** React Flow's built-in edge routings, in the order they are offered.
 *  Which routings exist is the diagram's business; which one is picked is
 *  the host's. */
export const EDGE_ROUTINGS = [
  { value: "bezier", label: "Curve" },
  { value: "smoothstep", label: "Rounded" },
  { value: "step", label: "Right angles" },
  { value: "straight", label: "Straight" },
] as const;

export type EdgeRouting = (typeof EDGE_ROUTINGS)[number]["value"];

export interface DiagramPreferences {
  edgeRouting: EdgeRouting;
  snapToGrid: boolean;
  gridSize: number;
}

/** Everything the diagram draws, as the host currently understands it. */
export interface DiagramSource {
  model: ExportedModel;
  /** Per file, the `Meta` blocks of its declarations - the source of the
   *  assigned style classes. */
  metas: Record<string, TableMeta[]>;
  enumMetas: Record<string, EnumMeta[]>;
  groupMetas: Record<string, GroupMeta[]>;
  projectStyles: ProjectStyles;
  layout: DiagramLayout;
}

/**
 * Everything the diagram cannot do for itself.
 *
 * A browser page implements this against CodeMirror and its own store; an
 * editor extension posts a message and lets the extension host do it. The
 * canvas cannot tell the difference, which is the point.
 */
export interface DiagramHost {
  /** Records the arrangement after a gesture. One call per gesture, with the
   *  whole layout: the host owns where that lands - a file next to the model
   *  in one, a request to whoever holds the workspace in another. */
  saveLayout(layout: DiagramLayout): void;
  /** Opens the file and selects the range. */
  revealLocation(location: Location): void;
}

/** A gesture in progress somewhere else: where someone is holding a set of
 *  boxes right now, before any of it is written to the model. */
export interface RemoteDrag {
  name: string;
  color: string;
  positions: Record<string, Position>;
}

/**
 * The people sharing this diagram, and what they are moving.
 *
 * Absent in a host with nobody to share with, which is why the canvas
 * treats every part of it as optional.
 */
export interface DiagramPresence {
  remoteDrags: RemoteDrag[];
  /** Reports this browser's in-flight drag; `null` ends it. */
  publishDrag(positions: Record<string, Position> | null): void;
}

/** The contract of the injected hover card. */
export interface DetailCardProps {
  title: string;
  /** A short qualifier under the title: a namespace, a type, a kind. */
  subtitle?: string | undefined;
  badges?: string[];
  facts?: DetailFact[];
  /** The model's own prose for this thing (`note = "…"`). */
  note?: string | undefined;
  /** Where it is written, shown as `file:line`. */
  source?: string | undefined;
  children: ReactNode;
}

/**
 * The parts that look different in every host.
 *
 * Injected rather than shared because they are purely a matter of
 * appearance: the browser editor builds them out of its UI library, an
 * extension hand-rolls them against the editor's own theme variables, and
 * forcing one on the other would trade a real design decision for a false
 * economy.
 */
export interface DiagramChrome {
  DetailCard: ComponentType<DetailCardProps>;
  /** Rendered inside the canvas as a React Flow panel, so it stays put
   *  while the canvas pans. Omitted means no view options are offered. */
  Toolbar?: ComponentType;
}
