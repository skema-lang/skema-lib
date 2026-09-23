/**
 * How a node reaches its host.
 *
 * `TableNode` and `TableNodeRow` are rendered by React Flow out of
 * `nodeTypes`, so nothing can be passed down to them as props. They need
 * the reveal callbacks and the hover card, and context is the only way
 * either arrives.
 *
 * The declarations themselves live in `types.ts`, which stays free of
 * React so an extension host can read them too.
 *
 * Hover and hidden-edge state live in a second context, `DiagramInteraction`,
 * kept apart from `host`/`chrome` on purpose: those two are stable for a
 * whole session, while a hover changes every pointer move, and mixing the
 * two would re-render every node on every hover.
 */
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

import type { ExportedEnum, ExportedField, ExportedGroup, ExportedTable } from "@skema/model";
import type { DiagramChrome, DiagramHost } from "./types";

interface DiagramContextValue {
  host: DiagramHost;
  chrome: DiagramChrome;
}

const DiagramContext = createContext<DiagramContextValue | null>(null);

export const DiagramContextProvider = DiagramContext.Provider;

function useDiagramContext(): DiagramContextValue {
  const value = useContext(DiagramContext);
  if (!value) {
    throw new Error("Diagram components must be rendered inside <DiagramView>");
  }
  return value;
}

export function useDiagramHost(): DiagramHost {
  return useDiagramContext().host;
}

export function useDiagramChrome(): DiagramChrome {
  return useDiagramContext().chrome;
}

/** Which row - by node id and field name - is currently hovered. */
export interface HoveredRow {
  nodeId: string;
  field: string;
}

interface DiagramInteractionValue {
  hiddenEdgeIds: ReadonlySet<string>;
  toggleHidden: (edgeId: string) => void;
  setHoveredRow: Dispatch<SetStateAction<HoveredRow | null>>;
  hiddenEdgeCount: number;
  showAllEdges: () => void;
}

const DiagramInteractionContext = createContext<DiagramInteractionValue | null>(null);

export const DiagramInteractionProvider = DiagramInteractionContext.Provider;

export function useDiagramInteraction(): DiagramInteractionValue {
  const value = useContext(DiagramInteractionContext);
  if (!value) {
    throw new Error("Diagram components must be rendered inside <DiagramView>");
  }
  return value;
}

/** The hosts' "show all hidden lines" toolbar button. */
export function useHiddenEdges(): { count: number; showAll: () => void } {
  const { hiddenEdgeCount, showAllEdges } = useDiagramInteraction();
  return { count: hiddenEdgeCount, showAll: showAllEdges };
}

/**
 * The reveal helpers every node needs, as thin wrappers over the host's
 * one. A declaration without a location is one the model could not place -
 * clicking it does nothing rather than throwing.
 */
export function useReveal(): {
  revealTable: (table: ExportedTable) => void;
  revealField: (field: ExportedField) => void;
  revealEnum: (en: ExportedEnum) => void;
  revealGroup: (group: ExportedGroup) => void;
} {
  const host = useDiagramHost();
  return {
    revealTable: (table) => {
      if (table.location) host.revealLocation(table.location);
    },
    revealField: (field) => {
      if (field.location) host.revealLocation(field.location);
    },
    revealEnum: (en) => {
      if (en.location) host.revealLocation(en.location);
    },
    revealGroup: (group) => {
      if (group.location) host.revealLocation(group.location);
    },
  };
}
