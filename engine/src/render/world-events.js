import { moonBound, eventEntityPresent } from "../core/moon-land.js";
import * as T from "three";
import {
  actorPresent,
  doorShouldOpen,
  updateWorldEvents,
} from "../core/world-events.js";

export class WorldEvents {
  constructor(view, project, game) {
    this.view = view;
    this.project = project;
    this.game = game;
    this.time = 0;
    this.moonEntities = project.entities.filter(e => moonBound(e, project.world));
    this.actors = project.entities.filter((e) => e.spawn?.enabled || this.moonEntities.includes(e));
    this.doors = project.entities
      .filter((e) => e.moonDoor)
      .map((e) => {
        const object = view.objects.get(e.id),
          materials = [],
          uniform = { value: 0 };
        object.traverse((n) => {
          if (!n.isMesh) return;
          const original = n.material;
          const adapt = (source) => {
            const m = source.clone();
            m.onBeforeCompile = (shader) => {
              shader.uniforms.moonDissolve = uniform;
              shader.vertexShader =
                "varying vec3 vMoonPosition;\n" +
                shader.vertexShader.replace(
                  "#include <begin_vertex>",
                  "#include <begin_vertex>\nvMoonPosition=position;",
                );
              shader.fragmentShader =
                "varying vec3 vMoonPosition; uniform float moonDissolve;\n" +
                shader.fragmentShader.replace(
                  "#include <emissivemap_fragment>",
                  `#include <emissivemap_fragment>
              if(moonDissolve > 0.001) {
                float grain=fract(sin(dot(floor(vMoonPosition*44.),vec3(12.9898,78.233,36.17)))*43758.5453);
                float veil=grain*.42 + clamp(vMoonPosition.y+.5,0.,1.)*.58;
                if(veil < moonDissolve) discard;
                float edge=1.-smoothstep(0.,.12,veil-moonDissolve);
                totalEmissiveRadiance += vec3(2.5,.12,.025)*edge;
              }`,
                );
            };
            m.customProgramCacheKey = () => "hearth-moon-dissolve-v1";
            return m;
          };
          n.material = Array.isArray(original)
            ? original.map(adapt)
            : adapt(original);
          materials.push({ n, original });
        });
        const bounds = new T.Box3().setFromObject(object),
          center = bounds.getCenter(new T.Vector3());
        const light = new T.PointLight("#ff382b", 0, 15, 2);
        light.position.copy(center).add(new T.Vector3(0, 1, 2));
        view.scene?.add(light);
        const points = [];
        for (let i = 0; i < 90; i++)
          points.push(
            Math.sin(i * 23.17) * e.scale[0] * 0.65,
            Math.cos(i * 7.21) * e.scale[1] * 0.6,
            Math.sin(i * 13.4) * 1.2,
          );
        const geo = new T.BufferGeometry();
        geo.setAttribute("position", new T.Float32BufferAttribute(points, 3));
        const dust = new T.Points(
          geo,
          new T.PointsMaterial({
            color: "#ff7752",
            size: 0.065,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: T.AdditiveBlending,
          }),
        );
        dust.position.copy(center);
        view.scene?.add(dust);
        return {
          e,
          object,
          uniform,
          materials,
          light,
          dust,
          bounds,
          passable: null,
          center,
        };
      });
    this.sync(true);
  }
  sync(restore = false) {
    updateWorldEvents(this.game);
    this.view.redMoonActive = !!this.game.state.events.moonActive;
    if (this.terrainRevision !== this.game.terrainRevision) {
      this.terrainRevision = this.game.terrainRevision;
      this.view.updateTerrain?.(this.game.project.world, this.game.terrainDirty);
    }
    for (const e of this.actors) {
      const o = this.view.objects.get(e.id);
      if (!o) continue;
      const visible = e.kind === "item"
        ? eventEntityPresent(e, this.project.world, this.game.state) && !this.game.state.inventory.includes(e.id) && (!e.itemOwner || !!this.game.state.droppedItems[e.id])
        : actorPresent(e, this.game);
      const changed=o.visible !== visible;
      if (changed) {
        o.visible = visible;
        if (visible && ["enemy", "npc"].includes(e.kind) && !this.game.state.defeated.includes(e.id))
          o.position.set(...e.position);
        this.view.invalidate?.(true);
      }
      // Solid NPCs must not leave invisible obstacles behind.
      if(changed||restore){for(const b of this.view.boxes??[])if(b.entityId===e.id)b.disabled=!visible;this.view.refreshColliders?.(e.id);}
    }
    for (const u of this.doors) {
      this.game.state.events.doors[u.e.id] ??= 0;
      if (restore) this.applyDoor(u, this.game.state.events.doors[u.e.id]);
    }
  }
  applyDoor(u, p) {
    u.uniform.value = p;
    u.object.visible = p < 1;
    const passable = p >= 0.999;
    if (u.passable !== passable) {
      u.passable = passable;
      for (const b of this.view.boxes ?? [])
        if (b.entityId === u.e.id) b.disabled = passable;
      this.view.refreshColliders?.(u.e.id);
    }
    const active = this.game.state.events.moonActive;
    u.light.intensity = active ? 10 * (0.45 + 0.55 * Math.sin(Math.PI * p)) : 0;
    u.dust.material.opacity = p > 0 && p < 1 ? 0.75 * Math.sin(Math.PI * p) : 0;
    u.dust.visible = u.dust.material.opacity > 0;
  }
  update(dt, position) {
    this.time += dt;
    this.sync();
    const player = position?.toArray?.() ?? this.game.state.position;
    for (const u of this.doors) {
      let open = doorShouldOpen(u.e, this.game, player),
        p = this.game.state.events.doors[u.e.id];
      if (
        !open &&
        p > 0.01 &&
        u.bounds
          .clone()
          .expandByScalar(0.65)
          .containsPoint(new T.Vector3(player[0], player[1] - 1, player[2]))
      )
        open = true;
      const target = open ? 1 : 0;
      p +=
        Math.sign(target - p) *
        Math.min(Math.abs(target - p), dt / u.e.moonDoor.duration);
      this.game.state.events.doors[u.e.id] = p;
      this.applyDoor(u, p);
      u.dust.rotation.z = Math.sin(this.time * 0.35) * 0.12;
      u.dust.position.y = u.center.y + Math.sin(this.time * 0.8) * 0.3;
    }
  }
  dispose() {
    for (const e of this.actors) {
      const o = this.view.objects.get(e.id);
      if (o) o.visible = true;
      for (const b of this.view.boxes ?? [])
        if (b.entityId === e.id) b.disabled = false;
      this.view.refreshColliders?.(e.id);
    }
    for (const u of this.doors) {
      u.object.visible = true;
      for (const { n, original } of u.materials) {
        for (const m of Array.isArray(n.material) ? n.material : [n.material])
          m.dispose();
        n.material = original;
      }
      for (const b of this.view.boxes ?? [])
        if (b.entityId === u.e.id) b.disabled = false;
      this.view.refreshColliders?.(u.e.id);
      u.light.removeFromParent();
      u.light.dispose();
      u.dust.removeFromParent();
      u.dust.geometry.dispose();
      u.dust.material.dispose();
    }
    if (this.project.world.moonLand) this.view.updateTerrain?.(this.game.sourceWorld);
    this.view.redMoonActive = false;
  }
}
