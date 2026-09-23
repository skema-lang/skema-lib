/**
 * One field row of a table node.
 *
 * Each row carries its own pair of connection points, so a relationship
 * line meets the column it is actually about rather than the table as a
 * whole. Both sides exist on every row because which one an edge uses
 * depends on where the other table happens to sit on the canvas.
 *
 * The row itself shows only what fits: name, type, one flag. Everything
 * else the model knows is in the hover card.
 *
 * Hovering reports the row through `setHoveredRow`, which is a stable
 * setter from a context of its own (`DiagramInteraction`) - so hovering
 * never re-renders any other row or node, only `DiagramView`'s edges. The
 * eye button, shown only on a declaring FK/`-` row, toggles the same edge
 * through `toggleHidden` and stays visible whenever that edge is hidden, so
 * a hidden line stays findable.
 */
import { Handle, Position } from "@xyflow/react";
import { useState } from "react";
import type { JSX, MouseEvent } from "react";

import type { ExportedField } from "@skema/model";
import { useDiagramChrome, useDiagramInteraction } from "./context";
import { hasFlag } from "./flags";
import { fieldFacts, flagBadges, sourceLabel, typeLabel } from "./details";
import { isBackReference, sourceHandleId, targetHandleId, type RelationEdge } from "./graph";

/** `[pk]`/`[unique]` are what a reader scans for; the rest is in the card. */
function shortFlag(field: ExportedField): string {
  if (hasFlag(field, "pk")) return "PK";
  if (field.relation) return "FK";
  if (hasFlag(field, "unique")) return "U";
  return "";
}

function EyeIcon({ off }: { off: boolean }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      {off ? (
        <path
          fill="currentColor"
          d="M3.3 2.5 2 3.8l3.2 3.2C3.7 8.3 2.5 9.9 2 11c1.7 3.9 5.5 6.5 10 6.5 1.6 0 3.1-.3 4.4-1l3.3 3.3 1.3-1.3ZM12 15c-.4 0-.8-.1-1.2-.2L7 11c0-.1 0-.1 0 0a5 5 0 0 1 5-5c.1 0 .1 0 0 0l1.6 1.6c.3.4.4.9.4 1.4 0 1.7-1.3 3-3 3Zm10-4c-.7-1.6-1.8-3-3.2-4.1l-2 2c1 .8 1.8 1.8 2.4 3-1.4 3.1-4.5 5.1-7.9 5.1-.7 0-1.5-.1-2.1-.3l-1.6 1.6c1.2.4 2.4.7 3.7.7 4.5 0 8.3-2.6 10-6.5Z"
        />
      ) : (
        <path
          fill="currentColor"
          d="M12 5c-4.5 0-8.3 2.6-10 6.5C3.7 15.4 7.5 18 12 18s8.3-2.6 10-6.5C20.3 7.6 16.5 5 12 5Zm0 10.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
        />
      )}
    </svg>
  );
}

export interface TableNodeRowProps {
  field: ExportedField;
  tableFile: string;
  nodeId: string;
  /** This row's own edges - see `edgesOfRow`. Empty for a row with none. */
  edges: RelationEdge[];
  onOpen: (field: ExportedField) => void;
}

export function TableNodeRow({
  field,
  tableFile,
  nodeId,
  edges,
  onOpen,
}: TableNodeRowProps): JSX.Element {
  const { DetailCard } = useDiagramChrome();
  const { hiddenEdgeIds, toggleHidden, setHoveredRow } = useDiagramInteraction();
  const [hovered, setHovered] = useState(false);

  const backReference = isBackReference(field);
  // Only the declaring side owns a switch - the referenced and
  // back-reference rows read the same edge but never toggle it.
  const ownEdge = field.relation && !backReference ? edges[0] : undefined;
  const isHidden = ownEdge ? hiddenEdgeIds.has(ownEdge.id) : false;

  const handlePointerEnter = (): void => {
    setHovered(true);
    setHoveredRow({ nodeId, field: field.name });
  };
  const handlePointerLeave = (): void => {
    setHovered(false);
    // Only clears a hover this same row set, so a fast move to a
    // neighbouring row's own "enter" is never undone by this "leave".
    setHoveredRow((current) =>
      current && current.nodeId === nodeId && current.field === field.name ? null : current,
    );
  };
  const handleToggleHidden = (event: MouseEvent): void => {
    event.stopPropagation();
    if (ownEdge) toggleHidden(ownEdge.id);
  };
  const stopDoubleClick = (event: MouseEvent): void => event.stopPropagation();

  return (
    <DetailCard
      title={field.name}
      subtitle={typeLabel(field)}
      badges={flagBadges(field)}
      facts={fieldFacts(field, tableFile)}
      note={field.note ?? undefined}
      source={sourceLabel(field.location ?? undefined)}
    >
      <li
        className={`table-node__row${hasFlag(field, "pk") ? " is-key" : ""}${
          backReference ? " is-backref" : ""
        }`}
        onDoubleClick={() => onOpen(field)}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <Handle
          type="target"
          position={Position.Left}
          id={targetHandleId(field.name, "left")}
          className="table-node__handle"
        />
        <Handle
          type="source"
          position={Position.Left}
          id={sourceHandleId(field.name, "left")}
          className="table-node__handle"
        />
        <span className="table-node__field">{field.name}</span>
        <span className="table-node__type">
          {backReference ? `has many ${field.relation?.targetTable ?? ""}` : typeLabel(field)}
        </span>
        <span className="table-node__flags">{shortFlag(field)}</span>
        {ownEdge && (hovered || isHidden) ? (
          <button
            type="button"
            className={`table-node__hide nodrag nopan${isHidden ? " is-hidden" : ""}`}
            title={isHidden ? "Show relationship line" : "Hide relationship line"}
            aria-label={isHidden ? "Show relationship line" : "Hide relationship line"}
            onClick={handleToggleHidden}
            onDoubleClick={stopDoubleClick}
          >
            <EyeIcon off={isHidden} />
          </button>
        ) : null}
        <Handle
          type="target"
          position={Position.Right}
          id={targetHandleId(field.name, "right")}
          className="table-node__handle"
        />
        <Handle
          type="source"
          position={Position.Right}
          id={sourceHandleId(field.name, "right")}
          className="table-node__handle"
        />
      </li>
    </DetailCard>
  );
}
