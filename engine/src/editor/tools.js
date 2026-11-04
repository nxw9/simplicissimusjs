import { editingText } from "./selection.js";
import { carveRoad, raiseCliff } from "../core/terrain-brushes.js";
import { PATROL_LIMIT } from "../core/patrol.js";
import { PatrolGuide } from "./patrol-editor.js";
import { appendWall, planWall, validWallStart, wallEnd, wallOptions, WALL_SEGMENT_LIMIT, WALL_POINT_LIMIT } from "../core/walls.js";
import { applyEntityTransforms, selectionCenter } from "../core/bulk-edit.js";
import { paintTerrain } from "../core/materials.js";
import * as T from "three";
import { spawnMarker, validSpawn } from "./spawn-marker.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { createEntityObject } from "../render/world.js";
import {
  createTerrain,
  createRegion,
  heightAt,
  sculpt,
  groundPosition,
} from "../core/terrain.js";
const transformModes = { move: "translate", rotate: "rotate", scale: "scale" };
const brushModes = new Set(["raise", "lower", "smooth", "flatten", "paint", "cliff", "road"]);

/** Editing previews are separate from the committed project. One gesture = one undo. */
export class SceneTools {
  constructor(view, callbacks) {
    this.view = view;
    this.cb = callbacks;
    this.mode = "move";
    this.gesture = null;
    this.pending = null;
    this.canvas = view.renderer.domElement;
    view.orbit.mouseButtons = {
      LEFT: null,
      MIDDLE: T.MOUSE.PAN,
      RIGHT: T.MOUSE.ROTATE,
    };
    this.pivot = new T.Group(); view.scene.add(this.pivot);
    this.marquee = document.createElement("div"); this.marquee.className = "selection-marquee"; this.marquee.hidden = true; this.canvas.parentElement?.append(this.marquee);
    this.gizmo = new TransformControls(view.camera, this.canvas);
    this.gizmo.setSize(0.85);
    this.gizmo.setSpace("world");
    view.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener(
      "dragging-changed",
      (event) => (view.orbit.enabled = !event.value && !view.playing),
    );
    this.gizmo.addEventListener("mouseDown", () => {
      if (this.cb.isBusy()) return;
      this.gesture = {type: "gizmo", ...this.transformSnapshot()};
      this.cb.gestureChanged(true);
    });
    this.gizmo.addEventListener("objectChange", () => {
      if (this.restoring || !this.gesture) return;
      const object = this.gizmo.object;
      if (!object) return;
      const g = this.gesture;
      if (g.ids.length > 1) {
        if (this.mode === "scale") {
          const axis = String(this.gizmo.axis ?? "X")[0].toLowerCase();
          object.scale.setScalar(Math.max(0.001, object.scale[axis] ?? object.scale.x));
        }
        for (const before of g.before) {
          const o = view.objects.get(before.id);
          o.position.copy(before.position).sub(g.center).multiply(object.scale).applyQuaternion(object.quaternion).add(object.position);
          o.quaternion.copy(object.quaternion).multiply(before.quaternion);
          o.scale.copy(before.scale).multiply(object.scale);
        }
      }
      if (this.mode === "move" && this.cb.snap() && !String(this.gizmo.axis).includes("Y")) this.groundGroup(g.ids);
      this.previewTransforms(g.ids);
    });
    this.gizmo.addEventListener("mouseUp", () => {
      if (this.gesture?.type === "gizmo") this.finishTransform();
    });
    this.outline = new T.LineLoop(
      new T.BufferGeometry(),
      new T.LineBasicMaterial({ color: "#f1d38a", depthTest: false }),
    );
    this.outline.renderOrder = 20;
    this.outline.visible = false;
    view.scene.add(this.outline);
    this.circle = new T.LineLoop(
      new T.BufferGeometry(),
      new T.LineBasicMaterial({ color: "#f4e4b0", depthTest: false }),
    );
    this.circle.renderOrder = 21;
    this.circle.visible = false;
    view.scene.add(this.circle);
    this.wallPreview = new T.InstancedMesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshBasicMaterial({color:"#b8e9bb", transparent:true, opacity:.38, depthWrite:false}),
      WALL_SEGMENT_LIMIT,
    );
    this.wallPreview.count = 0;
    this.wallPreview.visible = false;
    this.wallPreview.frustumCulled = false;
    this.wallMatrix = new T.Object3D();
    view.scene.add(this.wallPreview);
    this.spawnMarker = spawnMarker("#68bdff");
    this.spawnPreview = spawnMarker("#81efad");
    this.spawnPreview.visible = false;
    view.scene.add(this.spawnMarker, this.spawnPreview);
    this.updateSpawn();
    this.patrolGuide = new PatrolGuide(view);
    this.down = (e) => this.pointerDown(e);
    this.move = (e) => this.pointerMove(e);
    this.up = (e) => this.pointerUp(e);
    this.cancelPointer = () => this.cancel();
    this.canvas.addEventListener("pointerdown", this.down, true);
    this.canvas.addEventListener("pointermove", this.move, true);
    this.canvas.addEventListener("pointerup", this.up, true);
    this.canvas.addEventListener("pointercancel", this.cancelPointer);
    this.canvas.addEventListener("pointerleave", () => {
      if (!this.gesture) {
        this.circle.visible = false;
        this.spawnPreview.visible = false;
        this.view.invalidate?.();
        this.hover = null;
        if (this.ghost) this.ghost.visible = false;
      }
    });
    this.blur = () => this.cancel();
    window.addEventListener("blur", this.blur);
    this.key = (e) => {
      if (editingText(e.target) || view.playing || this.cb.isBusy() || document.querySelector("dialog[open]")) return;
      if (e.code === "Delete" && !e.repeat) {e.preventDefault(); this.cancel(); this.cb.deleteSelection?.(); return;}
      if (e.ctrlKey || e.metaKey) {
        if (e.code === "KeyA") {e.preventDefault(); this.cancel(); this.cb.selectAll?.();}
        if (e.code === "KeyZ") {e.preventDefault(); this.cancel(); e.shiftKey ? this.cb.redo?.() : this.cb.undo?.();}
        if (e.code === "KeyY") {e.preventDefault(); this.cancel(); this.cb.redo?.();}
        return;
      }
      if (e.code === "Escape") {this.cancel(); this.setMode("move");}
      if (e.code === "KeyB") this.setMode("select");
      if (e.code === "KeyG") this.setMode("move");
      if (e.code === "KeyR") this.setMode("rotate");
      if (e.code === "KeyS") this.setMode("scale");
      if (e.code === "KeyL" && this.mode === "wall" && !e.repeat) {
        e.preventDefault(); this.cancel(); this.cb.toggleWallLine?.();
      }
    };
    window.addEventListener("keydown", this.key);
    view.editorTick = (dt) => this.tick(dt);
    this.setMode("move");
  }
  setMode(mode) {
    if (this.gesture) this.cancel();
    if (mode !== "place") this.clearGhost();
    this.mode = mode;
    this.patrolPointIndex = null;
    this.circle.visible = false;
    this.hover = null;
    this.spawnPreview.visible = false;
    this.updateSpawn();
    this.attach();
    this.updateOutline();
    this.cb.modeChanged(mode);
    this.canvas.style.cursor =
      brushModes.has(mode) || ["area", "place", "spawn", "patrol", "wall"].includes(mode)
        ? "crosshair"
        : "default";
  }
  attach() {
    const project = this.cb.getProject();
    this.patrolGuide?.set(project.entities.find(e => e.id === this.cb.getSelected()), project.world);
    this.gizmo.detach();
    this.gizmo.enabled =
      !this.view.playing && !this.touchNavigation && Boolean(transformModes[this.mode]);
    const ids = this.selectionIds(), object = this.view.objects.get(ids[0]);
    if (object && this.gizmo.enabled) {
      this.gizmo.setMode(transformModes[this.mode]);
      if (ids.length > 1) {
        this.pivot.position.fromArray(selectionCenter(ids.map(id => ({position:this.view.objects.get(id).position.toArray()}))));
        this.pivot.quaternion.identity(); this.pivot.scale.setScalar(1); this.pivot.updateMatrixWorld(true);
        this.gizmo.attach(this.pivot);
      } else this.gizmo.attach(object);
    }
  }
  selectionIds() {return (this.cb.getSelection?.() ?? [this.cb.getSelected()]).filter(id => this.view.objects.has(id));}
  transformSnapshot() {
    const ids = this.selectionIds();
    return {ids, center:this.pivot.position.clone(), before:ids.map(id => {const o=this.view.objects.get(id); return {id,position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()};})};
  }
  previewTransforms(ids) {
    for (const id of ids) this.view.objects.get(id)?.updateMatrixWorld(true);
    if(ids.length>1&&this.cb.transformsPreview)this.cb.transformsPreview(ids);
    else for(const id of ids)this.cb.transformPreview(this.view.objects.get(id));
    this.view.selection?.update(); this.view.invalidate?.(true);
  }
  groundGroup(ids) {
    const anchor=this.view.objects.get(ids.at(-1)); if(!anchor) return;
    const y=anchor.position.y;this.view.groundObject(anchor); const dy=anchor.position.y-y;
    for(const id of ids) if(id!==ids.at(-1)) this.view.objects.get(id).position.y+=dy;
  }
  restoreTransforms(g) {
    for(const before of g.before) {const o=this.view.objects.get(before.id); if(o) {o.position.copy(before.position);o.quaternion.copy(before.quaternion);o.scale.copy(before.scale);}}
    this.previewTransforms(g.ids);
  }
  place(entity) {
    this.cancel();
    this.pending = entity;
    this.ghost = createEntityObject(entity, this.view.assetModels);
    this.ghost.traverse((o) => {
      if (o.isMesh) {
        if (entity.shape !== "model") {
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
        }
        o.material = new T.MeshBasicMaterial({
          color: "#d9e9a6",
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        });
        o.castShadow = false;
      }
    });
    this.ghost.visible = false;
    this.view.scene.add(this.ghost);
    this.setMode("place");
  }
  configurePlacement(scale, angle) {
    if (
      !this.pending ||
      !this.ghost ||
      !Number.isFinite(scale) ||
      scale <= 0 ||
      scale > 1000 ||
      !Number.isFinite(angle)
    )
      return;
    this.pending.scale = [scale, scale, scale];
    this.pending.rotation[1] = angle;
    this.ghost.scale.setScalar(scale);
    this.ghost.rotation.y = angle;
    this.view.groundObject(this.ghost);
    this.view.invalidate?.();
  }
  clearGhost() {
    if (this.ghost) {
      this.ghost.traverse((o) => {
        if (o.isMesh) {
          o.material.dispose();
          if (this.pending?.shape !== "model") o.geometry.dispose();
        }
      });
      this.view.scene.remove(this.ghost);
      this.ghost = null;
    }
    this.pending = null;
  }
  consume(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  pointerDown(e) {
    if (e.pointerType === "touch" && this.touchNavigation) return;
    if (e.pointerType === "touch" && e.isPrimary === false) { this.consume(e); return; }
    if (this.cb.isBusy() || this.view.playing || e.button !== 0) return;
    if (
      this.gizmo.enabled &&
      this.gizmo.axis &&
      !e.ctrlKey && !e.metaKey && !e.shiftKey &&
      !(this.mode === "move" && this.gizmo.axis === "XYZ")
    )
      return; // The visible axis owns this drag.
    this.consume(e);
    const hit = this.view.groundHit(e);
    if (this.mode === "place" || this.mode === "spawn" || this.mode === "patrol") {
      if (!hit) return;
      this.gesture = {
        type: this.mode,
        start: [e.clientX, e.clientY],
        point: hit.clone(),
      };
    } else if (this.mode === "area") {
      if (!hit) return;
      this.gesture = {
        type: "area",
        start: [hit.x, hit.z],
        end: [hit.x, hit.z],
      };
    } else if (this.mode === "wall") {
      const settings = wallOptions(this.cb.wallBrush?.());
      settings.straight = settings.straight || e.shiftKey;
      const point = hit && [hit.x,hit.z];
      if (!validWallStart(this.cb.getProject().world, point, settings)) {
        this.cb.notify("Начните стену внутри карты, отступив от края на половину ширины кисти.");
        return;
      }
      this.gesture = {type:"wall", settings, points:[point], plan:null};
      this.hover = hit;
      this.previewWall(hit);
    } else if (brushModes.has(this.mode)) {
      const region = this.cb.getRegion();
      if (!region) {
        this.cb.notify("Сначала выделите участок рельефа.");
        return;
      }
      if (
        !hit ||
        hit.x < region.min[0] ||
        hit.x > region.max[0] ||
        hit.z < region.min[1] ||
        hit.z > region.max[1]
      )
        return;
      this.gesture = {
        type: "sculpt",
        working: structuredClone(this.cb.getProject()),
        changed: false,
        level: heightAt(this.cb.getProject().world, hit.x, hit.z),
      };
      this.hover = hit;
      if (["cliff", "road"].includes(this.mode)) this.stampTerrain(hit, true);
    } else {
      const id = this.view.pick(e), toggle = !!(e.ctrlKey || e.metaKey || e.shiftKey);
      if (this.mode === "select") {
        this.gesture = {type:"marquee", start:[e.clientX,e.clientY], end:[e.clientX,e.clientY], toggle, id};
      } else {
        if (toggle) {this.cb.select(id ?? null,{toggle:true}); this.attach(); return;}
        if (!id || !this.selectionIds().includes(id)) this.cb.select(id ?? null);
        this.attach();
        if (!id || !hit || this.mode !== "move") return;
        this.gesture = {type:"drag", ...this.transformSnapshot(), start:[e.clientX,e.clientY],point:hit.clone(),moved:false};
      }
    }
    this.gizmo.enabled = false;
    this.view.orbit.enabled = false;
    this.canvas.setPointerCapture(e.pointerId);
    this.capturedPointer = e.pointerId;
    this.cb.gestureChanged(true);
  }
  pointerMove(e) {
    if (e.pointerType === "touch" && (this.touchNavigation || e.isPrimary === false)) return;
    if (this.cb.isBusy() || this.view.playing) return;
    if (this.gesture?.type === "gizmo") return;
    if (
      !this.gesture &&
      ![
        "place",
        "spawn",
        "area",
        "raise",
        "lower",
        "smooth",
        "flatten",
        "paint",
        "cliff",
        "road",
        "patrol",
        "wall",
      ].includes(this.mode)
    )
      return;
    this.view.invalidate?.();
    if (this.gesture?.type === "marquee") {
      const g=this.gesture, r=this.canvas.getBoundingClientRect(); g.end=[e.clientX,e.clientY];
      this.marquee.hidden=false;
      Object.assign(this.marquee.style,{left:Math.min(g.start[0],e.clientX)-r.left+"px",top:Math.min(g.start[1],e.clientY)-r.top+"px",width:Math.abs(g.start[0]-e.clientX)+"px",height:Math.abs(g.start[1]-e.clientY)+"px"});
      this.consume(e);return;
    }
    const hit = this.view.groundHit(e);
    this.hover = hit;
    if (this.mode === "spawn") {
      const world = this.cb.getProject().world,
        valid = validSpawn(this.view, world, hit);
      this.spawnPreview.visible = Boolean(hit);
      if (hit)
        this.spawnPreview.position.set(
          hit.x,
          heightAt(world, hit.x, hit.z),
          hit.z,
        );
      this.spawnPreview.userData.material.color.set(
        valid ? "#81efad" : "#ff6262",
      );
      this.cb.spawnHint?.(
        valid
          ? "ЛКМ — поставить героя здесь · Esc — отменить"
          : "Здесь нельзя появиться: выберите свободное место на земле",
      );
    }
    if (this.mode === "place" && this.ghost) {
      this.ghost.visible = Boolean(hit);
      if (hit) {
        this.ghost.position.x = hit.x;
        this.ghost.position.z = hit.z;
        this.view.groundObject(this.ghost);
      }
    }
    if (brushModes.has(this.mode) || this.mode === "patrol" || this.mode === "wall") this.updateCircle();
    const g = this.gesture;
    if (!g) return;
    this.consume(e);
    if (!hit) return;
    if (g.type === "wall") this.previewWall(hit);
    if (g.type === "sculpt" && ["cliff", "road"].includes(this.mode)) this.stampTerrain(hit);
    if (g.type === "area") {
      g.end = [hit.x, hit.z];
      this.rectangle(g.start, g.end);
    }
    if (g.type === "drag") {
      if (
        Math.hypot(e.clientX - g.start[0], e.clientY - g.start[1]) < 3 &&
        !g.moved
      )
        return;
      g.moved = true;
      const half = this.cb.getProject().world.size / 2;
      const dx=T.MathUtils.clamp(hit.x-g.point.x,Math.max(...g.before.map(b=>-half-b.position.x)),Math.min(...g.before.map(b=>half-b.position.x)));
      const dz=T.MathUtils.clamp(hit.z-g.point.z,Math.max(...g.before.map(b=>-half-b.position.z)),Math.min(...g.before.map(b=>half-b.position.z)));
      for(const before of g.before) this.view.objects.get(before.id).position.copy(before.position).add(new T.Vector3(dx,0,dz));
      if (this.cb.snap()) this.groundGroup(g.ids);
      this.previewTransforms(g.ids);
    }
  }
  async pointerUp(e) {
    if (e.pointerType === "touch" && (this.touchNavigation || e.isPrimary === false)) return;
    if (
      this.view.playing ||
      e.button !== 0 ||
      !this.gesture ||
      this.gesture.type === "gizmo"
    )
      return;
    this.consume(e);
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
    const g = this.gesture;
    if (g.type === "wall") {
      const hit = this.view.groundHit(e);
      if (hit) this.previewWall(hit, true);
      this.wallPreview.visible = false;
    }
    if (g.type === "drag") {
      if (g.moved) await this.finishTransform();
      else this.endGesture();
      return;
    }
    this.endGesture();
    try {
      if (g.type === "wall") {
        const next = appendWall(this.cb.getProject(), g.plan, g.settings);
        if (!next && g.plan.limited) this.cb.notify("Достигнут лимит объектов карты. Удалите лишние секции.");
        if (next && await this.cb.commit(next))
          this.cb.notify(`Стена построена: ${g.plan.segments.length} секц. Ctrl/⌘+Z — отменить весь мазок.${g.plan.limited ? " Достигнут лимит мазка — продолжите следующей линией." : ""}`);
      }
      if (g.type === "patrol") {
        if (Math.hypot(e.clientX-g.start[0], e.clientY-g.start[1]) > 6) return;
        const hit = this.view.groundHit(e);
        if (!hit) return;
        const next = structuredClone(this.cb.getProject());
        const actor = next.entities.find(e => e.id === this.cb.getSelected());
        if (!actor || !["enemy", "npc"].includes(actor.kind)) {this.cb.notify("Сначала выберите врага или NPC.");return;}
        if (Math.abs(hit.x)>next.world.size/2 || Math.abs(hit.z)>next.world.size/2) return;
        actor.patrol ??= {enabled:true, mode:"pingpong", pause:0, points:[[actor.position[0],actor.position[2]]]};
        const points = actor.patrol.points;
        if (this.patrolPointIndex != null && points[this.patrolPointIndex]) points[this.patrolPointIndex] = [hit.x,hit.z];
        else {
          if (points.length >= PATROL_LIMIT) {this.cb.notify(`В маршруте не больше ${PATROL_LIMIT} точек.`);return;}
          if (Math.hypot(points.at(-1)[0]-hit.x, points.at(-1)[1]-hit.z)<.5) {this.cb.notify("Поставьте следующую точку хотя бы в 0,5 м от предыдущей.");return;}
          points.push([hit.x,hit.z]);
        }
        this.patrolPointIndex = null;
        await this.cb.commit(next);
        this.attach();
      }
      if (g.type === "marquee") {
        this.marquee.hidden=true;
        if (Math.hypot(g.end[0]-g.start[0],g.end[1]-g.start[1]) < 4) this.cb.select(g.id ?? null,{toggle:g.toggle});
        else {
          const r=this.canvas.getBoundingClientRect(), ids=[], point=new T.Vector3();this.view.camera.updateMatrixWorld();
          for(const [id,o] of this.view.objects) {
            if(!o.visible) continue;
            o.getWorldPosition(point).project(this.view.camera);
            const x=r.left+(point.x+1)*r.width/2,y=r.top+(1-point.y)*r.height/2;
            if(point.z>=-1&&point.z<=1&&x>=Math.min(g.start[0],g.end[0])&&x<=Math.max(g.start[0],g.end[0])&&y>=Math.min(g.start[1],g.end[1])&&y<=Math.max(g.start[1],g.end[1]))ids.push(id);
          }
          this.cb.selectMany?.(ids,g.toggle);
        }
      }
      if (g.type === "sculpt" && g.changed) await this.cb.commit(g.working);
      if (g.type === "area") {
        const next = structuredClone(this.cb.getProject());
        next.world.terrain ??= createTerrain();
        const region = createRegion(next.world, g.start, g.end);
        next.world.terrain.regions.push(region);
        this.cb.setRegion(region.id);
        if (await this.cb.commit(next)) this.setMode("raise");
      }
      if (g.type === "place" && this.pending && this.ghost) {
        const hit = this.view.groundHit(e);
        if (!hit) return;
        this.ghost.position.x = hit.x;
        this.ghost.position.z = hit.z;
        this.view.groundObject(this.ghost);
        const entity = structuredClone(this.pending);
        entity.position = this.ghost.position.toArray();
        const next = structuredClone(this.cb.getProject());
        next.entities.push(entity);
        const id = entity.id;
        this.clearGhost();
        if (await this.cb.commit(next)) {
          this.cb.select(id);
          if (this.cb.repeatPlacement?.(entity)) {
            entity.id = crypto.randomUUID();
            this.place(entity);
          } else this.setMode("move");
          this.cb.placed?.(entity);
          this.cb.notify(
            "Объект добавлен. Перетащите его мышью или за цветную стрелку.",
          );
        }
      }
      if (g.type === "spawn") {
        const hit = this.view.groundHit(e);
        if (!hit) return;
        if (!validSpawn(this.view, this.cb.getProject().world, hit)) {
          this.cb.notify(
            "Точка занята или слишком близко к краю. Выберите свободное место.",
          );
          return;
        }
        const next = structuredClone(this.cb.getProject());
        next.world.spawn = groundPosition(next.world, [hit.x, 0, hit.z]);
        if (await this.cb.commit(next)) {
          this.setMode("move");
          this.updateSpawn();
          this.cb.notify(
            "Старт героя установлен. Нажмите «Играть отсюда» в панели «Игрок».",
          );
        }
      }
    } catch (error) {
      this.cb.notify(error.message);
    }
    this.updateOutline();
  }
  updateSpawn() {
    const world = this.gesture?.working?.world ?? this.cb.getProject().world;
    const [x, , z] = world.spawn;
    this.spawnMarker.position.set(x, heightAt(world, x, z), z);
    this.spawnMarker.visible = !this.view.playing;
    if (this.view.playing) this.spawnPreview.visible = false;
    this.view.invalidate?.();
  }
  endGesture() {
    this.gesture = null;
    this.cb.gestureChanged(false);
    this.view.orbit.enabled = !this.view.playing;
    this.attach();
  }
  async finishTransform() {
    const g=this.gesture;
    if(!g?.ids.length) {this.endGesture();return;}
    const transforms=g.ids.map(id=>{const o=this.view.objects.get(id);return {id,position:o.position.toArray(),rotation:[o.rotation.x,o.rotation.y,o.rotation.z],scale:o.scale.toArray()};});
    this.restoreTransforms(g);this.endGesture();
    try {
      const next=applyEntityTransforms(this.cb.getProject(),transforms);
      const accepted=await this.cb.commit(next);
      if(accepted) for(const t of transforms) {const o=this.view.objects.get(t.id),e=this.cb.getProject().entities.find(e=>e.id===t.id);if(o&&e){o.position.fromArray(e.position);o.rotation.set(...e.rotation);o.scale.fromArray(e.scale);}}
      this.attach(); this.previewTransforms(g.ids);
    } catch(error) {this.cb.notify(error.message);}
  }
  tick(dt) {
    this.patrolGuide?.update();
    const g = this.gesture;
    if (g?.type !== "sculpt" || !this.hover) return;
    if (["cliff", "road"].includes(this.mode)) return;
    const brush = this.cb.brush(),
      region = this.cb.getRegion();
    const dirty = {};
    const sculpted =
      this.mode !== "paint" &&
      sculpt(
        g.working.world,
        region,
        this.hover.x,
        this.hover.z,
        brush.radius,
        brush.strength,
        Math.min(dt, 0.05),
        this.mode,
        dirty,
        g.level,
      );
    const painted =
      (this.mode === "paint" || brush.paintWithSculpt) &&
      paintTerrain(
        g.working.world,
        region,
        this.hover.x,
        this.hover.z,
        brush.radius,
        brush.material ?? 0,
      );
    if (sculpted || painted) {
      dirty.painted = painted;
      if (!sculpted) dirty.paintOnly = true;
      g.changed = true;
      this.view.updateTerrain(g.working.world, dirty);
      this.updateSpawn();
      this.updateCircle();
    }
  }
  previewWall(hit, final = false) {
    const g = this.gesture;
    if (g?.type !== "wall") return;
    const world = this.cb.getProject().world, raw = [hit.x,hit.z];
    if (g.settings.straight) {
      g.points = [g.points[0], wallEnd(world,g.points[0],raw,g.settings)];
    } else {
      const last = g.points.at(-1), end = wallEnd(world,last,raw,g.settings);
      if (Math.hypot(end[0]-last[0],end[1]-last[1]) >= (final ? .001 : .12) && g.points.length < WALL_POINT_LIMIT)
        g.points.push(end);
    }
    g.plan = planWall(world,g.points,g.settings,Math.max(0,20000-this.cb.getProject().entities.length));
    if (g.points.length >= WALL_POINT_LIMIT) g.plan.limited = true;
    const preview = this.wallPreview, transform = this.wallMatrix;
    preview.count = g.plan.segments.length;
    g.plan.segments.forEach((s,i) => {
      transform.position.set(s.x,s.base+s.height/2,s.z);
      transform.rotation.set(0,-s.angle,0); transform.scale.set(s.length,s.height,s.width);
      transform.updateMatrix(); preview.setMatrixAt(i,transform.matrix);
    });
    preview.instanceMatrix.needsUpdate = true; preview.visible = preview.count > 0;
    this.view.invalidate?.();
  }
  stampTerrain(hit, first = false) {
    const g=this.gesture, brush=this.cb.brush(), region=this.cb.getRegion();
    if(g?.type!=="sculpt"||!region)return;
    const world=g.working.world, dirty={}, step=world.size/world.terrain.resolution;
    let changed=false;
    if(this.mode==="cliff") {
      const spacing=Math.max(step,brush.radius*.4), last=g.lastStamp??[hit.x,hit.z];
      const dx=hit.x-last[0], dz=hit.z-last[1], distance=Math.hypot(dx,dz);
      if(first) {
        changed=raiseCliff(world,region,hit.x,hit.z,brush.radius,brush.strength,dirty);
        g.lastStamp=[hit.x,hit.z];
      } else for(let d=spacing;d<=distance;d+=spacing) {
        const x=last[0]+dx*d/distance,z=last[1]+dz*d/distance;
        changed=raiseCliff(world,region,x,z,brush.radius,brush.strength,dirty)||changed;
        g.lastStamp=[x,z];
      }
    } else {
      const from=g.lastRoad??[hit.x,hit.z,g.level],distance=Math.hypot(hit.x-from[0],hit.z-from[1]);
      if(!first&&distance<1e-6)return;
      const level=Math.max(-80,Math.min(80,from[2]+distance*(brush.roadGrade??0)/100));
      const to=[hit.x,hit.z,level];
      changed=carveRoad(world,region,from,to,Math.max(step*1.5,brush.radius),brush.roadMaterial??4,dirty);
      g.lastRoad=to;
    }
    if(changed) {
      g.changed=true;this.view.updateTerrain(world,dirty);this.updateSpawn();this.updateCircle();
    }
  }
  linePoints(line, points) {
    if (line.geometry.attributes.position?.count !== points.length) {
      line.geometry.dispose();
      line.geometry = new T.BufferGeometry().setFromPoints(points);
    } else {
      line.geometry.setFromPoints(points);
      line.geometry.computeBoundingSphere();
    }
    this.view.invalidate?.();
    line.visible = true;
  }
  rectangle(a, b) {
    const world = this.gesture?.working?.world ?? this.cb.getProject().world;
    const corners = [
      [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
      [Math.max(a[0], b[0]), Math.min(a[1], b[1])],
      [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
      [Math.min(a[0], b[0]), Math.max(a[1], b[1])],
    ];
    const points = [];
    for (let side = 0; side < 4; side++)
      for (let i = 0; i < 24; i++) {
        const from = corners[side],
          to = corners[(side + 1) % 4],
          x = from[0] + ((to[0] - from[0]) * i) / 24,
          z = from[1] + ((to[1] - from[1]) * i) / 24;
        points.push(new T.Vector3(x, heightAt(world, x, z) + 0.06, z));
      }
    this.linePoints(this.outline, points);
  }
  updateOutline() {
    const r = this.cb.getRegion();
    this.outline.visible =
      !this.view.playing &&
      Boolean(r) &&
      ["area", ...brushModes].includes(this.mode);
    if (this.outline.visible) this.rectangle(r.min, r.max);
  }
  updateCircle() {
    if (!this.hover) {
      this.circle.visible = false;
      return;
    }
    const world = this.gesture?.working?.world ?? this.cb.getProject().world,
      r = this.mode === "wall" ? wallOptions(this.cb.wallBrush?.()).width/2 : this.mode === "patrol" ? .6 : this.mode === "road" ? Math.max(this.cb.brush().radius, world.size/(world.terrain?.resolution??128)*1.5) : this.cb.brush().radius;
    const points = [];
    for (let i = 0; i < 64; i++) {
      const angle = (i / 64) * Math.PI * 2,
        x = this.hover.x + Math.cos(angle) * r,
        z = this.hover.z + Math.sin(angle) * r;
      points.push(new T.Vector3(x, heightAt(world, x, z) + 0.08, z));
    }
    this.circle.material.color.set(
      this.mode === "lower"
        ? "#e99b82"
        : this.mode === "smooth"
          ? "#b0d5fa"
          : "#ead69a",
    );
    this.linePoints(this.circle, points);
  }
  cancel() {
    if (
      this.capturedPointer !== undefined &&
      this.canvas.hasPointerCapture(this.capturedPointer)
    )
      this.canvas.releasePointerCapture(this.capturedPointer);
    this.capturedPointer = undefined;
    this.restoring = true;
    if (this.gizmo.dragging) {
      this.gizmo.reset();
      this.gizmo.dragging = false;
    }
    const g = this.gesture;
    if (g?.type === "drag" || g?.type === "gizmo") this.restoreTransforms(g);
    this.marquee.hidden=true;
    if (g?.type === "sculpt")
      this.view.updateTerrain(this.cb.getProject().world);
    this.gesture = null;
    this.wallPreview.visible = false;
    this.spawnPreview.visible = false;
    this.updateSpawn();
    this.clearGhost();
    if (this.mode === "place") {
      this.mode = "move";
      this.canvas.style.cursor = "default";
      this.cb.modeChanged("move");
    }
    this.circle.visible = false;
    this.cb.gestureChanged(false);
    this.view.orbit.enabled = !this.view.playing;
    this.restoring = false;
    this.attach();
    this.updateOutline();
  }
  playChanged() {
    this.cancel();
    this.setMode("move");
    this.attach();
    this.outline.visible = false;
  }
}
