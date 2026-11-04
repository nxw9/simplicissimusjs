import { Projectiles } from "./projectiles.js";
import { patrolDestination } from "../core/patrol.js";
import { actorPresent } from "../core/world-events.js";
import { behaviorConfig, reactionTo } from "../core/equipment.js";
import * as T from "three";
import { enemyClip, clipFits } from "./enemy-clips.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { enemyConfig, suggestClips } from "../core/enemy.js";
import { moveGrounded, heightAt } from "../core/terrain.js";
export class EnemyController {
  constructor(view, project, game) {
    this.view = view;
    this.project = project;
    this.game = game;
    this.projectiles = new Projectiles(view, game);
    this.projectiles.onChange = () => this.onChange?.();
    this.units = project.entities
      .filter(
        (e) => ["enemy", "npc"].includes(e.kind) && view.objects.has(e.id),
      )
      .map((e) => {
        const object = view.objects.get(e.id);
        object.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(object);
        const visual = new T.Group();
        for (const child of [...object.children]) visual.add(child);
        object.add(visual);
        const u = {
          visual,
          hitSize: box.getSize(new T.Vector3()),
          behavior: behaviorConfig(e),
          home: object.position.clone(),
          corpse: null,
          deathTime: null,
          e,
          object,
          config: {
            ...enemyConfig(e),
            ...(!e.enemy
              ? suggestClips(object.userData[e.kind + "Clips"] ?? [])
              : {}),
          },
          offset: object.position.y - box.min.y,
          time: 0,
          cooldown: 0,
          attack: null,
          state: null,
          patrolState: {},
          mixer: null,
          action: null,
        };
        const model = object.userData[e.kind + "Model"],
          clips = object.userData[e.kind + "Clips"];
        if (model) {
          u.mixer = new T.AnimationMixer(model);
          u.clips = clips;
        }
        u.model = model;
        return u;
      });
  }
  chooseTargets(player) {
    this.byId = new Map(this.units.map((u) => [u.e.id, u]));
    const buckets = new Map(),
      size = 12;
    for (const u of this.units) {
      if (this.game.collected(u.e.id) || !actorPresent(u.e, this.game))
        continue;
      const key = `${Math.floor(u.object.position.x / size)},${Math.floor(u.object.position.z / size)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(u);
    }
    for (const u of this.units) {
      const previous = u.target;
      u.target = null;
      u.flee = false;
      if (this.game.collected(u.e.id) || !actorPresent(u.e, this.game))
        continue;
      const b = u.behavior,
        p = u.object.position,
        notice = u.config.notice;
      const nearby = [];
      for (
        let x = Math.floor((p.x - notice) / size);
        x <= Math.floor((p.x + notice) / size);
        x++
      )
        for (
          let z = Math.floor((p.z - notice) / size);
          z <= Math.floor((p.z + notice) / size);
          z++
        )
          nearby.push(...(buckets.get(`${x},${z}`) ?? []));
      let attacker = this.game.state.aggression[u.e.id];
      if (!attacker && b.assist) {
        const ally = nearby.find(
          (v) =>
            v !== u &&
            v.behavior.faction === b.faction &&
            this.game.state.aggression[v.e.id],
        );
        if (ally) attacker = this.game.state.aggression[ally.e.id];
      }
      const threatened =
        attacker === "$player"
          ? player
          : this.byId.get(attacker)?.object.position;
      if (
        threatened &&
        (attacker === "$player" ||
          (this.byId.get(attacker) &&
            actorPresent(this.byId.get(attacker).e, this.game) &&
            !this.game.collected(attacker))) &&
        p.distanceTo(threatened) <= notice &&
        b.reaction !== "ignore"
      ) {
        u.target = attacker;
        u.flee = b.reaction === "flee";
      } else {
        let best = Infinity;
        if (u.e.kind === "enemy" && p.distanceTo(player) <= notice) {
          u.target = "$player";
          best = p.distanceTo(player);
        }
        for (const other of nearby) {
          if (other === u) continue;
          const response = reactionTo(u.e, other.e),
            d = p.distanceTo(other.object.position);
          if (
            response !== "ignore" &&
            d <= notice &&
            d < best &&
            this.visible(
              u,
              other.object.position.clone().add(new T.Vector3(0, 1, 0)),
            )
          ) {
            best = d;
            u.target = other.e.id;
            u.flee = response === "flee";
          }
        }
      }
      if (u.target) u.destination = null;
      else if (!u.e.patrol?.enabled && b.routine === "wander") {
        if (!u.destination || p.distanceTo(u.destination) < 0.8) {
          const phase = (u.wanderStep = (u.wanderStep ?? 0) + 1) * 2.4;
          u.destination = u.home
            .clone()
            .add(
              new T.Vector3(
                Math.cos(phase) * b.radius,
                0,
                Math.sin(phase) * b.radius,
              ),
            );
        }
      }
      if (previous !== u.target || u.flee) u.attack = null;
    }
  }
  visible(u, player) {
    const origin = u.object.position.clone();
    origin.y = heightAt(this.project.world, origin.x, origin.z) + 1.2;
    const delta = player.clone().sub(origin),
      distance = delta.length();
    if (distance < 1e-6) return true;
    const ray = new T.Ray(origin, delta.divideScalar(distance)),
      point = new T.Vector3();
    for (const box of this.view.boxes ?? [])
      if (
        !box.disabled && box.entityId !== u.e.id &&
        ray.intersectBox(box, point) &&
        point.distanceTo(origin) < distance - 0.05
      )
        return false;
    return !this.view.terrainHit?.(ray, distance - 0.05);
  }
  state(u, name) {
    if (u.state === name) return;
    u.state = name;
    u.object.userData.aiState = name;
    const candidate = enemyClip(u.config, name, u.clips, this.view.assetModels);
    const clip =
      !(u.e.kind === "npc" && name === "idle") &&
      candidate &&
      (!u.config.animationSources?.[name] || clipFits(candidate, u.model))
        ? candidate
        : null;
    if (u.mixer) {
      u.action?.fadeOut(0.12);
      if (clip) {
        const action = u.mixer.clipAction(clip);
        action
          .reset()
          .setEffectiveWeight(1)
          .setEffectiveTimeScale(
            name === "attack" ? clip.duration / u.config.duration : 1,
          )
          .setLoop(
            ["attack", "death"].includes(name) ? T.LoopOnce : T.LoopRepeat,
            Infinity,
          );
        action.clampWhenFinished = ["attack", "death"].includes(name);
        action.fadeIn(0.12).play();
        u.action = action;
      } else u.action = null;
    }
  }
  beginDeath(u, restore = false) {
    if (u.deathTime !== null) return;
    const saved = this.game.state.corpses[u.e.id];
    if (restore && saved) {
      u.object.position.set(...saved.position);
      u.object.rotation.set(...saved.rotation);
    }
    this.game.state.corpses[u.e.id] = {
      position: u.object.position.toArray(),
      rotation: [u.object.rotation.x, u.object.rotation.y, u.object.rotation.z],
    };
    u.object.visible = true;
    u.object.userData.defeated = true;
    u.attack = null;
    u.deathTime = 0;
    u.deathDuration =
      enemyClip(u.config, "death", u.clips, this.view.assetModels)?.duration ||
      1;
    this.state(u, "death");
    // Reconstruct the final corpse on load, never replay a kill or quest reward.
    if (restore) this.advanceDeath(u, u.deathDuration);
  }
  advanceDeath(u, dt) {
    if (u.deathTime >= u.deathDuration) return;
    const delta = Math.min(dt, u.deathDuration - u.deathTime);
    u.deathTime += delta;
    const p = Math.min(1, u.deathTime / u.deathDuration);
    u.mixer?.update(delta);
    if (!u.action) {
      (u.object.userData.enemyPose ?? u.object.userData.npcPose)?.("idle", 0);
      u.visual.rotation.x = (-Math.PI / 2) * p * p * (3 - 2 * p);
      u.visual.position.y = 0.2 * p;
    }
    if (p === 1) {
      const gltf = this.view.assetModels?.get(u.config.corpseAssetId);
      if (gltf) {
        const corpse = clone(gltf.scene);
        corpse.rotation.y += u.config.corpseFacing;
        corpse.scale.multiplyScalar(u.config.corpseScale);
        corpse.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(corpse);
        corpse.position.sub(
          new T.Vector3(
            (bounds.min.x + bounds.max.x) / 2,
            bounds.min.y,
            (bounds.min.z + bounds.max.z) / 2,
          ),
        );
        corpse.traverse((o) => {
          o.userData.id = u.e.id;
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        u.visual.visible = false;
        u.object.add(corpse);
        u.corpse = corpse;
        u.object.position.y = heightAt(
          this.project.world,
          u.object.position.x,
          u.object.position.z,
        );
      } else if (!u.action) {
        u.object.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(u.object);
        u.object.position.y +=
          heightAt(
            this.project.world,
            u.object.position.x,
            u.object.position.z,
          ) - bounds.min.y;
      }
    }
    u.object.updateMatrixWorld(true);
    this.view.invalidate?.(true);
  }
  syncDeaths(restore = false) {
    for (const u of this.units)
      if (this.game.collected(u.e.id) && actorPresent(u.e, this.game)) this.beginDeath(u, restore);
      else if (!actorPresent(u.e, this.game)) u.object.visible = false;
  }
  update(dt, player) {
    this.thinkTime = (this.thinkTime ?? 0) - dt;
    if (this.thinkTime <= 0) {
      this.chooseTargets(player);
      this.thinkTime = 0.3;
    }
    let damage = false,
      moving = false;
    for (const u of this.units) {
      if (this.game.collected(u.e.id)) {
        if (!actorPresent(u.e, this.game)) { u.object.visible = false; continue; }
        this.beginDeath(u);
        this.advanceDeath(u, dt);
        continue;
      }
      if (!actorPresent(u.e, this.game)) {
        u.target = null;
        u.attack = null;
        u.destination = null;
        continue;
      }
      if (!this.game.alive) {
        this.state(u, "idle");
        continue;
      }
      const { object: o, config: c } = u;
      u.time += dt;
      u.cooldown = Math.max(0, u.cooldown - dt);
      const targetUnit =
        u.target && u.target !== "$player" ? this.byId.get(u.target) : null;
      if (
        targetUnit &&
        (this.game.collected(targetUnit.e.id) ||
          !actorPresent(targetUnit.e, this.game))
      ) {
        u.target = null;
        u.attack = null;
      }
      if (!u.target && u.e.patrol?.enabled) {
        const waypoint = patrolDestination(u.e.patrol, u.patrolState, o.position, dt);
        u.destination = waypoint ? new T.Vector3(waypoint[0], heightAt(this.project.world, waypoint[0], waypoint[1]), waypoint[1]) : null;
      }
      const target =
        u.target === "$player"
          ? player
          : targetUnit && u.target
            ? targetUnit.object.position
                .clone()
                .setY(
                  heightAt(
                    this.project.world,
                    targetUnit.object.position.x,
                    targetUnit.object.position.z,
                  ) + 1.7,
                )
            : u.destination;
      if (!target) {
        u.attack = null;
        this.state(u, "idle");
        (u.object.userData.enemyPose ?? u.object.userData.npcPose)?.(
          "idle",
          u.time,
        );
        u.mixer?.update(dt);
        continue;
      }
      const dx = target.x - o.position.x,
        dz = target.z - o.position.z,
        distance = Math.hypot(dx, dz);
      const reachable = () =>
        distance <= (c.ranged?.range ?? c.reach) &&
        (c.ranged || Math.abs(
          target.y -
            (heightAt(this.project.world, o.position.x, o.position.z) + 1.7),
        ) < 1.5) &&
        this.visible(u, target);
      if (u.attack !== null) {
        const old = u.attack;
        u.attack += dt;
        if (
          old < c.duration * c.impact &&
          u.attack >= c.duration * c.impact &&
          reachable()
        ) {
          if (c.ranged) {
            this.projectiles.fire(u, target.clone().add(new T.Vector3(0, -0.65, 0)));
          } else if (u.target === "$player") {
            this.game.damage(c.damage);
            damage = true;
          } else if (targetUnit) {
            this.game.hit(targetUnit.e.id, c.damage, u.e.id);
            this.onChange?.();
          }
        }
        if (u.attack >= c.duration) {
          u.attack = null;
          this.state(u, "idle");
        }
      } else if (
        (u.destination || distance <= c.notice) &&
        (u.destination || this.visible(u, target))
      ) {
        o.rotation.y = Math.atan2(dx, dz);
        const retreat = !!c.ranged && !!u.target && distance < c.ranged.preferredDistance * 0.65;
        if (reachable() && u.target && !u.flee && !retreat) {
          if (u.cooldown === 0) {
            u.attack = 0;
            this.onAttack?.(u.e.id);
            u.cooldown = Math.max(c.cooldown, c.duration);
            this.state(u, "attack");
          } else this.state(u, "idle");
        } else {
          const feet = heightAt(this.project.world, o.position.x, o.position.z),
            step = Math.min(
              c.speed * dt,
              (u.flee || retreat)
                ? c.speed * dt
                : Math.max(
                    0,
                    distance - (u.destination ? 0.25 : c.ranged?.preferredDistance ?? c.reach * 0.85),
                  ),
            );
          const p = moveGrounded(
            this.project.world,
            [o.position.x, feet + 1.7, o.position.z],
            (dx / Math.max(distance, 0.001)) * step * (u.flee || retreat ? -1 : 1),
            (dz / Math.max(distance, 0.001)) * step * (u.flee || retreat ? -1 : 1),
            (x, z, y) =>
              (this.view.boxes ?? []).some(
                (b) =>
                  !b.disabled && b.entityId !== u.e.id &&
                  b.max.y > y + 0.1 &&
                  b.min.y < y + 1.8 &&
                  x > b.min.x - 0.32 &&
                  x < b.max.x + 0.32 &&
                  z > b.min.z - 0.32 &&
                  z < b.max.z + 0.32,
              ),
          );
          const moved =
            Math.hypot(p[0] - o.position.x, p[2] - o.position.z) > 0.0001;
          o.position.set(p[0], p[1] - 1.7 + u.offset, p[2]);
          if (u.flee) o.rotation.y += Math.PI;
          this.state(u, moved ? "walk" : "idle");
          moving ||= moved;
        }
      } else this.state(u, "idle");
      if (!(u.e.kind === "npc" && u.state === "idle")) u.mixer?.update(dt);
      (o.userData.enemyPose ?? o.userData.npcPose)?.(
        u.state,
        u.time,
        u.attack === null ? 0 : u.attack / c.duration,
      );
      o.updateMatrixWorld(true);
      moving ||= u.attack !== null;
    }
    if (moving) {
      this.shadowElapsed = (this.shadowElapsed ?? 0) + dt;
      const shadows = this.shadowElapsed >= 0.1;
      if (shadows) this.shadowElapsed = 0;
      this.view.invalidate?.(shadows);
    }
    return this.projectiles.update(dt, player, this.units) || damage;
  }
  reset() {
    this.projectiles.reset();
    for (const u of this.units) {
      if (u.corpse) u.object.remove(u.corpse);
      u.corpse = null;
      u.deathTime = null;
      u.visual.visible = true;
      u.visual.rotation.set(0, 0, 0);
      u.visual.position.set(0, 0, 0);
      u.object.visible = true;
      delete u.object.userData.defeated;
      delete u.object.userData.aiState;
      u.target = null;
      u.destination = null;
      u.patrolState = {};
      u.action = null;
      u.attack = null;
      u.cooldown = 0;
      u.mixer?.stopAllAction();
      u.state = null;
      u.object.position.set(...u.e.position);
      u.object.rotation.set(...u.e.rotation);
      (u.object.userData.enemyPose ?? u.object.userData.npcPose)?.("idle", 0);
      u.object.updateMatrixWorld(true);
    }
    this.view.invalidate?.(true);
  }
  dispose() {
    this.reset();
    this.projectiles.dispose();
    for (const u of this.units) {
      u.model && u.mixer?.uncacheRoot(u.model);
      for (const child of [...u.visual.children]) u.object.add(child);
      u.object.remove(u.visual);
    }
  }
}
