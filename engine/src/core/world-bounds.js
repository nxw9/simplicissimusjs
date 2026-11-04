import { z } from "zod";
const point = z.tuple([z.number().finite(), z.number().finite()]);
export const PlayBoundsSchema = z.object({min: point, max: point}).strict();
export const BOUNDARY_MARGIN = 0.4;
/** Terrain size never creates a movement wall: only explicitly configured bounds do. */
export function worldBounds(world) { return world.playBounds ?? null; }
export function terrainBounds(world) { const h=world.size/2;return {min:[-h,-h],max:[h,h]}; }
export function insideWorld(world,x,z,margin=BOUNDARY_MARGIN) {
  if(!Number.isFinite(x)||!Number.isFinite(z))return false;
  const b=world.playBounds;if(!b)return true;
  return x>=b.min[0]+margin&&x<=b.max[0]-margin&&z>=b.min[1]+margin&&z<=b.max[1]-margin;
}
export function validateWorldBounds(world) {
  if(!world.playBounds)return;
  const b=world.playBounds,h=world.size/2;
  for(let i=0;i<2;i++) {
    if(b.max[i]-b.min[i]<2)throw Error("Границы: ширина и глубина доступной области должны быть не меньше 2 м.");
    if(b.min[i]<-h || b.max[i]>h)throw Error("Граница игрока выходит за рельеф. Сначала расширьте карту.");
  }
  if(!insideWorld(world,world.spawn[0],world.spawn[2]))throw Error("Точка старта игрока должна находиться внутри доступной области, минимум в 0,4 м от границы.");
}
