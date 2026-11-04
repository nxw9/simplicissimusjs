import * as T from "three";
import { mountConfig, mountEyeOffset } from "../core/mount.js";
import { MountAnimation } from "./mount.js";
import { actorPresent } from "../core/world-events.js";
import { heightAt } from "../core/terrain.js";
import { shipPosition, dryAt, collectionBlocked } from "../core/rpg.js";
import { waterMaterial } from "./water.js";
export function waterObjects(project) {
  const group = new T.Group();
  if (!project.rpg) return group;
  const c = project.rpg.water,
    [x0, z0, x1, z1] = c.dry,
    half = project.world.size * 2;
  const mat = waterMaterial(project);
  for (const [a, b, d, e] of [
    [-half, -half, x0, half],
    [x1, -half, half, half],
    [x0, -half, x1, z0],
    [x0, z1, x1, half],
  ]) {
    const mesh = new T.Mesh(new T.PlaneGeometry(d - a, e - b), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((a + d) / 2, c.height, (b + e) / 2);
    group.add(mesh);
  }
  return group;
}
export class RPGController {
  constructor(s) {
    this.s = s;
    this.c = s.project.rpg;
    this.ui = document.createElement("div");
    this.ui.className = "rpg-hud";
    s.ui.append(this.ui);
    this.panel = document.createElement("section");
    this.panel.className = "rpg-panel";
    this.panel.hidden = true;
    s.host.append(this.panel);
    this.down = (e) => {
      if (e.button === 2 && s.controlsActive() && !this.state.mounted) {
        this.blocking = true;
        e.preventDefault();
      }
    };
    this.up = (e) => {
      if (e.button === 2) this.blocking = false;
    };
    this.context = (e) => e.preventDefault();
    s.view.renderer.domElement.addEventListener("pointerdown", this.down);
    window.addEventListener("pointerup", this.up);
    s.view.renderer.domElement.addEventListener("contextmenu", this.context);
    const controls = document.createElement("div");
    controls.className = "rpg-buttons";
    s.ui.append(controls);
    this.buttons = controls;
    for (const [text, fn] of [
      ["Q · Настой", () => this.drink()],
      ["J · Журнал", () => this.journal()],
      [
        "Блок",
        () => {
          this.blocking = !this.blocking;
        },
      ],
    ]) {
      const b = document.createElement("button");
      b.textContent = text;
      b.onclick = fn;
      controls.append(b);
    }
    this.mount = mountConfig(s.project);
    const horse = s.view.objects.get(this.c.services.horse);
    if (this.c.mount) this.mountAnimation = new MountAnimation(horse.userData.mountModel, horse.userData.mountClips, this.mount);
    this.restore();
    this.sync();
  }
  get state() {
    return this.s.game.state.rpg;
  }
  get eyeOffset() { return mountEyeOffset(this.mount, this.state.horseYaw); }
  get movementOffset() { const v = this.state.mounted ? this.eyeOffset : [0, 1.7, 0]; return [v[0], v[1] - 1.7, v[2]]; }
  key(e) {
    if (e.repeat) return false;
    const s = this.s;
    if (e.code === "Escape" && !this.panel.hidden) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
      return true;
    }
    if (e.code === "KeyJ") {
      e.preventDefault();
      this.panel.hidden ? this.journal() : this.close();
      return true;
    }
    if (e.code === "KeyQ" && !s.dialogOpen) {
      this.drink();
      return true;
    }
    if (e.code === "F5") {
      e.preventDefault();
      this.quickSave();
      return true;
    }
    if (e.code === "F9") {
      e.preventDefault();
      try {
        const raw = localStorage.getItem("hearth-quick:" + s.project.id);
        if (raw) s.load(raw);
        else s.notify("Быстрого сохранения пока нет");
      } catch (e) {
        s.notify(e.message);
      }
      return true;
    }
    return false;
  }
  quickSave() {
    try {
      localStorage.setItem(
        "hearth-quick:" + this.s.project.id,
        this.s.game.save(),
      );
      this.s.notify("Быстрое сохранение записано");
    } catch {
      this.s.notify("Память недоступна. Скачайте сейв через меню.");
    }
  }
  drink() {
    if (this.s.paused || this.s.dialogOpen) return;
    this.s.notify(
      this.s.game.drink()
        ? "Настой восстановил здоровье"
        : "Настой не нужен или запасы закончились",
    );
    this.s.sync();
  }
  attack() {
    if (this.state.mounted) {
      this.s.notify("Для боя спешьтесь · E");
      return false;
    }
    if (this.state.stamina < 24 || this.blocking) return false;
    this.state.stamina -= 24;
    return true;
  }
  interact(id) {
    const s = this.s,
      c = this.c;
    if (this.state.mounted) {
      this.dismount();
      return true;
    }
    if (id === c.services.rest) {
      s.game.rest();
      s.sync();
      this.quickSave();
      s.notify(
        "Отдых: здоровье и выносливость восстановлены, минимум 2 настоя",
      );
      return true;
    }
    if (id === c.services.horse) {
      const entity = s.project.entities.find(e => e.id === id);
      if (!actorPresent(entity, s.game)) return false;
      this.state.mounted = true;
      this.state.horseYaw = (s.yaw ?? 0) + Math.PI;
      this.blocking = false;
      s.view.camera.position
        .copy(s.view.objects.get(id).position)
        .add(new T.Vector3(...this.eyeOffset));
      s.game.state.position = s.view.camera.position.toArray();
      s.motion = { velocity: 0, grounded: true };
      this.sync();
      return true;
    }
    if (id === c.ship.entity) {
      if (!s.game.state.quests[c.ship.quest])
        s.notify("Сначала примите поручение Левана");
      else if (!this.onDeck())
        s.notify("Поднимитесь на палубу, посмотрите под ноги и нажмите E");
      else if (this.state.shipMoving)
        s.notify("Корабль в пути. Можно ходить по палубе");
      else {
        this.state.shipMoving = true;
        this.state.shipDirection = this.state.shipProgress > 0.5 ? -1 : 1;
        s.notify("Отходим. Оставайтесь на палубе");
      }
      return true;
    }
    const blocked = collectionBlocked(s.project, s.game.state, id);
    if (blocked) {
      s.notify(blocked);
      return true;
    }
    return false;
  }
  services(container, npc) {
    const s = this.s,
      button = (label, fn) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.onclick = () => {
          s.notify(
            fn() ? "Готово" : "Недостаточно монет или действие недоступно",
          );
          s.sync();
          s.showDialogue();
        };
        container.append(b);
      };
    if (npc === this.c.services.healer)
      button(`Купить настой · ${this.c.potionCost} монет`, () =>
        s.game.buyPotion(),
      );
    if (npc === this.c.services.smith) {
      const price = this.c.upgradeCosts[this.state.upgrade];
      if (price !== undefined)
        button(`Закалить меч · +12 урона · ${price} монет`, () =>
          s.game.upgradeWeapon(),
        );
    }
  }
  onDeck() {
    const p = this.s.view.camera.position,
      b = shipPosition(this.s.project, this.state),
      c = this.c.ship;
    return (
      Math.abs(p.x - b[0]) < c.halfWidth &&
      Math.abs(p.z - b[2]) < c.halfLength &&
      p.y > b[1] + c.deckHeight + 0.5 &&
      p.y < b[1] + c.deckHeight + 5
    );
  }
  beforeMove(dt, moving, sprint) {
    const s = this.s,
      r = this.state,
      c = this.c,
      cam = s.view.camera;
    s.game.guarding = this.blocking && !r.mounted && r.stamina > 5;
    r.stamina = Math.max(
      0,
      Math.min(
        100,
        r.stamina +
          (sprint && moving && !r.mounted && !s.game.guarding && r.stamina > 0
            ? -22
            : 19) *
            dt,
      ),
    );
    if (r.shipMoving) {
      const old = shipPosition(s.project, r),
        aboard = this.onDeck();
      r.shipProgress = T.MathUtils.clamp(
        r.shipProgress + (dt / c.ship.duration) * r.shipDirection,
        0,
        1,
      );
      const next = shipPosition(s.project, r);
      this.setShip(next);
      if (aboard) {
        cam.position.x += next[0] - old[0];
        cam.position.z += next[2] - old[2];
      }
      if (r.shipProgress === 0 || r.shipProgress === 1) {
        r.shipMoving = false;
        s.notify("Прибыли. Сойдите на берег по причалу");
      }
    }
    if (s.weapon) s.weapon.pivot.visible = !r.mounted;
    if (r.mounted) {
      const old = this.eyeOffset;
      r.horseYaw = (s.yaw ?? 0) + Math.PI;
      const next = this.eyeOffset;
      cam.position.x += next[0] - old[0]; cam.position.z += next[2] - old[2];
    }
    this.mountAnimation?.update(dt, r.mounted && moving, sprint);
    if (r.mounted || this.mountAnimation?.action) this.s.view.invalidate?.(true);
    this.sync();
    return r.mounted
      ? sprint
        ? this.mount.sprint
        : this.mount.speed
      : s.game.guarding
        ? 1.8
        : sprint && r.stamina > 5
          ? 6.4
          : 3.7;
  }
  afterMove() {
    const s = this.s,
      p = s.view.camera.position,
      r = this.state;
    if (r.mounted) {
      const offset = this.eyeOffset;
      r.horsePosition = [p.x - offset[0], p.y - offset[1], p.z - offset[2]];
      this.positionMount();
    }
    if (!dryAt(s.project, p.x, p.z) && p.y - 1.7 < this.c.water.height - 0.65) {
      s.game.damage(10000);
      s.sync();
      s.menu.open("dead");
    }
  }
  dismount() {
    const s = this.s,
      p = s.view.camera.position;
    for (const [dx, dz] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]) {
      const x = p.x + dx,
        z = p.z + dz,
        y = heightAt(s.project.world, x, z);
      if (y < this.c.water.height || s.view.blocked(x, z, y)) continue;
      this.state.mounted = false;
      p.set(x, y + 1.7, z);
      s.game.state.position = p.toArray();
      s.motion = { velocity: 0, grounded: true };
      this.restore();
      s.sync();
      return;
    }
    s.notify("Рядом нет свободного места для спешивания");
  }
  setShip(pos) {
    const o = this.s.view.objects.get(this.c.ship.entity);
    o.position.set(...pos);
    o.updateMatrixWorld(true);
    this.s.view.refreshColliders(this.c.ship.entity);
    this.s.view.invalidate(true);
  }
  restore() {
    this.blocking = false;
    this.s.game.guarding = false;
    this.setShip(shipPosition(this.s.project, this.state));
    this.positionMount();
    if (this.state.mounted) {
      this.s.view.camera.position.set(...this.state.horsePosition).add(new T.Vector3(...this.eyeOffset));
      this.s.game.state.position = this.s.view.camera.position.toArray();
    }
    this.panel.hidden = true;
  }
  positionMount() {
    const h = this.s.view.objects.get(this.c.services.horse);
    h.position.set(...this.state.horsePosition); h.rotation.y = this.state.horseYaw;
    h.updateMatrixWorld(true);
  }
  sync() {
    const r = this.state,
      g = this.s.game;
    this.ui.textContent = `Ур. ${r.level} · опыт ${r.xp}/${r.level * 70} | Выносливость ${Math.round(r.stamina)} | Настои ${r.potions} | Урон ${g.attackDamage}${g.guarding ? " · БЛОК" : ""}${r.mounted ? " · ВЕРХОМ · E спешиться" : ""}${r.shipMoving ? " · В МОРЕ" : ""}`;
    const entity = this.s.project.entities.find(e => e.id === this.c.services.horse);
    this.s.view.objects.get(entity.id).visible = actorPresent(entity, g) && (!r.mounted || this.mount.showWhileRiding);
  }
  close() {
    this.panel.hidden = true;
    this.s.dialogOpen = false;
    this.s.keys.clear();
    this.s.lock();
  }
  journal() {
    const s = this.s;
    if (s.paused || (s.dialogOpen && this.panel.hidden)) return;
    this.panel.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = `${s.project.title} · журнал`;
    this.panel.append(title);
    for (const q of s.project.quests) {
      const status = s.game.state.quests[q.id];
      if (!status) continue;
      const row = document.createElement("p"),
        p = s.game.questProgress(q);
      row.textContent = `${status === "complete" ? "✓" : "◇"} ${q.title} — ${status === "complete" ? "завершено" : `${p.done}/${p.total}${p.ready ? " · вернитесь к заказчику" : ""}`}`;
      this.panel.append(row);
    }
    const hint = document.createElement("p");
    hint.textContent =
      "Север: цитадель. Запад: волки и склеп. Восток: Леван и причал. Форт — на острове. Костёр восстанавливает силы. ПКМ — блок, Q — настой, I — экипировка, F5/F9 — быстрый сейв/загрузка.";
    this.panel.append(hint);
    const b = document.createElement("button");
    b.textContent = "Вернуться · J";
    b.onclick = () => this.close();
    this.panel.append(b);
    this.panel.hidden = false;
    s.dialogOpen = true;
    s.keys.clear();
    document.exitPointerLock?.();
  }
  respawn() {
    const s = this.s,
      g = s.game;
    g.state.health = g.maxHealth;
    g.state.gold = Math.max(0, g.state.gold - 15);
    g.state.rpg.potions = Math.max(2, g.state.rpg.potions);
    g.state.rpg.mounted = false;
    g.state.rpg.shipMoving = false;
    g.state.rpg.shipProgress = 0;
    const rest = s.project.entities.find(
      (e) => e.id === this.c.services.rest,
    ).position;
    g.state.position = [
      rest[0],
      heightAt(s.project.world, rest[0], rest[2] + 3) + 1.7,
      rest[2] + 3,
    ];
    s.load(g.save());
    s.menu.resume();
  }
  dispose() {
    this.mountAnimation?.dispose();
    for (const id of [this.c.ship.entity, this.c.services.horse]) {
      const e = this.s.project.entities.find((e) => e.id === id),
        o = this.s.view.objects.get(id);
      o.position.set(...e.position);
      o.rotation.set(...e.rotation);
      o.visible = true;
      o.updateMatrixWorld(true);
      this.s.view.refreshColliders(id);
    }
    this.s.game.guarding = false;
    this.panel.remove();
    this.ui.remove();
    this.buttons.remove();
    this.s.view.renderer.domElement.removeEventListener(
      "pointerdown",
      this.down,
    );
    window.removeEventListener("pointerup", this.up);
    this.s.view.renderer.domElement.removeEventListener(
      "contextmenu",
      this.context,
    );
  }
}
