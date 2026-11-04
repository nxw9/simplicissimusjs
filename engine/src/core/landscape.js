import { z } from "zod";

export const SPECIES = {
  oak: "Дуб", hornbeam: "Граб", chestnut: "Каштан",
  stonePine: "Сосна пиния", laurel: "Лавр", arbutus: "Земляничное дерево",
};
export const VegetationSchema = z.object({
  species: z.enum(Object.keys(SPECIES)),
  seed: z.number().int().min(0).max(2147483647),
}).strict();
export const LANDSCAPE_DEFAULTS = {
  enabled: true, seed: 712, density: 0.55, wind: 0.65, haze: 0.45,
};
export const LandscapeSchema = z.object({
  enabled: z.boolean(), seed: z.number().int().min(0).max(2147483647),
  density: z.number().min(0).max(1), wind: z.number().min(0).max(2),
  haze: z.number().min(0).max(1),
}).strict();
export function randomSeed(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export function hashString(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z),
    u = smoothstep(0, 1, x - ix), v = smoothstep(0, 1, z - iz);
  const h = (a, b) => {
    let n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  return (h(ix, iz) * (1-u) + h(ix+1, iz)*u)*(1-v)
    + (h(ix, iz+1)*(1-u)+h(ix+1, iz+1)*u)*v;
}
export function fbm(x, z, octaves = 4) {
  let sum = 0, amp = .5, scale = 1;
  for (let i=0;i<octaves;i++) {
    sum += noise2(x*scale+17*i,z*scale-11*i)*amp;
    scale *= 2.03; amp *= .5;
  }
  return sum;
}
/** Closest point and interpolated elevation on a polyline [x,z,height]. */
export function pathSample(points, x, z) {
  let best = { distance: Infinity, height: 0, segment: 0, t: 0 };
  for (let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    const distance=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
    if(distance<best.distance)best={distance,height:a[2]+(b[2]-a[2])*t,segment:i-1,t};
  }
  return best;
}
