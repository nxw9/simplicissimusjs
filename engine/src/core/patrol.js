import { z } from "zod";
export const PATROL_LIMIT = 128;
export const PatrolSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["loop", "pingpong", "once"]),
  pause: z.number().finite().min(0).max(60),
  points: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(2).max(PATROL_LIMIT),
}).strict();

/** Runtime cursor is separate from authored route. Combat suspends, then resumes it. */
export function patrolDestination(route, state, position, dt) {
  if (!route?.enabled || route.points.length < 2 || state.done) return null;
  state.index ??= 0;
  state.direction ??= 1;
  const point = route.points[state.index];
  if (Math.hypot(point[0]-position.x, point[1]-position.z) > .3) return point;
  state.wait ??= route.pause;
  state.wait = Math.max(0, state.wait-Math.max(0,dt));
  if (state.wait > 1e-8) return null;
  delete state.wait;
  if (route.mode === "once" && state.index === route.points.length-1) {
    state.done = true;
    return null;
  }
  if (route.mode === "pingpong" && (state.index === route.points.length-1 || (state.index === 0 && state.direction < 0))) state.direction *= -1;
  state.index = (state.index + state.direction + route.points.length) % route.points.length;
  return route.points[state.index];
}
