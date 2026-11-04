import { insideWorld } from "../core/world-bounds.js";
import { SelectionOutline } from "./selection-outline.js";
import {QUALITY_OPTIONS,qualityProfile,qualityPixelRatio} from "../core/quality.js";
import {TerrainLOD} from "./terrain-lod.js";
import { mountVisual } from "./mount.js";
import { attachHeldWeapon } from "./held-weapon.js";
import { vegetationObject, rockObject, natureTime, natureWind } from "./nature.js";
import { groundcover, coverDistance } from "./groundcover.js";
import { waterObjects } from "./rpg.js";
import {
  materialTexture,
  groundMaterial,
  blockUV,
  materialListeners,
  masonryMaterial,
} from "./materials.js";
import { entityColliders, refreshBounds, ColliderIndex } from "./colliders.js";
import * as T from "three";
import { DayNight } from "./day-night.js";
import { humanoid } from "./humanoid.js";
import { enemyConfig } from "../core/enemy.js";
import { terrainHit } from "./terrain-ray.js";
import { batchProps, updateBatch, updateBatches, updateBatchLOD } from "./batches.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import { terrainGeometry, updateSurface } from "./surface.js";
import { heightAt, groundPosition } from "../core/terrain.js";
import { decodeGLB } from "../core/assets.js";
export async function parseGLB(data) {
  return new GLTFLoader().parseAsync(decodeGLB(data), "");
}
function dispose(root) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry) geometries.add(o.geometry);
    for(const g of o.lodGeometries??[])geometries.add(g);
    for (const m of [...(Array.isArray(o.material) ? o.material : [o.material]), o.customDepthMaterial])
      if (m) {
        materials.add(m);
        for (const v of Object.values(m))
          if (v?.isTexture && !v.userData.hearthBuiltin) textures.add(v);
      }
  });
  for (const x of [...geometries, ...materials, ...textures]) x.dispose();
}
const natureCaches = new WeakMap();
function natureCacheFor(models) {
  if (!natureCaches.has(models)) natureCaches.set(models, new Map());
  return natureCaches.get(models);
}
export function createEntityObject(e, models, mixers = [], natureCache = natureCacheFor(models), mount = null) {
  const group = new T.Group();
  group.userData.id = e.id;
  const mat = new T.MeshStandardMaterial({
    color: e.shape === "box" && e.surface ? "#ffffff" : e.color,
    map: e.shape === "box" ? materialTexture(e.surface) : null,
    roughness: 0.85,
    flatShading: true,
  });
  const mesh = (geo, pos, material = mat) => {
    if (e.shape === "box" && e.surface) blockUV(geo, e.scale);
    const m = new T.Mesh(geo, material);
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  if(e.shape==='box'&&e.surface===3)masonryMaterial(mat,e.scale);
  if (e.shape === "model") {
    const gltf = models.get(e.assetId),
      mounted = mount ? mountVisual(gltf, mount) : null,
      model = mounted?.model ?? clone(gltf.scene);
    group.add(mounted?.group ?? model);
    if (mounted) {group.userData.mountModel = model; group.userData.mountClips = gltf.animations;}
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    if (e.kind === "enemy" || e.kind === "npc") {
      const cfg =
        e.kind === "enemy" ? enemyConfig(e) : { facing: e.npc?.facing ?? 0 };
      model.rotation.y += cfg.facing;
      model.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(model),
        size = bounds.getSize(new T.Vector3());
      if (size.y > 1e-6) {
        const factor = 1.8 / size.y;
        model.scale.multiplyScalar(factor);
        model.position.sub(
          new T.Vector3(
            (bounds.min.x + bounds.max.x) / 2,
            bounds.min.y,
            (bounds.min.z + bounds.max.z) / 2,
          ).multiplyScalar(factor),
        );
      }
      group.userData[e.kind + "Model"] = model;
      group.userData[e.kind + "Clips"] = gltf.animations;
    }
    if (
      gltf.animations.length &&
      !["enemy", "npc"].includes(e.kind) &&
      !mount && !e.motion &&
      !e.environment
    ) {
      const mixer = new T.AnimationMixer(model);
      mixer.clipAction(gltf.animations[0]).play();
      mixers.push(mixer);
    }
    mat.dispose();
  } else if (
    e.shape === "humanoid" ||
    (e.kind === "enemy" && e.shape === "box") ||
    (e.kind === "npc" && e.shape === "sphere")
  ) {
    const body = humanoid(e.color, e.kind !== "npc" && !e.heldWeapon, e.heldWeapon?.hand);
    if (["box", "sphere"].includes(e.shape)) {
      body.scale.set(1, 1 / 1.845, 1);
      body.position.y = -0.5;
    }
    group.add(body);
    group.userData[e.kind + "Pose"] = body.userData.pose;
    mat.dispose();
  } else if (e.shape === "door") {
    mesh(new T.BoxGeometry(1.2, 2.4, 0.12), [0.6, 1.2, 0]);
    mesh(
      new T.SphereGeometry(0.07, 8, 6),
      [1.05, 1.15, 0.11],
      new T.MeshStandardMaterial({
        color: "#d7b65d",
        metalness: 0.6,
        roughness: 0.35,
      }),
    );
  } else if (e.shape === "tree") {
    group.add(vegetationObject(e, natureCache));
    mat.dispose();
  } else if (e.shape === "rock") {
    const rock=rockObject(e,natureCache);
    rock.castShadow=true;rock.receiveShadow=true;group.add(rock);mat.dispose();
  } else if (e.shape === "ruin") {
    mesh(new T.BoxGeometry(1.4, 5, 1.8), [-3, 2.5, 0]);
    mesh(new T.BoxGeometry(1.4, 5, 1.8), [3, 2.5, 0]);
    mesh(new T.BoxGeometry(7.8, 1.25, 2), [0, 5.3, 0]);
  } else
    mesh(
      e.shape === "sphere"
        ? new T.IcosahedronGeometry(0.5, 1)
        : e.surface===3 ? new RoundedBoxGeometry(1,1,1,2,.018) : new T.BoxGeometry(1, 1, 1),
      [0, 0, 0],
    );
  if (e.kind === "item") {
    mat.emissive.set(e.color);
    mat.emissiveIntensity = 1.4;
  }
  group.position.set(...e.position);
  group.rotation.set(...e.rotation);
  group.scale.set(...e.scale);
  group.traverse((o) => {
    o.userData.id = e.id;
  });
  if (e.heldWeapon) attachHeldWeapon(group, e, models);
  return group;
}
export class WorldView {
  constructor(host) {
    this.host = host;
    this.scene = new T.Scene();
    this.root = new T.Group();
    this.scene.add(this.root);
    this.renderer = new T.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.dirty = true;
    this.quality="balanced";
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.append(this.renderer.domElement);
    this.camera = new T.PerspectiveCamera(55, 1, 0.1, 250);
    this.camera.position.set(24, 23, 29);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 0, -3);
    this.orbit.enableDamping = true;
    this.orbit.addEventListener("change", () => this.invalidate());
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.03;
    this.orbit.maxDistance = 160;
    this.hemisphere = new T.HemisphereLight("#d9e9ef", "#354233", 2.6);
    this.scene.add(this.hemisphere);
    const sun = new T.DirectionalLight("#ffe5b3", 3.2);
    sun.position.set(-18, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.sun = sun;
    Object.assign(sun.shadow.camera, {
      left: -42,
      right: 42,
      top: 42,
      bottom: -42,
      near: 1,
      far: 200,
    });
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.objects = new Map();
    this.boxes = [];
    this.mixers = [];
    this.ray = new T.Raycaster();
    this.clock = new T.Clock();
    this.playing = false;
    this.resize = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      this.renderer.setPixelRatio(qualityPixelRatio(this.quality,w,h,globalThis.devicePixelRatio??1));
      this.renderer.setSize(w, h);
      this.camera.aspect = w / Math.max(1,h);
      this.camera.updateProjectionMatrix();
      this.invalidate();
    });
    this.resize.observe(host);
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (!this.playing) {
        this.orbit.update();
        this.editorTick?.(dt);
        this.editorPreview?.(dt);
      }
      if (this.playing && !this.gamePaused)
        for (const m of this.mixers) m.update(dt);
      if (this.playing && !this.gamePaused && this.mixers.length) {
        this.shadowTimer = (this.shadowTimer ?? 0) + dt;
        if (this.shadowTimer > 0.1) {
          this.invalidate(true);
          this.shadowTimer = 0;
        }
      }
      this.tick?.(dt);
      if ((this.playing && !this.gamePaused) || this.dirty) {
        if (!this.gamePaused) natureTime.value+=dt;
        this.dayNight?.followCamera();
        this.prepareRender(dt);
        this.renderer.render(this.scene, this.camera);
        if (this.playing) this.weapon?.render(this.renderer, this.camera);
        this.dirty = false;
      }
    });
  }
  applyTime(
    hour = this.project.world.dayNight?.startHour ?? 9,
    config = this.project.world.dayNight,
    force = false,
    dt = 0,
  ) {
    if (!this.dayNight && !config?.enabled) return;
    this.dayNight ??= new DayNight(this);
    this.dayNight.apply(hour, config, force, dt);
  }
  invalidate(shadows = false) {
    this.dirty=true;if(shadows)this.shadowDirty=true;
  }
  prepareRender(dt=0,force=false) {
    this.editorGuides?.updateVisibility(!this.playing);
    const p=qualityProfile(this.quality);
    const overview=this.playing===false && this.orbit?.target && this.camera.position.distanceTo(this.orbit.target)>p.viewDistance*.7;
    if(this.scene.fog && this.fogRange) {
      const far=overview?Math.max(this.fogRange[1],(this.project?.world.size??100)*3):this.fogRange[1];
      this.scene.fog.far=far;this.scene.fog.near=overview?far*.6:this.fogRange[0];
      const clip=this.playing?Math.max(240,far*1.2):Math.max(250,(this.project?.world.size??100)*2,far*1.2);
      if(this.camera.far!==clip){this.camera.far=clip;this.camera.updateProjectionMatrix();}
    }
    this.followShadows();coverDistance(this.cover,this.camera,this.quality);updateBatchLOD(this.batchState,this.camera,this.quality,overview);this.terrainLOD?.update(this.camera,this.quality,force,overview);
    // Rendering layers leave actor visibility/spawn/AI state untouched.
    const x=this.camera.position.x,z=this.camera.position.z;
    this.distanceElapsed=(this.distanceElapsed??Infinity)+dt;
    if(force||this.distanceElapsed>=.25||this.renderQuality!==this.quality||Math.hypot(x-this.renderX,z-this.renderZ)>2){
      this.distanceElapsed=0;this.renderX=x;this.renderZ=z;this.renderQuality=this.quality;
      const far=this.scene.fog?.far??p.viewDistance;
      for(const entry of this.distanceObjects??[]){const visible=Math.hypot(entry.object.position.x-x,entry.object.position.z-z)-entry.radius<far;for(const mesh of entry.meshes)visible?mesh.layers.enable(0):mesh.layers.disable(0);}
    }
    this.shadowElapsed=(this.shadowElapsed??Infinity)+dt;
    if(this.renderer.shadowMap.enabled!==false&&this.shadowDirty&&this.shadowElapsed>=p.shadowInterval){this.renderer.shadowMap.needsUpdate=true;this.shadowDirty=false;this.shadowElapsed=0;}
  }
  followShadows() {
    if(!this.camera||!this.sun||this.renderer?.shadowMap?.enabled===false)return;
    const anchor=this.playing?this.camera.position:(this.orbit?.target??this.camera.position),target=this.sun.target.position;
    const x=Math.round(anchor.x/2)*2,z=Math.round(anchor.z/2)*2,y=Math.round((anchor.y-1.7)/2)*2;
    if(Math.hypot(target.x-x,target.z-z,target.y-y)<1)return;
    const direction=this.sun.position.clone().sub(target).normalize();target.set(x,y,z);this.sun.position.copy(target).addScaledVector(direction,90);this.sun.target.updateMatrixWorld();this.invalidate(true);
  }
  setQuality(value,force=false) {
    value=QUALITY_OPTIONS.some(([id])=>id===value)?value:"balanced";if(this.quality===value&&!force)return;this.quality=value;
    const p=qualityProfile(value),shadows=p.shadowSize>0;
    this.renderer.setPixelRatio(qualityPixelRatio(value,this.host?.clientWidth??1280,this.host?.clientHeight??720,globalThis.devicePixelRatio??1));
    const changed=this.renderer.shadowMap.enabled!==shadows;this.renderer.shadowMap.enabled=shadows;if(!shadows)this.renderer.shadowMap.needsUpdate=false;
    if(this.sun&&this.sun.shadow.mapSize.x!==(p.shadowSize||1)){this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.mapSize.set(p.shadowSize||1,p.shadowSize||1);}
    const materials=new Set();this.scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});
    for(const m of materials){let update=changed;
      if(m.defines&&'HEARTH_DETAIL' in m.defines&&m.defines.HEARTH_DETAIL!==p.detail){m.defines.HEARTH_DETAIL=p.detail;update=true;}
      if(m.defines&&'HEARTH_CLOUDS' in m.defines&&m.defines.HEARTH_CLOUDS!==p.clouds){m.defines.HEARTH_CLOUDS=p.clouds;update=true;}
      if(m.userData.water){const transparent=p.detail>1;if(m.transparent!==transparent){m.transparent=transparent;m.opacity=transparent?.96:1;update=true;}}
      if(update)m.needsUpdate=true;
    }
    natureWind.value=(this.project?.world.landscape?.wind??.65)*p.wind;
    const world=this.project?.world;if(world&&this.scene.fog){const haze=world.landscape?.haze??.2;this.scene.fog.far=Math.min(Math.max(160,world.size*(1.5-haze*.9)),p.viewDistance*.88);this.scene.fog.near=Math.min(Math.max(32,world.size*(.28-haze*.2)),this.scene.fog.far*.6);this.fogRange=[this.scene.fog.near,this.scene.fog.far];this.camera.far=this.playing?Math.max(240,this.scene.fog.far*1.2):Math.max(250,world.size*2);this.camera.updateProjectionMatrix();}
    this.shadowElapsed=Infinity;this.invalidate(true);if(this.camera)this.prepareRender(0,true);
  }
  touchObject(id) {this.touchObjects([id]);}
  touchObjects(ids) {
    this.renderQuality=null;
    for(const id of ids) {
      const object=this.objects.get(id),entry=this.distanceEntries?.get(object)??this.distanceObjects?.find(x=>x.object===object);
      if(entry)entry.radius=new T.Box3().setFromObject(object).getSize(new T.Vector3()).length()/2;
    }
    updateBatches(this.batchState,ids);this.invalidate(true);
  }
  async syncProject(next) {
    const old = this.project;
    // Structural changes use the transactional full loader; transforms and metadata reuse GPU resources.
    const visual = (e) =>
      JSON.stringify([
        e.id,
        e.shape,
        e.vegetation,
        e.kind,
        e.color,
        e.assetId,
        e.enemy,
        e.npc,
        e.motion,
        e.heldWeapon,
        e.heldWeapon ? e.scale : null,
        e.moonDoor,
        e.book,
        e.environment,
        e.collision,
        e.surface,
        e.surface ? e.scale : null,
      ]);
    if (
      !old ||
      JSON.stringify(old.rpg) !== JSON.stringify(next.rpg) ||
      JSON.stringify(old.assets) !== JSON.stringify(next.assets) ||
      JSON.stringify(old.world.landscape) !== JSON.stringify(next.world.landscape) ||
      (Boolean(next.world.landscape?.enabled) && JSON.stringify(old.world.terrain) !== JSON.stringify(next.world.terrain)) ||
      old.world.size !== next.world.size ||
      old.world.terrain?.resolution !== next.world.terrain?.resolution ||
      old.entities.length !== next.entities.length ||
      old.entities.some((e, i) => visual(e) !== visual(next.entities[i]))
    )
      return this.load(next);
    const touched=[];
    for (let i = 0; i < next.entities.length; i++) {
      const e = next.entities[i],
        before = old.entities[i];
      if (
        JSON.stringify([e.position, e.rotation, e.scale]) !==
        JSON.stringify([before.position, before.rotation, before.scale])
      ) {
        const o = this.objects.get(e.id);
        o.position.set(...e.position);
        o.rotation.set(...e.rotation);
        o.scale.set(...e.scale);
        o.updateMatrixWorld(true);
        touched.push(e.id);
      }
    }
    this.touchObjects(touched);
    if (
      JSON.stringify(old.world.terrain) !== JSON.stringify(next.world.terrain)
    )
      this.updateTerrain(next.world);
    this.ground.material.color.set(next.world.ground);
    this.scene.background = new T.Color(next.world.sky);
    this.scene.fog.color.set(next.world.sky);
    this.project = next;
    this.surfaceWorld = next.world;
    this.boxes = [];
    for (const e of next.entities)
      this.boxes.push(...entityColliders(e, this.objects.get(e.id)));
    this.indexColliders();
    this.applyTime(undefined, undefined, true);
    this.invalidate(true);
  }
  async load(project) {
    const root = new T.Group(),
      objects = new Map(),
      boxes = [],
      mixers = [];
    const models = new Map();
    const natureCache = new Map();
    try {
      for (const asset of project.assets)
        models.set(asset.id, await parseGLB(asset.data));
      const ground = new T.Mesh(
        terrainGeometry(project.world),
        groundMaterial(
          project.world.ground,
          Boolean(project.world.terrain?.paint),
        ),
      );
      this.nextGround = ground;
      ground.receiveShadow = true;
      root.add(ground);
      root.add(waterObjects(project));
      this.nextCover=groundcover(project);root.add(this.nextCover);
      const grid = new T.GridHelper(
        project.world.size,
        40,
        "#9baa89",
        "#70856c",
      );
      grid.position.y = 0.01;
      grid.material.opacity = 0.16;
      grid.material.transparent = true;
      root.add(grid);
      this.nextGrid = grid;
      for (const e of project.entities) {
        const group = createEntityObject(e, models, mixers, natureCache, e.id === project.rpg?.services.horse ? project.rpg.mount : null);
        root.add(group);
        objects.set(e.id, group);
        group.updateMatrixWorld(true);
        boxes.push(...entityColliders(e, group));
      }
    } catch (error) {
      dispose(root);
      for (const m of models.values()) dispose(m.scene);
      throw error;
    }
    this.select(null);
    this.terrainLOD?.dispose();this.terrainLOD=null;
    if(this.batchState?.sources)dispose(this.batchState.sources);
    dispose(this.root);
    this.scene.remove(this.root);
    this.root = root;
    this.scene.add(root);
    this.objects = objects;
    this.boxes = boxes;
    this.indexColliders();
    this.mixers = mixers;
    this.grid = this.nextGrid;
    this.ground = this.nextGround;
    if(project.world.terrain){this.ground.visible=false;this.terrainLOD=new TerrainLOD(project.world,this.ground.geometry,this.ground.material);root.add(this.terrainLOD.root);}
    this.cover=this.nextCover;
    natureWind.value=project.world.landscape?.wind??.65;
    this.assetModels = models;
    this.project = project;
    if (!this.materialReady) {
      this.materialReady = () => this.invalidate();
      materialListeners.add(this.materialReady);
    }
    this.surfaceWorld = project.world;
    this.batchState = batchProps(root, objects, project.entities, project.world);
    this.distanceObjects=[];
    for(const [id,object]of objects){if(this.batchState.refs.has(id))continue;const meshes=[];object.traverse(o=>{if(o.isMesh)meshes.push(o);});const radius=new T.Box3().setFromObject(object).getSize(new T.Vector3()).length()/2;this.distanceObjects.push({object,meshes,radius});}
    this.distanceEntries=new Map(this.distanceObjects.map(entry=>[entry.object,entry]));
    this.invalidate(true);
    this.scene.background = new T.Color(project.world.sky);
    // Large landscapes must be hidden by their hills, not by a fixed 100 m fog wall.
    const haze=project.world.landscape?.haze??.2;
    this.scene.fog = new T.Fog(
      project.world.sky,
      Math.max(32, project.world.size * (.28-haze*.2)),
      Math.max(160, project.world.size * (1.5-haze*.9)),
    );
    if (this.camera) {
      this.camera.far = Math.max(250, project.world.size * 2);
      this.camera.updateProjectionMatrix();
    }
    if (this.orbit)
      this.orbit.maxDistance = Math.max(160, project.world.size * 1.6);
    this.grid.visible = !this.playing && !project.world.terrain;
    this.applyTime(undefined, undefined, true);
    this.setQuality(this.quality??"balanced",true);
  }
  select(id) {
    this.invalidate();
    if (this.selection) {
      this.scene.remove(this.selection);
      this.selection.dispose();
      this.selection = null;
    }
    const ids = Array.isArray(id) ? id : [id];
    const objects = ids.map(id => this.objects.get(id)).filter(Boolean);
    if (objects.length) {
      this.selection = new SelectionOutline(objects);
      this.scene.add(this.selection);
    }
  }
  pick(event) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new T.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        (-(event.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    return this.visibleObjectHit()?.object.userData.id;
  }
  visibleObjectHit(maxDistance = Infinity) {
    this.ground.updateMatrixWorld(true);
    const previousFar = this.ray.far;
    this.ray.far = Math.min(previousFar, maxDistance);
    try {
      const hit = this.ray.intersectObjects(
        [...this.objects.values()].filter((o) => o.visible),
        true,
      )[0];
      const ground = this.terrainHit(this.ray.ray, this.ray.far);
      return hit && (!ground || hit.distance <= ground.distance + 0.01)
        ? hit
        : null;
    } finally {
      this.ray.far = previousFar;
    }
  }
  target() {
    this.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(new T.Vector2(), this.camera);
    const hit = this.visibleObjectHit(3.4);
    return hit && hit.distance < 3.4 ? hit.object.userData.id : null;
  }
  terrainHit(ray, limit) {
    return terrainHit(ray, this.surfaceWorld ?? this.project.world, limit);
  }
  updateTerrain(world, dirty) {
    updateSurface(this.ground, world, dirty);
    if(this.ground.material.defines)this.ground.material.defines.HEARTH_DETAIL=qualityProfile(this.quality).detail;
    if(world.terrain&&(!this.terrainLOD||this.terrainLOD.world.terrain.resolution!==world.terrain.resolution)){this.terrainLOD?.dispose();this.terrainLOD=new TerrainLOD(world,this.ground.geometry,this.ground.material);this.root.add(this.terrainLOD.root);}else if(!world.terrain){this.terrainLOD?.dispose();this.terrainLOD=null;}
    this.ground.visible=!world.terrain;
    this.terrainLOD?.refresh(world,this.ground.geometry,this.ground.material,dirty&&{...dirty,minX:dirty.minX-1,maxX:dirty.maxX+1,minZ:dirty.minZ-1,maxZ:dirty.maxZ+1});
    this.surfaceWorld = world;
    this.invalidate(true);
    this.grid.visible = !this.playing && !world.terrain;
  }
  groundHit(event) {
    this.eventRay(event);
    this.ground.updateMatrixWorld(true);
    return this.terrainHit(this.ray.ray)?.point ?? null;
  }
  eventRay(event) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new T.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        (-(event.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
  }
  groundObject(object, world = this.project.world) {
    object.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(object);
    if (!box.isEmpty())
      object.position.y +=
        heightAt(world, object.position.x, object.position.z) - box.min.y;
    object.updateMatrixWorld(true);
  }
  indexColliders() {
    this.collisionIndex = new ColliderIndex(this.boxes);
    this.colliderGroups = new Map();
    for (const box of this.boxes) {
      if (!this.colliderGroups.has(box.entityId))
        this.colliderGroups.set(box.entityId, []);
      this.colliderGroups.get(box.entityId).push(box);
    }
  }
  refreshColliders(id) {
    for (const b of this.colliderGroups?.get(id) ??
      this.boxes.filter((b) => b.entityId === id)) {
      refreshBounds(b);
      this.collisionIndex?.update(b);
    }
  }
  nearbyColliders(x, z, dx = 0, dz = 0) {
    return (
      this.collisionIndex?.query(
        Math.min(x, x + dx) - 0.33,
        Math.min(z, z + dz) - 0.33,
        Math.max(x, x + dx) + 0.33,
        Math.max(z, z + dz) + 0.33,
      ) ?? this.boxes
    );
  }
  blocked(x, z, feet = heightAt(this.project.world, x, z)) {
    if (
      !insideWorld(this.project.world, x, z)
    )
      return true;
    return this.nearbyColliders(x, z).some(
      (b) =>
        b.max.y > feet + 0.15 &&
        b.min.y < feet + 1.7 &&
        x > b.min.x - 0.32 &&
        x < b.max.x + 0.32 &&
        z > b.min.z - 0.32 &&
        z < b.max.z + 0.32,
    );
  }
  start(position) {
    this.savedCamera = {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      target: this.orbit.target.clone(),
    };
    this.playing = true;
    this.orbit.enabled = false;
    this.grid.visible = false;
    this.select(null);
    this.camera.position.set(...groundPosition(this.project.world, position));
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(0, 0, 0);
    this.setQuality(this.quality,true);
  }
  stop() {
    this.invalidate(true);
    this.playing = false;
    this.orbit.enabled = true;
    this.grid.visible = !this.project.world.terrain;
    this.camera.position.copy(this.savedCamera.position);
    this.camera.quaternion.copy(this.savedCamera.quaternion);
    this.orbit.target.copy(this.savedCamera.target);
    for (const o of this.objects.values()) o.visible = true;
    this.applyTime(undefined, undefined, true);
    this.setQuality(this.quality,true);
  }
  dispose() {
    materialListeners.delete(this.materialReady);
    this.dayNight?.dispose();
    this.renderer.setAnimationLoop(null);
    this.resize.disconnect();
    this.orbit.dispose();
    this.terrainLOD?.dispose();this.terrainLOD=null;
    if(this.batchState?.sources)dispose(this.batchState.sources);
    dispose(this.root);
    this.renderer.dispose();
  }
}
