/**
 * The diagram's layout, as a file beside the model.
 *
 * Positions and line shapes are decisions about a drawing, not about the
 * schema, so they do not belong in the `.skema` source. They do belong in
 * the repository: a layout is worth sharing, reviewing and merging, which is
 * why this is sorted, rounded JSON rather than a binary store.
 *
 * A node in a `Group` stores its position relative to that group's frame,
 * everything else stores an absolute canvas position - see `groupFrame.ts`.
 */
export interface Position {
  x: number;
  y: number;
}

/** A right-angle line's corners, in the order it passes through them. */
export interface EdgeLayout {
  points: Position[];
}

export interface DiagramLayout {
  nodes: Record<string, Position>;
  edges: Record<string, EdgeLayout>;
  hiddenEdges: string[];
}

export const LAYOUT_DIRECTORY = ".skema";
export const LAYOUT_FILE = `${LAYOUT_DIRECTORY}/layout.json`;

const FORMAT = 1;

export function emptyLayout(): DiagramLayout {
  return { nodes: {}, edges: {}, hiddenEdges: [] };
}

export function isEmptyLayout(layout: DiagramLayout): boolean {
  return Object.keys(layout.nodes).length === 0 && Object.keys(layout.edges).length === 0 && layout.hiddenEdges.length === 0;
}

/** Anything unreadable yields an empty layout: a broken or hand-edited file
 *  costs the arrangement, never the model. */
export function parseLayout(text: string): DiagramLayout {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyLayout();
  }
  if (typeof raw !== "object" || raw === null) return emptyLayout();

  const { nodes, edges, hiddenEdges } = raw as { nodes?: unknown; edges?: unknown; hiddenEdges?: unknown };
  return { nodes: readNodes(nodes), edges: readEdges(edges), hiddenEdges: readHiddenEdges(hiddenEdges) };
}

export function serializeLayout(layout: DiagramLayout): string {
  const nodes: Record<string, Position> = {};
  for (const id of Object.keys(layout.nodes).sort()) {
    const at = layout.nodes[id];
    if (at) nodes[id] = round(at);
  }

  const edges: Record<string, EdgeLayout> = {};
  for (const id of Object.keys(layout.edges).sort()) {
    const points = layout.edges[id]?.points;
    if (points && points.length > 0) edges[id] = { points: points.map(round) };
  }

  const hiddenEdges = [...new Set(layout.hiddenEdges)].sort();

  return `${JSON.stringify({ format: FORMAT, nodes, edges, hiddenEdges }, null, 2)}\n`;
}

/** Whole pixels: a drag reports fractions that no one can see and that would
 *  otherwise show up as a diff. */
function round(at: Position): Position {
  return { x: Math.round(at.x), y: Math.round(at.y) };
}

function readPoint(raw: unknown): Position | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number") return undefined;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
}

function readNodes(raw: unknown): Record<string, Position> {
  if (typeof raw !== "object" || raw === null) return {};
  const nodes: Record<string, Position> = {};
  for (const [id, value] of Object.entries(raw)) {
    const at = readPoint(value);
    if (at) nodes[id] = at;
  }
  return nodes;
}

function readEdges(raw: unknown): Record<string, EdgeLayout> {
  if (typeof raw !== "object" || raw === null) return {};
  const edges: Record<string, EdgeLayout> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value !== "object" || value === null) continue;
    const { points } = value as { points?: unknown };
    if (!Array.isArray(points)) continue;
    const read = points.map(readPoint).filter((at): at is Position => at !== undefined);
    if (read.length > 0) edges[id] = { points: read };
  }
  return edges;
}

function readHiddenEdges(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}
