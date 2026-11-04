import { insideWorld } from "./world-bounds.js";
import { heightAt, EYE_HEIGHT } from "./terrain.js";
export const GRAVITY = 20,
  JUMP_SPEED = 7;
const RADIUS = 0.32,
  EPS = 1e-5;
const overlaps = (b, x, z) =>
  x > b.min.x - RADIUS &&
  x < b.max.x + RADIUS &&
  z > b.min.z - RADIUS &&
  z < b.max.z + RADIUS;
/** Static AABB collisions, same conservative bounds as editor props. Position is eye height. */
export function moveCharacter(
  world,
  position,
  dx,
  dz,
  dt,
  state,
  boxes = [],
  jump = false,
) {
  let [x, y, z] = position,
    feet = y - EYE_HEIGHT;
  state.velocity ??= 0;
  state.grounded ??= true;
  const support = (px, pz, at) => {
    let floor = heightAt(world, px, pz);
    for (const b of boxes)
      if (overlaps(b, px, pz) && b.max.y <= at + 0.025)
        floor = Math.max(floor, b.max.y);
    return floor;
  };
  state.grounded =
    state.grounded && Math.abs(feet - support(x, z, feet)) < 0.03;
  if (jump && state.grounded) {
    state.velocity = JUMP_SPEED;
    state.grounded = false;
  }
  const steps = Math.max(
      1,
      Math.ceil(dt / (1 / 120)),
      Math.ceil(Math.hypot(dx, dz) / 0.08),
    ),
    h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const move = (nx, nz) => {
      if (
        !insideWorld(world, nx, nz)
      )
        return;
      const terrain = heightAt(world, nx, nz),
        distance = Math.hypot(nx - x, nz - z);
      let nextFeet = feet;
      if (state.grounded) {
        const rise = terrain - feet;
        if (rise > Math.tan((50 * Math.PI) / 180) * distance + EPS) return;
        if (rise > 0) nextFeet = terrain;
        const floor = support(nx, nz, nextFeet);
        if (
          nextFeet - floor <=
          Math.tan((50 * Math.PI) / 180) * distance + 0.005
        )
          nextFeet = floor;
      } else if (terrain > feet + EPS) return;
      if (
        boxes.some(
          (b) =>
            overlaps(b, nx, nz) &&
            b.max.y > nextFeet + EPS &&
            b.min.y < nextFeet + EYE_HEIGHT - EPS,
        )
      )
        return;
      x = nx;
      z = nz;
      feet = nextFeet;
    };
    move(x + dx / steps, z);
    move(x, z + dz / steps);
    const previous = feet;
    let next = feet + state.velocity * h - 0.5 * GRAVITY * h * h;
    state.velocity -= GRAVITY * h;
    state.grounded = false;
    if (next > previous) {
      for (const b of boxes)
        if (
          overlaps(b, x, z) &&
          previous + EYE_HEIGHT <= b.min.y + EPS &&
          next + EYE_HEIGHT >= b.min.y
        ) {
          next = Math.min(next, b.min.y - EYE_HEIGHT);
          state.velocity = 0;
        }
    } else {
      let floor = heightAt(world, x, z);
      for (const b of boxes)
        if (
          overlaps(b, x, z) &&
          b.max.y <= previous + EPS &&
          b.max.y >= next - EPS
        )
          floor = Math.max(floor, b.max.y);
      if (next <= floor) {
        next = floor;
        state.velocity = 0;
        state.grounded = true;
      }
    }
    feet = next;
  }
  return [x, feet + EYE_HEIGHT, z];
}
