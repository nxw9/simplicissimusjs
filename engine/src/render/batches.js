import { moonBound } from "../core/moon-land.js";
import { Group, InstancedMesh } from "three";
import {qualityProfile} from "../core/quality.js";
export function batchProps(root, objects, entities, world = {}) {
  const sources = new Group();
  sources.visible = false;
  // Detached sources retain exact picking geometry without per-frame traversal.
  const groups = new Map(),
    refs = new Map(),
    batches = [];
  for (const e of entities) {
    if (
      e.kind !== "prop" ||
      (e.shape === "model" && !(e.environment && e.collision === "wall")) ||
      e.motion ||
      e.moonDoor ||
      e.book || moonBound(e, world)
    )
      continue;
    const o = objects.get(e.id);
    // Imported wall sections can share geometry/textures. Animated or complex
    // model materials retain the ordinary renderer path.
    if (e.shape === "model") {
      let supported = true;
      o.traverse(m => {if (m.isMesh && (m.isSkinnedMesh || m.morphTargetInfluences?.length || Array.isArray(m.material))) supported = false;});
      if (!supported) continue;
    }
    sources.add(o);
    o.updateMatrixWorld(true);
    o.traverse((m) => {
      if (!m.isMesh) return;
      const key = JSON.stringify([
        Math.floor(e.position[0]/64),Math.floor(e.position[2]/64),
        e.shape === "model" ? [m.geometry.uuid, m.material.uuid] : null,
        m.geometry.userData.natureKey,
        m.geometry.type,
        m.geometry.parameters,
        m.material.roughness,
        m.material.flatShading,
        m.material.map?.uuid,
        e.surface && e.surface!==3 ? e.scale : null,
      ]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ id: e.id, m });
    });
  }
  for (const entries of groups.values()) {
    const material = entries[0].m.material.clone();
    material.onBeforeCompile=entries[0].m.material.onBeforeCompile;
    material.customProgramCacheKey=entries[0].m.material.customProgramCacheKey;
    material.color.set(0xffffff);
    const batch = new InstancedMesh(
      entries[0].m.geometry,
      material,
      entries.length,
    );
    batch.castShadow = true;
    batch.customDepthMaterial=entries[0].m.customDepthMaterial;
    batch.receiveShadow = true;
    batch.frustumCulled = true;
    batch.lodGeometries=entries[0].m.lodGeometries;
    batch.matrixAutoUpdate=false;
    root.add(batch);
    batches.push(batch);
    entries.forEach(({ id, m }, index) => {
      batch.setMatrixAt(index, m.matrixWorld);
      batch.setColorAt(index, m.material.color);
      if (!refs.has(id)) refs.set(id, []);
      refs.get(id).push({ batch, index, m });
    });
    batch.computeBoundingSphere();if(batch.boundingSphere)batch.boundingSphere.radius+=.6;
  }
  return { refs, batches, sources };
}
export function updateBatch(state, id) {updateBatches(state,[id]);}
export function updateBatches(state, ids) {
  if(state)state.quality=null;
  const changed=new Set();
  for(const id of ids) for(const {batch,index,m} of state?.refs.get(id)??[]) {
    m.updateWorldMatrix(true,false);batch.setMatrixAt(index,m.matrixWorld);batch.instanceMatrix.needsUpdate=true;changed.add(batch);
  }
  for(const batch of changed){const geometry=batch.geometry;batch.geometry=batch.lodGeometries?.[0]??geometry;batch.computeBoundingSphere();batch.boundingSphere.radius+=.6;batch.geometry=geometry;}
}

export function updateBatchLOD(state,camera,quality="balanced",overview=false){
 if(!state)return;const p=qualityProfile(quality),x=camera.position.x,z=camera.position.z;
 if(state.overview===overview&&state.quality===quality&&Math.hypot(x-state.x,z-state.z)<2)return;state.overview=overview;state.quality=quality;state.x=x;state.z=z;
 for(const b of state.batches){const c=b.boundingSphere,d=Math.max(0,Math.hypot(c.center.x-x,c.center.z-z)-c.radius);b.visible=overview||d<p.viewDistance;if(b.lodGeometries)b.geometry=b.lodGeometries[d<p.treeNear?0:d<p.treeMid?1:2];b.castShadow=p.shadowSize>0&&d<90;}
}
