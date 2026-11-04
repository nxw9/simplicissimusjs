import { createEntity } from "./project.js";
import { heightAt } from "./terrain.js";

export const WALL_SEGMENT_LIMIT = 512;
export const WALL_POINT_LIMIT = 2048;
export const DEFAULT_WALL = Object.freeze({
  model: "castle", width: 2, height: 4, straight: false,
  lockAngle: false, angle: 0,
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
export function wallOptions(options = {}) {
  return {
    ...options,
    width: clamp(finite(options.width, 2), .25, 30),
    height: clamp(finite(options.height, 4), .5, 40),
    angle: ((finite(options.angle, 0) % 360) + 360) % 360,
  };
}

/** Clip from a valid start, preserving the selected bearing at the map edge. */
export function wallEnd(world, start, cursor, options) {
  const o = wallOptions(options), half = Math.max(0, world.size / 2 - o.width / 2 - .05);
  let dx = cursor[0] - start[0], dz = cursor[1] - start[1];
  if (o.straight && o.lockAngle) {
    const a = o.angle * Math.PI / 180, x = Math.cos(a), z = Math.sin(a);
    const distance = dx * x + dz * z;
    dx = x * distance; dz = z * distance;
  }
  let t = 1;
  for (const [p, d] of [[start[0], dx], [start[1], dz]]) {
    if (d > 0) t = Math.min(t, (half - p) / d);
    if (d < 0) t = Math.min(t, (-half - p) / d);
  }
  t = clamp(t, 0, 1);
  return [start[0] + dx * t, start[1] + dz * t];
}
export function validWallStart(world, point, options) {
  const half = world.size / 2 - wallOptions(options).width / 2 - .05;
  return point?.every(n => Number.isFinite(n) && Math.abs(n) <= half);
}

// Remove pointer jitter without cutting across deliberate turns or closed paths.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop(), a = points[first], b = points[last];
    const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
    let furthest = -1, maximum = tolerance * tolerance;
    for (let i = first + 1; i < last; i++) {
      const p = points[i], t = length2 ? clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length2, 0, 1) : 0;
      const d = (p[0]-a[0]-dx*t)**2 + (p[1]-a[1]-dz*t)**2;
      if (d > maximum) {maximum = d; furthest = i;}
    }
    if (furthest >= 0) {keep.add(furthest); stack.push([first, furthest], [furthest, last]);}
  }
  return [...keep].sort((a,b) => a-b).map(i => points[i]);
}

/** Pure preview plan. Width is the brush diameter, height is independent. */
export function planWall(world, path, settings = {}, budget = WALL_SEGMENT_LIMIT) {
  const o = wallOptions(settings), segments = [];
  const limit = clamp(Math.floor(budget), 0, WALL_SEGMENT_LIMIT);
  if (!path.length || !validWallStart(world, path[0], o)) return {segments, limited: false};
  let points = o.straight
    ? [path[0], wallEnd(world, path[0], path.at(-1), o)]
    : simplify(path, Math.max(.025, o.width * .06));
  const moduleLength = clamp(o.height * (o.model === "castle" ? 2.1 : 1.5), 1, 12);
  if (points.length === 1 || points.every(p => Math.hypot(p[0]-points[0][0], p[1]-points[0][1]) < .05)) {
    const p = points[0], a = o.angle * Math.PI / 180;
    const delta = [Math.cos(a) * moduleLength / 2, Math.sin(a) * moduleLength / 2];
    points = [-1, 1].map(sign => wallEnd(world, p, [p[0]+sign*delta[0], p[1]+sign*delta[1]], {...o, lockAngle:false}));
  }
  for (let edge = 1; edge < points.length; edge++) {
    const a = points[edge-1], b = points[edge], dx = b[0]-a[0], dz = b[1]-a[1];
    const distance = Math.hypot(dx,dz);
    if (distance < .01) continue;
    const angle = Math.atan2(dz,dx), count = Math.ceil(distance/moduleLength), stride = distance/count;
    const ux = dx/distance, uz = dz/distance;
    for (let i = 0; i < count; i++) {
      if (segments.length >= limit) return {segments, limited:true};
      // The imported model has uneven ends: overlap them beyond the outer
      // battlements so there are no cracks in the body of the wall.
      const seam = o.model === "castle" ? Math.max(.02,stride*.045) : .02;
      const before = i === 0 ? (edge > 1 ? o.width/2 + seam : 0) : seam;
      const after = i === count-1 ? (edge < points.length-1 ? o.width/2 + seam : 0) : seam;
      const length = stride + before + after, offset = stride*(i+.5)+(after-before)/2;
      const x = a[0]+ux*offset, z = a[1]+uz*offset;
      let low = Infinity, high = -Infinity;
      const step = world.size / (world.terrain?.resolution ?? 128);
      const along = clamp(Math.ceil(length/step), 2, 32), across = clamp(Math.ceil(o.width/step), 2, 8);
      for (let u = 0; u <= along; u++) for (let v = 0; v <= across; v++) {
        const forward = (u/along-.5)*length, side = (v/across-.5)*o.width;
        const y = heightAt(world,x+ux*forward-uz*side,z+uz*forward+ux*side);
        low = Math.min(low,y); high = Math.max(high,y);
      }
      segments.push({x,z,base:low-.04,length,width:o.width,height:o.height+high-low+.04,angle});
    }
  }
  return {segments, limited:false};
}

/** Asset and all sections enter the project in the same undoable transaction. */
export function appendWall(project, plan, settings) {
  if (!plan.segments.length) return null;
  if (project.entities.length + plan.segments.length > 20000) throw Error("На карте уже слишком много объектов. Удалите лишние секции.");
  const next = structuredClone(project);
  let assetId;
  if (settings.model === "castle") {
    if (!settings.asset) throw Error("Модель замковой стены недоступна.");
    let asset = next.assets.find(a => a.data === settings.asset.data);
    if (!asset) {
      if (next.assets.length >= 200) throw Error("Достигнут лимит моделей проекта (200).");
      asset = {...settings.asset};
      if (next.assets.some(a => a.id === asset.id)) asset.id = crypto.randomUUID();
      next.assets.push(asset);
    }
    assetId = asset.id;
  }
  for (const s of plan.segments) {
    const e = createEntity("prop", assetId ? "model" : "box");
    e.name = assetId ? "Замковая стена" : "Каменная стена";
    e.position = [s.x, s.base + (assetId ? 0 : s.height/2), s.z];
    e.rotation = [0,-s.angle || 0,0];
    e.scale = [s.length,s.height,s.width];
    e.color = "#ffffff"; e.environment = true; e.collision = "wall";
    if (assetId) e.assetId = assetId;
    else e.surface = 3;
    next.entities.push(e);
  }
  return next;
}
