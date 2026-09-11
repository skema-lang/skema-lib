/**
 * Right-angle routing through waypoints the user placed.
 *
 * React Flow's own `step` routing produces exactly one corner, at the
 * midpoint, which is why lines between two columns of tables all turn in
 * the same place. This takes a list of waypoints instead and threads an
 * axis-aligned path through them, the way a diagram editor does.
 *
 * Waypoints are absolute canvas coordinates: a corner stays where it was
 * put, rather than sliding when a table elsewhere moves.
 */
import type { Position } from "./layoutFile";

/** How far a line leaves a handle before it may turn, so it never starts
 *  its first corner flush against the box. */
const HANDLE_GAP = 20;

export type Axis = "x" | "y";

export interface RouteEnds {
  source: Position;
  /** Unit vector the line leaves the source handle along. */
  sourceDir: Position;
  target: Position;
  /** Unit vector the line arrives at the target handle along. */
  targetDir: Position;
}

const other = (axis: Axis): Axis => (axis === "x" ? "y" : "x");

export interface Route {
  /** The corners the line passes through, both ends included. Every
   *  consecutive pair shares an x or a y. */
  points: Position[];
  /** Where each waypoint ended up in `points`, so a handle knows which
   *  stored point it moves and a segment knows where a new one belongs. */
  waypointIndex: number[];
}

/** Just the corners - see `route` when the waypoints have to be identified. */
export function orthogonalRoute(ends: RouteEnds, waypoints: Position[]): Position[] {
  return route(ends, waypoints).points;
}

/**
 * Every consecutive pair of `points` shares an x or a y, so the result is
 * drawable with nothing but horizontal and vertical segments.
 */
export function route(ends: RouteEnds, waypoints: Position[]): Route {
  const { source, sourceDir, target, targetDir } = ends;
  const exit = { x: source.x + sourceDir.x * HANDLE_GAP, y: source.y + sourceDir.y * HANDLE_GAP };
  const entry = { x: target.x + targetDir.x * HANDLE_GAP, y: target.y + targetDir.y * HANDLE_GAP };

  // `fixed` marks what the user put there. Corners this function invents to
  // get between two stops may be pruned again; a waypoint may not, even when
  // honouring it doubles the line back over itself - dropping it would leave
  // a stored point with no corner and no handle to grab.
  const points: Stop[] = [
    { at: source, fixed: true },
    { at: exit, fixed: false },
  ];
  // Which way the line is travelling as it reaches the point just pushed.
  let axis: Axis = sourceDir.x !== 0 ? "x" : "y";
  let heading = axis === "x" ? sourceDir.x : sourceDir.y;

  for (const [index, stop] of [...waypoints, entry].entries()) {
    const from = (points[points.length - 1] as Stop).at;
    if (from.x !== stop.x && from.y !== stop.y) {
      // Carrying straight on is only right while the stop is still ahead of
      // us; behind us it would double the line back, so turn first instead.
      const ahead = (stop[axis] - from[axis]) * heading > 0;
      const turn = ahead ? axis : other(axis);
      const corner = turn === "x" ? { x: stop.x, y: from.y } : { x: from.x, y: stop.y };
      points.push({ at: corner, fixed: false });
    }
    points.push({
      at: stop,
      fixed: index < waypoints.length,
      ...(index < waypoints.length ? { waypoint: index } : {}),
    });

    const last = (points[points.length - 2] as Stop).at;
    axis = last.x !== stop.x ? "x" : "y";
    heading = axis === "x" ? Math.sign(stop.x - last.x) : Math.sign(stop.y - last.y);
  }

  // `entry` and `target` differ on the handle's axis alone, so the last
  // segment is already square with the box.
  points.push({ at: target, fixed: true });
  return prune(points);
}

interface Stop {
  at: Position;
  fixed: boolean;
  /** Set on a stop the user placed, holding its index in `waypoints`. */
  waypoint?: number;
}

/** Drops points that add no corner: repeats, and anything sitting in the
 *  middle of a straight run. Both ends are kept. */
export function simplify(points: Position[]): Position[] {
  return prune(
    points.map((at, index) => ({ at, fixed: index === 0 || index === points.length - 1 })),
  ).points;
}

function prune(stops: Stop[]): Route {
  const kept: Stop[] = [];
  for (const stop of stops) {
    const last = kept[kept.length - 1];
    if (last && last.at.x === stop.at.x && last.at.y === stop.at.y) {
      if (stop.fixed) kept[kept.length - 1] = stop;
      continue;
    }
    kept.push(stop);
  }
  for (let i = kept.length - 2; i > 0; i -= 1) {
    const at = kept[i] as Stop;
    if (at.fixed) continue;
    const before = (kept[i - 1] as Stop).at;
    const after = (kept[i + 1] as Stop).at;
    const straight =
      (before.x === at.at.x && at.at.x === after.x) || (before.y === at.at.y && at.at.y === after.y);
    if (straight) kept.splice(i, 1);
  }
  const waypointIndex: number[] = [];
  kept.forEach((stop, index) => {
    if (stop.waypoint !== undefined) waypointIndex[stop.waypoint] = index;
  });
  return { points: kept.map((stop) => stop.at), waypointIndex };
}

/** An SVG path through the corners, rounded by `radius` where they turn. */
export function routePath(points: Position[], radius = 0): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M ${first.x},${first.y}`;

  let path = `M ${first.x},${first.y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const before = points[i - 1] as Position;
    const corner = points[i] as Position;
    const after = points[i + 1] as Position;
    const size = Math.min(
      radius,
      distance(before, corner) / 2,
      distance(corner, after) / 2,
    );
    if (size <= 0) {
      path += ` L ${corner.x},${corner.y}`;
      continue;
    }
    const start = towards(corner, before, size);
    const end = towards(corner, after, size);
    path += ` L ${start.x},${start.y} Q ${corner.x},${corner.y} ${end.x},${end.y}`;
  }
  const last = points[points.length - 1] as Position;
  return `${path} L ${last.x},${last.y}`;
}

/** Which way a segment runs, for picking a cursor and a drag axis. */
export function segmentAxis(a: Position, b: Position): Axis | undefined {
  if (a.x === b.x && a.y !== b.y) return "y";
  if (a.y === b.y && a.x !== b.x) return "x";
  return undefined;
}

function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function towards(from: Position, to: Position, length: number): Position {
  const span = distance(from, to);
  if (span === 0) return from;
  return {
    x: from.x + ((to.x - from.x) / span) * length,
    y: from.y + ((to.y - from.y) / span) * length,
  };
}
