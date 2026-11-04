import { WorldEvents } from "./world-events.js";
import { advanceWorld, actorPresent } from "../core/world-events.js";
import { RPGController } from "./rpg.js";
import { navigationTarget, navigationLabel } from "../core/navigation.js";
import { gearConfig } from "../core/equipment.js";
import { InventoryUI } from "./inventory.js";
import { syncItems, dropPosition } from "./item-world.js";
import { Cutscene } from "./cutscene.js";
import { GameAudio } from "./audio.js";
import { Conversation } from "../core/dialogue.js";
import { TouchControls } from "./touch-controls.js";
import { GameMenu } from "./game-menu.js";
import { MouseLook, requestMouseLock } from "./mouse-look.js";
import { timeLabel } from "../core/day-night.js";
import { moveCharacter } from "../core/movement.js";
import { NPCs } from "./npcs.js";
import { Mechanisms } from "./mechanisms.js";
import { EnemyController } from "./enemies.js";
import { WeaponView } from "./weapon.js";
import { GameState } from "../core/game.js";
export class Session {
  constructor(view, project, host, notify = () => {}, options = {}) {
    this.view = view;
    this.project = project;
    this.audio = new GameAudio(project);
    this.unlockAudio = () => this.audio.unlock();
    document.addEventListener("pointerdown", this.unlockAudio, true);
    document.addEventListener("keydown", this.unlockAudio, true);
    this.entitiesById = new Map(project.entities.map((e) => [e.id, e]));
    this.promptTimer = 0;
    this.weapon = project.weapon
      ? new WeaponView(project.weapon, view.assetModels)
      : null;
    view.weapon = this.weapon;
    this.game = new GameState(project);
    project = this.game.project;
    this.project = project;
    this.enemies = new EnemyController(view, project, this.game);
    this.npcs = new NPCs(view, project);
    this.mechanisms = new Mechanisms(view, project, this.game);
    this.events = new WorldEvents(view, project, this.game);
    this.mechanisms.onMotion = () => this.audio.event("mechanism");
    this.enemies.onChange = () => this.sync();
    this.enemies.onAttack = () => this.audio.event("enemyAttack");
    this.host = host;
    this.cutscene = new Cutscene(this);
    this.inventoryUI = new InventoryUI(this);
    this.notify = notify;
    this.keys = new Set();
    this.motion = { velocity: 0, grounded: true };
    this.jumpRequested = false;
    this.look = new MouseLook(view.camera);
    this.yaw = 0;
    this.pitch = 0;
    this.attackCooldown = 0;
    this.enemyTimer = 0;
    this.dialogOpen = false;
    this.paused = false;
    this.ui = document.createElement("div");
    this.ui.className = "game-overlay";
    this.host.classList.toggle(
      "theme-chronicle",
      project.presentation?.theme === "chronicle",
    );
    this.ui.innerHTML =
      '<div class="damage-flash" aria-hidden="true"></div><div class="game-title"></div><div class="quest-hud"></div><div class="navigation-hud"></div><div class="world-clock"></div><div class="crosshair">+</div><div class="prompt"></div><div class="vitals"></div><div class="game-help">WASD · движение &nbsp; Shift · бег &nbsp; Пробел · прыжок &nbsp; E · осмотр / взаимодействие &nbsp; I · инвентарь &nbsp; ЛКМ · удар &nbsp; Esc · меню</div><div class="dialogue" hidden><h3></h3><p></p><div class="dialogue-choices"></div><button class="dialogue-close">Закончить разговор</button></div>';
    host.append(this.ui);
    this.damageOverlay = this.ui.querySelector(".damage-flash");
    this.damageFlash = 0;
    this.ui.querySelector(".game-title").textContent = project.title;
    const inventoryButton = document.createElement("button");
    inventoryButton.className = "inventory-open";
    inventoryButton.textContent = "🎒 Инвентарь · I";
    inventoryButton.onclick = () => this.inventoryUI.open();
    this.ui.append(inventoryButton);
    this.ui.querySelector(".dialogue-close").onclick = () =>
      this.closeDialogue();
    this.onKey = (e) => {
      if (this.rpg && ["F5", "F9"].includes(e.code)) {
        e.preventDefault();
        if (!e.repeat) this.rpg.key(e);
        return;
      }
      if (this.paused || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
        return;
      if (this.rpg?.key(e)) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "Space"].includes(e.code))
        e.preventDefault();
      if (e.code === "KeyI" && !e.repeat) {
        e.preventDefault();
        this.inventoryUI.open();
        return;
      }
      this.keys.add(e.code);
      if (
        e.code === "Space" &&
        !e.repeat &&
        !this.dialogOpen &&
        this.game.alive &&
        this.controlsActive()
      )
        this.jumpRequested = true;
      if (e.code === "KeyE" && !e.repeat && this.controlsActive())
        this.interact();
    };
    this.onUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => {
      if (this.rpg) this.rpg.blocking = false;
      this.game.guarding = false;
      this.look.setActive(false);
      this.keys.clear();
      this.jumpRequested = false;
      this.touch?.reset();
    };
    this.onLock = () => {
      this.look.setActive(
        document.pointerLockElement === view.renderer.domElement,
      );
      if (document.pointerLockElement !== view.renderer.domElement) {
        this.onBlur();
        if (!this.dialogOpen && !this.menu?.visible && this.wasLocked)
          this.menu?.open();
      }
      this.wasLocked = document.pointerLockElement === view.renderer.domElement;
    };
    this.onMove = (e) => {
      if (
        document.pointerLockElement !== view.renderer.domElement ||
        this.dialogOpen ||
        this.paused
      )
        return;
      if (!this.game.alive) return;
      this.look.setActive(true);
      if (
        this.look.move(
          e.movementX * (this.settings?.sensitivity ?? 1),
          e.movementY *
            (this.settings?.sensitivity ?? 1) *
            (this.settings?.invertY ? -1 : 1),
          e.timeStamp,
        )
      ) {
        this.yaw = this.look.yaw;
        this.pitch = this.look.pitch;
      }
    };
    this.onClick = () => {
      if (
        this.touch?.enabled ||
        this.paused ||
        this.dialogOpen ||
        !this.game.alive
      )
        return;
      if (document.pointerLockElement !== view.renderer.domElement) {
        this.lock();
        return;
      }
      this.attack();
    };
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("pointerlockchange", this.onLock);
    document.addEventListener("mousemove", this.onMove);
    view.renderer.domElement.addEventListener("click", this.onClick);
    view.start(this.game.state.position);
    view.tick = (dt) => this.update(dt);
    this.view.applyTime?.(this.game.state.worldTime, undefined, true);
    this.enemies.syncDeaths(true);
    this.sync();
    this.touch = new TouchControls(this);
    this.menu = new GameMenu(this, options);
    if (project.rpg) this.rpg = new RPGController(this);
  }
  controlsActive() {
    return (
      !this.paused &&
      !this.dialogOpen &&
      this.game.alive &&
      (this.touch?.enabled ||
        document.pointerLockElement === this.view.renderer.domElement)
    );
  }
  attack() {
    if (!this.controlsActive() || this.attackCooldown > 0) return;
    if (this.weapon?.elapsed !== null && this.weapon?.elapsed !== undefined)
      return;
    if (this.rpg && !this.rpg.attack()) return;
    if (this.weapon) {
      if (this.weapon.attack()) this.audio?.event("attack");
    } else {
      this.audio?.event("attack");
      this.attackCooldown = 0.4;
      this.strike();
    }
  }
  strike() {
    const id = this.view.target(),
      e = this.entitiesById.get(id);
    if (["enemy", "npc"].includes(e?.kind) && !this.game.collected(e.id)) {
      const dead = this.game.hit(id);
      this.audio?.event(dead ? "enemyDeath" : "hit");
      this.notify(dead ? `${e.name}: побеждён` : `Удар: ${e.name}`);
      this.sync();
    }
  }
  async lock() {
    if (this.paused || this.touch?.enabled) return;
    try {
      this.mouseMode = await requestMouseLock(this.view.renderer.domElement);
    } catch {
      this.notify("Нажмите на сцену, чтобы включить управление.");
    }
  }
  mouseReport() {
    return JSON.stringify(
      {
        engine: "0.23.0",
        browser: globalThis.navigator?.userAgent ?? "unknown",
        inputMode: this.mouseMode ?? "unknown",
        ...this.look.report(),
      },
      null,
      2,
    );
  }
  interact() {
    const id = this.view.target(),
      e = this.project.entities.find((e) => e.id === id);
    if (!this.game.alive || this.paused) return;
    if (this.rpg?.interact(id)) {
      this.sync();
      return;
    }
    if (!e || !actorPresent(e, this.game)) return;
    if (this.game.state.defeated.includes(id)) {
      this.inventoryUI.openLoot(id);
      return;
    }
    if (e.moonDoor) {
      this.notify(
        this.game.state.events.moonActive
          ? "Лунная печать растворяется…"
          : "Камень откликается только на свет красной луны.",
      );
      return;
    }
    if (e.motion) {
      this.notify(this.mechanisms.interact(e.id));
      this.sync();
      return;
    }
    if (
      (e.kind === "item" && e.inspection?.enabled !== false) ||
      (e.kind === "prop" && e.inspection?.enabled)
    ) {
      this.inventoryUI.open(id);
      return;
    }
    if (e.kind === "item") {
      if (this.game.collect(id)) this.audio?.event("pickup");
      this.notify(`Получен предмет: ${e.name}`);
    }
    if (e.kind === "npc") {
      const actor = this.enemies?.units.find((u) => u.e.id === id);
      if (actor?.target || actor?.flee) {
        this.notify("Персонаж сейчас занят боем или спасается.");
        return;
      }
      this.conversation = new Conversation(this.game, id);
      this.keys.clear();
      this.touch?.reset();
      this.dialogOpen = true;
      this.talkingNPC = id;
      document.exitPointerLock?.();
      this.showDialogue();
    }
    this.sync();
  }
  closeDialogue() {
    if (this.paused) return;
    this.audio?.stopVoice();
    this.ui.querySelector(".dialogue").hidden = true;
    this.dialogOpen = false;
    this.talkingNPC = null;
    this.conversation = null;
    this.lock();
  }
  showDialogue(afterVideo = false) {
    const screen = this.conversation?.screen();
    if (!screen) {
      this.closeDialogue();
      return;
    }
    const video = this.project?.videos?.find((a) => a.id === screen.videoId);
    if (video && !afterVideo) {
      this.ui.querySelector(".dialogue").hidden = true;
      this.cutscene.play(video, () => this.showDialogue(true));
      return;
    }
    this.audio?.play(screen.audioId, true);
    const d = this.ui.querySelector(".dialogue");
    d.hidden = false;
    d.querySelector("h3").textContent = this.conversation.npc.name;
    d.querySelector("p").textContent = this.conversation.npc.dialogueTree
      ? screen.text
      : this.game.talk(this.talkingNPC);
    const choices = d.querySelector(".dialogue-choices");
    choices.replaceChildren();
    for (const c of screen.choices) {
      const b = document.createElement("button");
      b.textContent = c.text + (c.enabled ? "" : ` — ${c.reason}`);
      b.disabled = !c.enabled;
      b.onclick = () => {
        if (this.paused || !this.dialogOpen || !this.conversation.choose(c.id))
          return;
        if (c.action)
          this.audio?.event(
            c.action.type === "accept" ? "questAccept" : "questComplete",
          );
        if (c.action)
          this.notify(
            c.action.type === "accept"
              ? "Квест принят"
              : "Квест сдан. Награда получена",
          );
        this.sync();
        this.showDialogue();
      };
      choices.append(b);
    }
    this.rpg?.services(choices, this.talkingNPC);
    (
      choices.querySelector("button:not(:disabled)") ??
      d.querySelector(".dialogue-close")
    ).focus();
  }
  update(dt) {
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt);
      this.damageOverlay.style.opacity = String(this.damageFlash / 0.4);
    }

    if (!this.paused)
      this.npcs?.update(dt, this.dialogOpen ? this.talkingNPC : null);
    if (
      (document.pointerLockElement !== this.view.renderer.domElement &&
        !this.touch?.enabled) ||
      this.paused ||
      this.dialogOpen ||
      !this.game.alive
    ) {
      this.weapon?.cancel();
      this.jumpRequested = false;
      return;
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.game.state.position = this.view.camera.position.toArray();
    advanceWorld(this.game, dt);
    if ((this.game.moonReturnSerial ?? 0) !== (this.moonReturnSerial ?? 0)) {
      this.moonReturnSerial = this.game.moonReturnSerial;
      this.view.camera.position.set(...this.game.state.position);
      this.motion = { velocity: 0, grounded: true };
      this.rpg?.restore();
      this.notify("На рассвете лунный остров исчез. Вы вернулись на берег с добычей.");
      this.sync();
    }
    this.events?.update(dt, this.view.camera.position);
    if (this.project.world.dayNight?.enabled) {
      this.view.applyTime?.(this.game.state.worldTime, undefined, false, dt);
      const clock=this.ui.querySelector(".world-clock"),label=timeLabel(this.game.state.worldTime)+(this.game.state.events.moonActive?" · КРАСНАЯ ЛУНА":"");
      if(clock.textContent!==label)clock.textContent=label;
    }
    if (this.weapon?.update(dt)) this.strike();
    this.mechanisms?.update(dt, this.view.camera.position);
    const c = this.view.camera,
      keys = this.keys;
    let x =
        (keys.has("KeyD") ? 1 : 0) -
        (keys.has("KeyA") ? 1 : 0) +
        (this.touch?.enabled ? this.touch.move.x : 0),
      z =
        (keys.has("KeyS") ? 1 : 0) -
        (keys.has("KeyW") ? 1 : 0) +
        (this.touch?.enabled ? this.touch.move.z : 0);
    const len = Math.max(1, Math.hypot(x, z));
    x /= len;
    z /= len;
    const sprint = keys.has("ShiftLeft") || this.touch?.sprint;
    const speed =
        (this.rpg
          ? this.rpg.beforeMove(dt, Math.hypot(x, z) > 0.01, sprint)
          : sprint
            ? 7
            : 4) * dt,
      dx = (x * Math.cos(this.yaw) + z * Math.sin(this.yaw)) * speed,
      dz = (-x * Math.sin(this.yaw) + z * Math.cos(this.yaw)) * speed;
    this.motion ??= { velocity: 0, grounded: true };
    const wasGrounded = this.motion.grounded,
      oldX = c.position.x,
      oldZ = c.position.z;
    const mountOffset = this.rpg?.movementOffset ?? [0, 0, 0];
    const position = moveCharacter(
      this.project.world,
      [
        c.position.x - mountOffset[0],
        c.position.y - mountOffset[1],
        c.position.z - mountOffset[2],
      ],
      dx,
      dz,
      dt,
      (this.motion ??= { velocity: 0, grounded: true }),
      this.view.nearbyColliders?.(c.position.x - mountOffset[0], c.position.z - mountOffset[2], dx, dz) ??
        this.view.boxes ??
        [],
      this.game.state.rpg?.mounted ? false : this.jumpRequested,
    );
    for (let axis = 0; axis < 3; axis++) position[axis] += mountOffset[axis];
    if (
      wasGrounded &&
      !this.motion.grounded &&
      this.motion.velocity > 0 &&
      this.jumpRequested
    )
      this.audio?.event("jump");
    if (!wasGrounded && this.motion.grounded) this.audio?.event("land");
    this.stepTimer = Math.max(0, (this.stepTimer ?? 0) - dt);
    if (
      this.motion.grounded &&
      Math.hypot(position[0] - oldX, position[2] - oldZ) > 0.005 &&
      this.stepTimer === 0
    ) {
      this.audio?.event("step");
      this.stepTimer = keys.has("ShiftLeft") || this.touch?.sprint ? 0.3 : 0.45;
    }
    this.jumpRequested = false;
    c.position.set(...position);
    this.game.state.position = position;
    this.rpg?.afterMove();
    if (this.enemies?.update(dt, c.position)) {
      this.audio?.event("hurt");
      this.damageFlash = 0.4;
      this.damageOverlay.style.opacity = "1";
      this.sync();
      if (!this.game.alive) this.menu?.open("dead");
    }
    this.promptTimer -= dt;
    if (this.promptTimer > 0) return;
    this.promptTimer = 0.1;
    this.updateNavigation();
    const e = this.entitiesById.get(this.view.target());
    this.ui.querySelector(".prompt").textContent = e?.motion
      ? `${e.name} · ${this.mechanisms.prompt(e)}`
      : e
        ? `${e.name}${this.game.state.defeated.includes(e.id) ? " · E · Обыскать" : e.book ? " · E · Читать" : e.kind === "item" || e.inspection?.enabled ? " · E · Осмотреть" : e.kind === "npc" ? " · E" : e.kind === "enemy" ? " · ЛКМ" : ""}`
        : "";
  }
  dropPosition(id) {
    return dropPosition(this, id);
  }
  syncEquipment() {
    const id = this.game.state.equipped.weapon ?? null;
    const signature =
      id ?? (this.game.state.defaultWeapon ? "default" : "none");
    if (this.equippedWeaponId === signature) return;
    this.equippedWeaponId = signature;
    const e = this.entitiesById.get(id),
      gear = gearConfig(e);
    const cfg = e
      ? {
          assetId: e.shape === "model" ? e.assetId : null,
          rotation: gear.rotation,
          length: gear.length,
          grip: gear.grip,
        }
      : this.game.state.defaultWeapon
        ? this.project.weapon
        : null;
    this.weapon?.dispose();
    this.weapon = cfg ? new WeaponView(cfg, this.view.assetModels) : null;
    this.view.weapon = this.weapon;
  }
  updateNavigation() {
    const output = this.ui.querySelector(".navigation-hud");
    if (!output) return;
    const target = navigationTarget(this.game, (entity) => {
      const object = this.view.objects.get(entity.id);
      return object?.position?.toArray() ?? entity.position;
    });
    const [x, , z] = this.game.state.position;
    output.textContent = `${navigationLabel(target, this.yaw)}\nX ${Math.round(x)} · Z ${Math.round(z)}`;
  }
  sync() {
    this.events?.sync();
    this.updateNavigation();
    this.syncEquipment();
    this.rpg?.sync();
    this.ui.querySelector(".world-clock").textContent = this.project.world
      .dayNight?.enabled
      ? timeLabel(this.game.state.worldTime) +
        (this.game.state.events.moonActive ? " · КРАСНАЯ ЛУНА" : "")
      : "";
    this.view.invalidate?.(true);
    for (const [id, o] of this.view.objects)
      if (
        !["enemy", "npc", "item"].includes(this.entitiesById.get(id)?.kind) &&
        !this.entitiesById.get(id)?.moonDoor &&
        !this.events?.moonEntities.some(e => e.id === id)
      )
        o.visible = !this.game.collected(id);
    syncItems(this.view, this.project, this.game.state);
    this.enemies?.syncDeaths();
    this.ui.querySelector(".vitals").textContent =
      `♥ ${this.game.state.health} / ${this.game.maxHealth}     ◈ ${this.game.state.gold} золота     ◇ ${this.game.state.inventory.length} предметов`;
    const journal = this.project.quests
      .filter((q) => this.game.state.quests[q.id])
      .map((q) => {
        const status = this.game.state.quests[q.id],
          progress = this.game.questProgress(q),
          remaining = progress.remaining
            .map((id) => this.entitiesById.get(id)?.name)
            .join(", "),
          giver = this.entitiesById.get(q.giver);
        return status === "complete"
          ? `✓ ${q.title}`
          : `◇ ${q.title} — ${q.type === "defeat" ? `Побеждено ${progress.done}/${progress.total} · ` : ""}${progress.ready ? `Вернуться: ${giver?.name}` : `${q.type === "defeat" ? "Осталось" : "Забрать"}: ${remaining}`}`;
      });
    this.ui.querySelector(".quest-hud").textContent =
      journal.join("\n") ||
      `Поговорите: ${this.entitiesById.get((this.project.quests.find((q) => q.main) ?? this.project.quests[0])?.giver)?.name ?? "найдите жителей этого мира"}`;
    if (!this.game.alive) {
      document.exitPointerLock?.();
      this.ui.querySelector(".prompt").textContent =
        "Вы погибли. Загрузите сохранение или перезапустите игру.";
    }
  }
  load(raw) {
    this.game.load(raw);
    if (this.inventoryUI?.active) {
      this.inventoryUI.dispose();
      this.paused = !!this.menu?.visible;
      this.view.gamePaused = this.paused;
    }
    if (this.cutscene?.active) {
      this.cutscene.dispose();
      this.paused = !!this.menu?.visible;
      this.view.gamePaused = this.paused;
    }
    this.audio?.stopAll();
    this.keys.clear();
    this.touch?.reset();
    this.damageFlash = 0;
    this.damageOverlay.style.opacity = "0";
    this.view.applyTime?.(this.game.state.worldTime, undefined, true);
    this.enemies?.reset();
    this.enemies?.syncDeaths(true);
    this.mechanisms?.restore();
    this.events?.sync(true);
    this.moonReturnSerial = this.game.moonReturnSerial ?? 0;
    this.view.applyTime?.(this.game.state.worldTime, undefined, true);
    this.dialogOpen = false;
    this.talkingNPC = null;
    this.conversation = null;
    this.ui.querySelector(".dialogue").hidden = true;
    this.motion = { velocity: 0, grounded: true };
    this.jumpRequested = false;
    this.weapon?.cancel();
    this.view.camera.position.set(
      this.game.state.position[0],
      this.game.state.position[1],
      this.game.state.position[2],
    );
    this.rpg?.restore();
    this.sync();
  }
  dispose() {
    this.events?.dispose();
    this.host.classList.remove("theme-chronicle");
    this.rpg?.dispose();
    this.inventoryUI?.dispose();
    syncItems(this.view, this.project, {
      inventory: [],
      droppedItems: {},
      showOwned: true,
    });
    this.cutscene?.dispose();
    this.audio?.dispose();
    document.removeEventListener("pointerdown", this.unlockAudio, true);
    document.removeEventListener("keydown", this.unlockAudio, true);
    this.menu?.dispose();
    this.menu = null;
    this.touch?.dispose();
    document.exitPointerLock?.();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("pointerlockchange", this.onLock);
    document.removeEventListener("mousemove", this.onMove);
    this.view.renderer.domElement.removeEventListener("click", this.onClick);
    this.enemies?.dispose();
    this.npcs?.dispose();
    this.mechanisms?.dispose();
    this.weapon?.dispose();
    this.view.weapon = null;
    this.view.tick = null;
    this.view.stop();
    this.ui.remove();
  }
}
