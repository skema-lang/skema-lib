/**
 * The diagram pane.
 *
 * Positions come from the layout file beside the model (`layoutFile.ts`);
 * dragging a box writes them back there, once, on drag stop - the drag
 * itself is React Flow's own state, so a gesture produces one write rather
 * than one per animation frame.
 *
 * Nodes are held in state rather than derived on every render: React Flow
 * reports selection, measured size and drag through the same change
 * stream, and a purely derived list throws all of that away - which is
 * what makes selection and multi-node dragging not work at all.
 *
 * A single click only selects. Opening the declaration is a double-click
 * (on the header, or on the row for a single field), because a click that
 * also scrolled the editor made picking several tables for a group drag
 * throw the text pane around on every step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { Location } from "@skema/model";
import { DiagramContextProvider, DiagramInteractionProvider, type HoveredRow } from "./context";
import { EnumNode, enumNodeHeight } from "./EnumNode";
import { GROUP_DRAG_HANDLE, GroupNode } from "./GroupNode";
import {
  groupFrame,
  toAnchor,
  toChildPosition,
  toStoredPosition,
  type GroupFrame,
  type MemberBox,
} from "./groupFrame";
import type {
  DiagramChrome,
  DiagramHost,
  DiagramPresence,
  DiagramPreferences,
  DiagramSource,
} from "./types";
import {
  edgeSides,
  enumId,
  enumNodeData,
  groupId,
  groupMemberId,
  groupMembership,
  groupNodeData,
  nodeData,
  relationEdges,
  sourceHandleId,
  tableId,
  targetHandleId,
  type EnumNodeData,
  type RelationEdge,
  type TableNodeData,
} from "./graph";
import { layoutGraph } from "./layout";
import { emptyLayout, type Position } from "./layoutFile";
import {
  edgeStyleVariables,
  projectStyleVariables,
  resolveEnumStyle,
  resolveGroupStyle,
  resolveProjectStyle,
  resolveRelationStyle,
  resolveTableStyle,
  readStyleClasses,
  type ResolvedStyle,
} from "./style";
import { NODE_WIDTH, TableNode, nodeHeight } from "./TableNode";
import { WaypointEdge } from "./WaypointEdge";

const nodeTypes = { table: TableNode, enum: EnumNode, group: GroupNode };
/** The diagram's own edge, for the two routings that turn corners: it threads
 *  the path through corners the user placed. A curve has no corners, so
 *  `bezier` and `straight` stay React Flow's own edges. */
const edgeTypes = { waypoint: WaypointEdge };

const ORIGIN: Position = { x: 0, y: 0 };

/** One entry of the model's own view of the diagram - which kind of node it
 *  is decides both its React Flow `type` and how tall it lays out. */
type NodeEntry =
  | { kind: "table"; data: TableNodeData }
  | { kind: "enum"; data: EnumNodeData };

function entryHeight(entry: NodeEntry): number {
  return entry.kind === "table" ? nodeHeight(entry.data) : enumNodeHeight(entry.data);
}

/** The edges the hovered row highlights - empty for anything but a table
 *  row, and for a row whose own edge never resolved. */
function edgesForHoveredRow(data: Map<string, NodeEntry>, hovered: HoveredRow): RelationEdge[] {
  const entry = data.get(hovered.nodeId);
  return entry && entry.kind === "table" ? (entry.data.rowEdges[hovered.field] ?? []) : [];
}

const EMPTY_HIGHLIGHT = new Set<string>();

/** Everything about a node that the model decides, as opposed to what the
 *  canvas does: selection, measured size and an in-flight drag are not in
 *  here, because a re-analysis must not reset them. */
interface NodeSpec {
  id: string;
  type: "table" | "enum" | "group";
  position: Position;
  data: Record<string, unknown>;
  /** Set only on a box inside a frame, and only on a frame. */
  parentId?: string;
  width?: number;
  height?: number;
  dragHandle?: string;
  style?: CSSProperties;
}

/**
 * A frame must not take the pointer: it covers everything it contains, and
 * a click on the canvas inside one has to reach the canvas. The label puts
 * it back for itself (`styles.css`), which leaves that the only place to
 * select or drag a frame by.
 *
 * It goes on the node rather than in the stylesheet because React Flow
 * writes `pointer-events` inline on the wrapper, and only `node.style` is
 * merged over it.
 */
const FRAME_STYLE: CSSProperties = { pointerEvents: "none" };

/**
 * A node's position in the coordinate system the layout file stores.
 *
 * React Flow works in two: a frame sits at its own corner, and a box inside
 * one sits relative to that corner. The file stores neither - a frame stores
 * its anchor, a member its offset from that anchor, and `groupFrame.ts` is
 * what converts between them.
 */
function storedPosition(node: Node, frames: Map<string, GroupFrame>): Position {
  if (node.type === "group") {
    const frame = frames.get(node.id);
    return frame ? toAnchor(node.position, frame) : node.position;
  }
  const frame = node.parentId ? frames.get(node.parentId) : undefined;
  return frame ? toStoredPosition(node.position, frame) : node.position;
}

/** Takes the marks of someone else's drag back off a node, leaving any
 *  style the node had for its own reasons. */
function withoutOutline(style: CSSProperties | undefined): CSSProperties | undefined {
  if (!style || style.outline === undefined) return style;
  const rest = { ...style };
  delete rest.outline;
  delete rest.borderRadius;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export interface DiagramViewProps {
  /** `null` while the host has no analysis yet - the canvas says so. */
  source: DiagramSource | null;
  preferences: DiagramPreferences;
  host: DiagramHost;
  chrome: DiagramChrome;
  /** Omitted by hosts that do not share the diagram with anyone. */
  presence?: DiagramPresence;
}

function DiagramCanvas({
  source,
  preferences,
  host,
  chrome,
  presence,
}: DiagramViewProps): JSX.Element {
  const { saveLayout, revealLocation } = host;
  const { edgeRouting, snapToGrid, gridSize } = preferences;
  const layout = source?.layout;
  const Toolbar = chrome.Toolbar;
  const publishDrag = presence?.publishDrag;

  const [nodes, setNodes] = useState<Node[]>([]);
  /** Where the auto-layout put boxes the layout file says nothing about, so
   *  a re-analysis does not lay the same ones out again. */
  const autoPlaced = useRef<Record<string, Position>>({});
  /** The same list, readable from a drag handler without making every
   *  handler depend on it. */
  const live = useRef<Node[]>([]);
  /** Ids being dragged right now: their position is the pointer's, not the
   *  model's, until the gesture ends. */
  const dragging = useRef<Set<string>>(new Set());

  /** Where other people are holding boxes at this moment, by node id. */
  const remote = useMemo(() => {
    const held = new Map<string, { position: XYPosition; color: string }>();
    for (const drag of presence?.remoteDrags ?? []) {
      for (const [id, position] of Object.entries(drag.positions)) {
        held.set(id, { position, color: drag.color });
      }
    }
    return held;
  }, [presence?.remoteDrags]);
  // Read by the reconciliation, which must not re-run several times a
  // second just because someone else is moving a box.
  const heldRemotely = useRef(remote);
  heldRemotely.current = remote;

  /** The model's own view of the diagram, rebuilt only when the model or
   *  the stored positions actually change. */
  const model = useMemo(() => {
    if (!source) return null;
    const { model: exported, metas, enumMetas, groupMetas, projectStyles, layout } = source;

    const relations = relationEdges(exported);
    const relationStyles = new Map<string, ResolvedStyle>(
      relations.map((relation) => [relation.id, resolveRelationStyle(projectStyles, relation.file)]),
    );
    const data = new Map<string, NodeEntry>();
    for (const table of exported.tables) {
      const meta = metas[table.file]?.find((m) => m.name === table.name);
      const style = resolveTableStyle(projectStyles, table.file, readStyleClasses(meta?.entries));
      data.set(tableId(table.namespace, table.name), {
        kind: "table",
        data: nodeData(table, style, relations),
      });
    }
    for (const en of exported.enums) {
      const meta = enumMetas[en.file]?.find((m) => m.name === en.name);
      const style = resolveEnumStyle(projectStyles, en.file, readStyleClasses(meta?.entries));
      data.set(enumId(en.namespace, en.name), { kind: "enum", data: enumNodeData(en, style) });
    }

    const frameOf = groupMembership(exported);

    // Source position wins; then one from an earlier pass; only a table or
    // enum seen for the first time is laid out - see layout.ts. What the
    // number *means* depends on group membership: an offset into the frame
    // for a member, an absolute canvas position for everything else.
    const placed = new Map<string, Position>();
    const unplaced: string[] = [];
    for (const table of exported.tables) {
      const id = tableId(table.namespace, table.name);
      const known = layout.nodes[id] ?? autoPlaced.current[id];
      if (known) placed.set(id, known);
      else unplaced.push(id);
    }
    for (const en of exported.enums) {
      const id = enumId(en.namespace, en.name);
      const known = layout.nodes[id] ?? autoPlaced.current[id];
      if (known) placed.set(id, known);
      else unplaced.push(id);
    }

    const anchors = new Map<string, Position>();
    const unplacedGroups: string[] = [];
    for (const group of exported.groups) {
      const id = groupId(group);
      const known = layout.nodes[id] ?? autoPlaced.current[id];
      if (known) anchors.set(id, known);
      else unplacedGroups.push(id);
    }

    if (unplaced.length > 0 || unplacedGroups.length > 0) {
      const computed = layoutGraph({
        ids: [...data.keys()],
        edges: relations,
        sizeOf: (id) => {
          const entry = data.get(id);
          return {
            width: NODE_WIDTH,
            height: entry ? entryHeight(entry) : 120,
          };
        },
        groups: exported.groups.map((group) => ({
          id: groupId(group),
          memberIds: group.members.map(groupMemberId),
        })),
      });
      const fresh: Record<string, Position> = {};
      for (const id of unplacedGroups) {
        const position = computed.get(id) ?? ORIGIN;
        anchors.set(id, position);
        fresh[id] = position;
      }
      for (const id of unplaced) {
        const absolute = computed.get(id) ?? ORIGIN;
        const frame = frameOf.get(id);
        // A member is stored as an offset into its group, measured from the
        // cluster this same pass produced - not from wherever the group's
        // anchor already is, which would drag the whole frame across the
        // canvas every time a table is added to it.
        const cluster = frame ? (computed.get(frame) ?? ORIGIN) : ORIGIN;
        const position = frame
          ? { x: absolute.x - cluster.x, y: absolute.y - cluster.y }
          : absolute;
        placed.set(id, position);
        fresh[id] = position;
      }
      // Kept so the next pass does not lay them out again. Not written to
      // the layout file: `layoutGraph` is deterministic, and a file appearing
      // because a project was merely opened is a surprise, not a decision.
      autoPlaced.current = { ...autoPlaced.current, ...fresh };
    }

    const frames = new Map<string, GroupFrame>();
    const specs: NodeSpec[] = [];
    for (const group of exported.groups) {
      const id = groupId(group);
      const meta = groupMetas[group.file]?.find((m) => m.name === group.name);
      const style = resolveGroupStyle(projectStyles, group.file, readStyleClasses(meta?.entries));
      // A member the diagram draws no box for - a `Partial`, say - takes up
      // no room in the frame, so it simply does not contribute one.
      const boxes = group.members.flatMap((member): MemberBox[] => {
        const memberId = groupMemberId(member);
        const entry = data.get(memberId);
        const at = placed.get(memberId);
        return entry && at ? [{ ...at, width: NODE_WIDTH, height: entryHeight(entry) }] : [];
      });
      const frame = groupFrame(anchors.get(id) ?? ORIGIN, boxes);
      frames.set(id, frame);
      specs.push({
        id,
        type: "group",
        position: frame.position,
        width: frame.width,
        height: frame.height,
        dragHandle: GROUP_DRAG_HANDLE,
        style: FRAME_STYLE,
        data: groupNodeData(group, style, frame) as unknown as Record<string, unknown>,
      });
    }

    // Frames come first: React Flow resolves a child against a parent it has
    // already seen in this list, and warns and gives up on one it has not.
    for (const [id, entry] of data) {
      const frameId = frameOf.get(id);
      const frame = frameId ? frames.get(frameId) : undefined;
      const at = placed.get(id) ?? ORIGIN;
      specs.push({
        id,
        type: entry.kind,
        position: frame ? toChildPosition(at, frame) : at,
        ...(frame && frameId ? { parentId: frameId } : {}),
        data: entry.data as unknown as Record<string, unknown>,
      });
    }

    const positions = new Map(specs.map((spec) => [spec.id, spec.position]));
    return { specs, positions, frames, relations, relationStyles, data };
  }, [source]);

  // Project-wide: the same for every node, so it is resolved once and
  // applied to the canvas itself rather than per element.
  const projectStyle = useMemo(
    () => (source ? projectStyleVariables(resolveProjectStyle(source.projectStyles)) : {}),
    [source],
  );

  // Reconcile the model into the live nodes: content and stored positions
  // come from the model, while selection, measured size and an in-flight
  // drag stay with the node that already exists.
  useEffect(() => {
    if (!model) {
      setNodes([]);
      return;
    }
    setNodes((current) => {
      const existing = new Map(current.map((node) => [node.id, node]));
      const next = model.specs.map((spec) => {
        const previous = existing.get(spec.id);
        // This browser's own gesture first, then anyone else's, then where
        // the model says the box belongs.
        const position =
          previous && dragging.current.has(spec.id)
            ? previous.position
            : (heldRemotely.current.get(spec.id)?.position ?? spec.position);
        const node: Node = { ...previous, ...spec, position };
        // A table dropped from a `Group` has to lose its frame, and `spec`
        // says so by leaving the key out rather than setting it empty.
        if (spec.parentId === undefined) delete node.parentId;
        return node;
      });
      live.current = next;
      return next;
    });
  }, [model]);

  // Someone else's gesture, drawn as it happens. The edges need no part of
  // this: they are computed from wherever the nodes currently are, so they
  // follow a box that is being moved from another browser exactly as they
  // follow one being moved here.
  useEffect(() => {
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const held = remote.get(node.id);
        const outline = held ? `2px solid ${held.color}` : undefined;
        // Where the box belongs once nobody else is holding it: back at
        // the model's own position, so a gesture that ended - or was
        // abandoned - does not leave it wherever the pointer last was.
        const target = held
          ? held.position
          : dragging.current.has(node.id)
            ? node.position
            : (model?.positions.get(node.id) ?? node.position);
        const settled = node.position.x === target.x && node.position.y === target.y;
        if (settled && node.style?.outline === outline) return node;
        changed = true;
        const marked: Node = { ...node, position: target };
        const style = held
          ? { ...node.style, outline: `2px solid ${held.color}`, borderRadius: 10 }
          : withoutOutline(node.style);
        if (style) marked.style = style;
        else delete marked.style;
        return marked;
      });
      if (!changed) return current;
      live.current = next;
      return next;
    });
  }, [remote, model]);

  const saveEdgePoints = useCallback(
    (id: string, points: Position[]) => {
      const base = layout ?? emptyLayout();
      const edges = { ...base.edges };
      if (points.length === 0) delete edges[id];
      else edges[id] = { points };
      saveLayout({ ...base, edges });
    },
    [layout, saveLayout],
  );

  // Hover lives here, apart from `hiddenEdgeIds`/`toggleHidden`: rows only
  // ever get the stable setter through `DiagramInteractionProvider`, so a
  // hover re-renders this component and the edges memo below, never a node.
  const [hoveredRow, setHoveredRow] = useState<HoveredRow | null>(null);

  const hiddenEdgeIds = useMemo(() => new Set(layout?.hiddenEdges ?? []), [layout]);

  const toggleHidden = useCallback(
    (edgeId: string) => {
      const base = layout ?? emptyLayout();
      const hidden = new Set(base.hiddenEdges);
      if (hidden.has(edgeId)) hidden.delete(edgeId);
      else hidden.add(edgeId);
      saveLayout({ ...base, hiddenEdges: [...hidden] });
    },
    [layout, saveLayout],
  );

  const showAllEdges = useCallback(() => {
    saveLayout({ ...(layout ?? emptyLayout()), hiddenEdges: [] });
  }, [layout, saveLayout]);

  // Stale ids (task 104) do not count as "current" hidden edges.
  const hiddenEdgeCount = useMemo(
    () => (model ? model.relations.filter((relation) => hiddenEdgeIds.has(relation.id)).length : 0),
    [model, hiddenEdgeIds],
  );

  const interaction = useMemo(
    () => ({ hiddenEdgeIds, toggleHidden, setHoveredRow, hiddenEdgeCount, showAllEdges }),
    [hiddenEdgeIds, toggleHidden, hiddenEdgeCount, showAllEdges],
  );

  const edges = useMemo((): Edge[] => {
    if (!model) return [];
    const rightAngle = edgeRouting === "step" || edgeRouting === "smoothstep";
    const byId = new Map(nodes.map((node) => [node.id, node]));
    // Sides are decided from where the nodes actually are, so a line always
    // leaves towards the other table instead of looping around its own. A
    // box inside a frame is positioned relative to it, so its own number
    // says nothing about the gap to a box outside - only the sum does.
    const positionOf = (id: string): { x: number } | undefined => {
      const node = byId.get(id);
      if (!node) return undefined;
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      return parent ? { x: node.position.x + parent.position.x } : node.position;
    };
    const highlighted = hoveredRow
      ? new Set(edgesForHoveredRow(model.data, hoveredRow).map((edge) => edge.id))
      : EMPTY_HIGHLIGHT;

    return model.relations.map((relation) => {
      const sides = edgeSides(positionOf(relation.source), positionOf(relation.target), NODE_WIDTH);
      const isHighlighted = highlighted.has(relation.id);
      return {
        id: relation.id,
        source: relation.source,
        target: relation.target,
        // A row's handle when the referenced field is drawn, the node's own
        // otherwise - see `relationEdges`.
        ...(relation.sourceField
          ? { sourceHandle: sourceHandleId(relation.sourceField, sides.source) }
          : {}),
        ...(relation.targetField
          ? { targetHandle: targetHandleId(relation.targetField, sides.target) }
          : {}),
        type: rightAngle ? "waypoint" : edgeRouting,
        label: relation.label,
        className: `${relation.oneToOne ? "edge-one-to-one" : "edge-one-to-many"}${
          isHighlighted ? " is-highlighted" : ""
        }`,
        // A hidden edge is still drawn, never removed, while its row is
        // hovered - `hidden` is a draw flag, not the source of truth.
        hidden: hiddenEdgeIds.has(relation.id) && !isHighlighted,
        animated: isHighlighted,
        ...(isHighlighted ? { zIndex: 1000 } : {}),
        style: {
          ...edgeStyleVariables(model.relationStyles.get(relation.id) ?? {}),
          ...(isHighlighted ? { "--edge-line-color": "var(--sk-edge-highlight, #3b82f6)" } : {}),
        } as CSSProperties,
        data: {
          location: relation.location,
          ...(rightAngle
            ? {
                points: layout?.edges[relation.id]?.points ?? [],
                rounded: edgeRouting === "smoothstep",
                onPoints: (points: Position[]) => saveEdgePoints(relation.id, points),
              }
            : {}),
        },
      };
    });
  }, [model, nodes, edgeRouting, layout, saveEdgePoints, hoveredRow, hiddenEdgeIds]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === "position") {
        if (change.dragging) dragging.current.add(change.id);
        else dragging.current.delete(change.id);
      }
    }
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      live.current = next;
      return next;
    });
  }, []);

  /**
   * Dragging one table of a selection moves the whole selection.
   *
   * React Flow does this on its own only for a box-selection (the gesture
   * that produces its selection rectangle); after picking tables with
   * Shift-click, grabbing one of them would otherwise leave the rest
   * behind. The other members are moved by the same delta here, and their
   * ids are held in `dragging` so the reconciliation does not pull them
   * back to their stored positions mid-gesture.
   */
  const groupDrag = useRef<{ id: string; origin: XYPosition; others: Map<string, XYPosition> } | null>(
    null,
  );

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    const selected = live.current.filter((other) => other.selected);
    // A frame already carries its own members, so a box selected next to the
    // frame it sits in must not be given the same delta a second time.
    const carried = new Set(
      selected.filter((other) => other.type === "group").map((other) => other.id),
    );
    const isCarried = (other: Node): boolean =>
      other.parentId !== undefined && carried.has(other.parentId);

    const others = selected.filter((other) => other.id !== node.id && !isCarried(other));
    if (!node.selected || isCarried(node) || others.length === 0) {
      groupDrag.current = null;
      return;
    }
    for (const other of others) dragging.current.add(other.id);
    groupDrag.current = {
      id: node.id,
      origin: { ...node.position },
      others: new Map(others.map((other) => [other.id, { ...other.position }])),
    };
  }, []);

  const onNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      const group = groupDrag.current;
      if (!group || group.id !== node.id) {
        publishDrag?.({ [node.id]: node.position });
        return;
      }
      const dx = node.position.x - group.origin.x;
      const dy = node.position.y - group.origin.y;
      const moved: Record<string, XYPosition> = { [node.id]: node.position };
      for (const [id, from] of group.others) moved[id] = { x: from.x + dx, y: from.y + dy };

      setNodes((current) => {
        const next = current.map((other) => {
          const to = moved[other.id];
          return to ? { ...other, position: to } : other;
        });
        live.current = next;
        return next;
      });
      publishDrag?.(moved);
    },
    [publishDrag],
  );

  const onSelectionDrag = useCallback(
    (_: unknown, moved: Node[]) => {
      publishDrag?.(Object.fromEntries(moved.map((node) => [node.id, node.position])));
    },
    [publishDrag],
  );

  /**
   * One write per gesture, whether one box was dragged or a whole selection.
   *
   * A frame is one entry however many members it holds: they are stored as
   * offsets from its anchor, and dragging the frame changed only the anchor.
   */
  const persistPositions = useCallback(
    (moved: Node[]) => {
      if (moved.length === 0) return;
      const frames = model?.frames;
      const nodes = { ...(source?.layout.nodes ?? {}) };
      for (const node of moved) {
        dragging.current.delete(node.id);
        nodes[node.id] = frames ? storedPosition(node, frames) : node.position;
      }
      saveLayout({ ...(source?.layout ?? emptyLayout()), nodes });
    },
    [saveLayout, model, source],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      const group = groupDrag.current;
      groupDrag.current = null;
      const alsoMoved = group
        ? live.current.filter((other) => group.others.has(other.id))
        : [];
      persistPositions([node, ...alsoMoved]);
      publishDrag?.(null);
    },
    [persistPositions, publishDrag],
  );

  const onSelectionDragStop = useCallback(
    (_: unknown, moved: Node[]) => {
      persistPositions(moved);
      publishDrag?.(null);
    },
    [persistPositions, publishDrag],
  );

  // Clicking a line goes to where that relationship is written.
  const onEdgeClick = useCallback(
    (_: unknown, edge: Edge) => {
      const location = (edge.data as { location?: Location } | undefined)?.location;
      if (location) revealLocation(location);
    },
    [revealLocation],
  );

  if (!source) return <div className="diagram-empty">Analyzing…</div>;
  if (nodes.length === 0) {
    return (
      <div className="diagram-empty">
        Nothing to show yet. Declare a table:
        <pre>{"Table Customer {\n  id int [pk];\n}"}</pre>
      </div>
    );
  }

  return (
    <DiagramInteractionProvider value={interaction}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        style={projectStyle as CSSProperties}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onSelectionDrag={onSelectionDrag}
        onSelectionDragStop={onSelectionDragStop}
        onEdgeClick={onEdgeClick}
        snapToGrid={snapToGrid}
        snapGrid={[gridSize, gridSize]}
        // Shift-drag on the canvas draws a selection box; Shift/Ctrl-click
        // adds a table to the selection, and a selection drags as one.
        multiSelectionKeyCode={["Shift", "Control", "Meta"]}
        selectionOnDrag={false}
        selectNodesOnDrag={false}
        elevateNodesOnSelect
        fitView
        proOptions={{ hideAttribution: false }}
        minZoom={0.15}
      >
        {Toolbar ? <Toolbar /> : null}
        <Background gap={snapToGrid ? gridSize : 18} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          // The defaults are tuned for a light canvas and render as a grey
          // slab on this one.
          bgColor="var(--sk-surface)"
          maskColor="rgba(20, 22, 28, 0.72)"
          nodeColor="var(--sk-surface-raised)"
          nodeStrokeColor="var(--sk-border)"
        />
      </ReactFlow>
    </DiagramInteractionProvider>
  );
}

export function DiagramView(props: DiagramViewProps): JSX.Element {
  const { host, chrome } = props;
  // Memoized because the nodes React Flow renders read this on every pass;
  // a fresh object per render would re-render every node for nothing.
  const context = useMemo(() => ({ host, chrome }), [host, chrome]);

  return (
    <DiagramContextProvider value={context}>
      <ReactFlowProvider>
        <DiagramCanvas {...props} />
      </ReactFlowProvider>
    </DiagramContextProvider>
  );
}
