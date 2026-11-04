import { createTerrain } from "./terrain.js";
import { readProject } from "./project.js";

export const MAX_TERRAIN_RESOLUTION = 1024;
export function expansionLimit(world) {
  const n = world.terrain?.resolution ?? 128, step = world.size/n;
  const cells = Math.min(MAX_TERRAIN_RESOLUTION, Math.floor(2000/step));
  return (cells - ((cells-n)%2)) * step;
}
/** Adding whole rows around the origin preserves every old vertex and triangle. */
export function expansionPlan(world, requestedSize) {
  const n = world.terrain?.resolution ?? 128, step = world.size/n;
  if (!Number.isFinite(requestedSize) || requestedSize <= world.size) throw Error("Новый размер должен быть больше текущего.");
  const margin = Math.max(1,Math.ceil((requestedSize-world.size)/(2*step)-1e-9)), resolution = n + 2*margin, size = resolution*step;
  if (resolution > MAX_TERRAIN_RESOLUTION || size > 2000+1e-7) throw Error(`Для этой карты предел расширения с сохранением рельефа — ${expansionLimit(world).toFixed(2)} м.`);
  return {size, resolution, margin, step, addedPerSide:margin*step, oldSize:world.size};
}
export function expandWorld(project, {size, fill = "land", height = 0, material = 1}) {
  const plan = expansionPlan(project.world,size);
  if (!["land","water","edge"].includes(fill) || !Number.isFinite(height) || height < -80 || height > 80 || !Number.isInteger(material) || material<0 || material>4) throw Error("Некорректные параметры новой территории.");
  const next = structuredClone(project), source = project.world.terrain ?? createTerrain(), n = source.resolution, N=plan.resolution, s=n+1, stride=N+1, m=plan.margin;
  const heights = new Array(stride**2), paint = new Array(stride**2), fadeWidth=Math.min(m,8);
  for(let z=0;z<=N;z++) for(let x=0;x<=N;x++) {
    const sx=Math.max(0,Math.min(n,x-m)),sz=Math.max(0,Math.min(n,z-m)),old=sz*s+sx,index=z*stride+x;
    const distance=Math.max(m-x,m-z,x-m-n,z-m-n,0);
    if(distance===0) {heights[index]=source.heights[old];paint[index]=source.paint?.[old]??0;}
    else {
      const t=Math.min(1,distance/fadeWidth),blend=t*t*(3-2*t);
      heights[index]=fill==="edge"?source.heights[old]:source.heights[old]+(height-source.heights[old])*blend;
      paint[index]=fill==="edge"?(source.paint?.[old]??0):material;
    }
  }
  next.world.size=plan.size;
  // Play boundaries are authored only in Boundary settings, never by terrain expansion.
  next.world.terrain={resolution:N,heights,paint,regions:structuredClone(source.regions)};
  // A full-world editing region is separate from authored event and quest regions.
  const regions=next.world.terrain.regions,half=plan.size/2;
  let region=regions.find(r=>r.name==="Основная карта · вся территория" && r.min[0]===-project.world.size/2 && r.min[1]===-project.world.size/2 && r.max[0]===project.world.size/2 && r.max[1]===project.world.size/2 && r.id!==next.world.moonLand?.regionId);
  if(region) {region.min=[-half,-half];region.max=[half,half];}
  else if(regions.length<128) {
    const id=crypto.randomUUID();regions.push({id,name:"Основная карта · вся территория",min:[-half,-half],max:[half,half]});region=regions.at(-1);
  }
  return {project:readProject(next),plan,regionId:region?.id??null};
}
