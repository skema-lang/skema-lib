/**
 * A right-angle connection whose corners the user can place.
 *
 * Dragging a corner moves it; dragging the dot in the middle of a segment
 * adds one there; double-clicking a corner takes it away again. A gesture
 * is held in local state and written back once, on release, so moving a
 * corner is one edit rather than one per animation frame.
 */
import { memo, useCallback, useRef, useState } from "react";
import type { JSX, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { BaseEdge, Position as HandleSide, useReactFlow, type EdgeProps } from "@xyflow/react";

import type { Position } from "./layoutFile";
import { route, routePath, segmentAxis } from "./route";

const CORNER_RADIUS = 5;
/** Big enough to grab, small enough not to bury a short segment. */
const HANDLE_RADIUS = 4.5;
/** A segment shorter than this has no room to offer a new corner. */
const MIN_SEGMENT = 26;

const DIRECTION: Record<HandleSide, Position> = {
  [HandleSide.Left]: { x: -1, y: 0 },
  [HandleSide.Right]: { x: 1, y: 0 },
  [HandleSide.Top]: { x: 0, y: -1 },
  [HandleSide.Bottom]: { x: 0, y: 1 },
};

export interface WaypointEdgeData {
  /** The corners this line was given, in the order it passes through them. */
  points?: Position[];
  /** `smoothstep` rounds its corners, `step` does not. */
  rounded?: boolean;
  /** Reports the corners after a gesture. */
  onPoints?: (points: Position[]) => void;
  [key: string]: unknown;
}

export const WaypointEdge = memo(function WaypointEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  selected,
  type: _type,
  source: _source,
  target: _target,
  sourceHandleId: _sourceHandleId,
  targetHandleId: _targetHandleId,
  animated: _animated,
  selectable: _selectable,
  deletable: _deletable,
  pathOptions: _pathOptions,
  ...edge
}: EdgeProps): JSX.Element {
  const { screenToFlowPosition } = useReactFlow();
  const { points: stored, rounded, onPoints } = (data ?? {}) as WaypointEdgeData;

  /** The corners as the pointer currently has them, for the length of a drag. */
  const [held, setHeld] = useState<Position[] | null>(null);
  const dragging = useRef<number | null>(null);

  const waypoints = held ?? stored ?? [];
  const { points, waypointIndex } = route(
    {
      source: { x: sourceX, y: sourceY },
      sourceDir: DIRECTION[sourcePosition],
      target: { x: targetX, y: targetY },
      targetDir: DIRECTION[targetPosition],
    },
    waypoints,
  );

  const moveTo = useCallback(
    (event: ReactPointerEvent<SVGElement>, index: number, from: Position[]) => {
      const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const next = [...from];
      next[index] = { x: Math.round(at.x), y: Math.round(at.y) };
      setHeld(next);
    },
    [screenToFlowPosition],
  );

  const grab = useCallback((event: ReactPointerEvent<SVGElement>, index: number) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = index;
  }, []);

  const onCornerDown = useCallback(
    (event: ReactPointerEvent<SVGElement>, index: number) => {
      if (event.button !== 0) return;
      setHeld(waypoints);
      grab(event, index);
    },
    [grab, waypoints],
  );

  /** A new corner where the segment was grabbed, then dragged straight away -
   *  so adding and placing one is a single gesture. */
  const onSegmentDown = useCallback(
    (event: ReactPointerEvent<SVGElement>, before: number, at: Position) => {
      if (event.button !== 0) return;
      const next = [...waypoints];
      next.splice(before, 0, at);
      setHeld(next);
      grab(event, before);
    },
    [grab, waypoints],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGElement>) => {
      const index = dragging.current;
      if (index === null || held === null) return;
      moveTo(event, index, held);
    },
    [held, moveTo],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<SVGElement>) => {
      if (dragging.current === null) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragging.current = null;
      if (held) onPoints?.(held);
      setHeld(null);
    },
    [held, onPoints],
  );

  const onCornerDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGElement>, index: number) => {
      event.stopPropagation();
      setHeld(null);
      onPoints?.(waypoints.filter((_, at) => at !== index));
    },
    [onPoints, waypoints],
  );

  const active = held !== null || selected === true;

  return (
    <>
      <BaseEdge id={id} path={routePath(points, rounded ? CORNER_RADIUS : 0)} {...edge} />

      {waypointIndex.map((pointIndex, index) => {
        const at = points[pointIndex];
        if (!at) return null;
        return (
          <circle
            key={`corner-${index}`}
            className={`edge-corner${active ? " is-active" : ""}`}
            cx={at.x}
            cy={at.y}
            r={HANDLE_RADIUS}
            onPointerDown={(event) => onCornerDown(event, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={(event) => onCornerDoubleClick(event, index)}
            onClick={(event) => event.stopPropagation()}
          >
            <title>Drag to move this corner; double-click to remove it</title>
          </circle>
        );
      })}

      {points.slice(0, -1).map((from, index) => {
        const to = points[index + 1];
        if (!to) return null;
        const axis = segmentAxis(from, to);
        if (!axis) return null;
        const length = Math.abs(axis === "x" ? to.x - from.x : to.y - from.y);
        if (length < MIN_SEGMENT) return null;
        // A new corner belongs after every waypoint the line has already
        // passed through by this point.
        const before = waypointIndex.filter((pointIndex) => pointIndex <= index).length;
        const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        return (
          <circle
            key={`add-${index}`}
            className="edge-corner-add"
            cx={middle.x}
            cy={middle.y}
            r={HANDLE_RADIUS}
            onPointerDown={(event) => onSegmentDown(event, before, middle)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(event) => event.stopPropagation()}
          >
            <title>Drag to add a corner here</title>
          </circle>
        );
      })}
    </>
  );
});
