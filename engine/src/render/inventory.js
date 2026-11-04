import { mountBook } from "./book.js";
import { SLOTS, gearConfig } from "../core/equipment.js";
import { heroDoll } from "./hero-doll.js";
import { ItemPreview } from "./item-preview.js";
export class InventoryUI {
  constructor(session) {
    this.session = session;
  }
  open(id = null, lootOwner = null) {
    const s = this.session;
    if (this.active || s.paused || s.dialogOpen || !s.game.alive) return;
    this.active = true;
    this.lootOwner = lootOwner;
    this.fromWorld = id !== null;
    s.paused = true;
    s.view.gamePaused = true;
    s.keys.clear();
    s.touch?.reset();
    s.weapon?.cancel();
    s.audio?.stopAll();
    document.exitPointerLock?.();
    this.root = document.createElement("div");
    this.root.className = "inventory-overlay";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", id ? "Осмотр предмета" : "Инвентарь");
    this.root.setAttribute("aria-modal", "true");
    s.host.append(this.root);
    this.onKey = (e) => {
      if (e.code === "Escape" || e.code === "KeyI") {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
      } else if (e.code === "Tab") {
        const buttons = [
            ...this.root.querySelectorAll("button:not(:disabled)"),
          ],
          i = buttons.indexOf(document.activeElement);
        e.preventDefault();
        e.stopImmediatePropagation();
        buttons[
          (i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        ]?.focus();
      } else e.stopPropagation();
    };
    document.addEventListener("keydown", this.onKey, true);
    this.show(id);
  }
  openLoot(owner) {
    if (!this.session.game.state.defeated.includes(owner)) return;
    if (this.active) return;
    this.open(null, owner);
  }
  button(parent, text, fn, id) {
    const b = document.createElement("button");
    b.textContent = text;
    if (id) b.id = id;
    b.onclick = fn;
    parent.append(b);
    return b;
  }
  show(id) {
    this.preview?.dispose();
    this.doll?.dispose();
    this.doll = null;
    this.preview = null;
    this.root.replaceChildren();
    const s = this.session;
    const panel = document.createElement("div");
    panel.className = "inventory-panel";
    this.root.append(panel);
    const heading = document.createElement("h2");
    heading.textContent = this.lootOwner
      ? "Обыск: " + s.entitiesById.get(this.lootOwner)?.name
      : this.fromWorld
        ? "Осмотр"
        : "Инвентарь";
    panel.append(heading);
    if (this.lootOwner) {
      const list = document.createElement("div");
      panel.append(list);
      const loot = s.game.lootItems(this.lootOwner);
      if (!loot.length) list.textContent = "Тело обыскано — вещей больше нет.";
      for (const e of loot)
        this.button(list, "Забрать: " + e.name, () => {
          s.game.loot(this.lootOwner, e.id);
          s.sync();
          this.show(null);
        });
      if (loot.length)
        this.button(
          list,
          "Забрать всё",
          () => {
            for (const e of loot) s.game.loot(this.lootOwner, e.id);
            s.sync();
            this.show(null);
          },
          "loot-all",
        );
    }
    if (!this.fromWorld && !this.lootOwner) {
      const summary = document.createElement("p");
      summary.textContent = `Урон: ${s.game.attackDamage} · Защита: ${s.game.armor}% · Золото: ${s.game.state.gold}`;
      panel.append(summary);
      const slots = document.createElement("div");
      slots.className = "equipment-slots";
      panel.append(slots);
      this.button(
        slots,
        "♙ Герой · посмотреть",
        () => this.show(null),
        "inventory-hero",
      );
      for (const [slot, label] of Object.entries(SLOTS)) {
        const equipped = s.game.state.equipped[slot];
        const cell = document.createElement("div");
        cell.className = "equipment-slot";
        cell.dataset.slot = slot;
        slots.append(cell);
        this.button(
          cell,
          label +
            ": " +
            (s.entitiesById.get(equipped)?.name ??
              (slot === "weapon" &&
              s.game.state.defaultWeapon &&
              s.project.weapon
                ? "Стартовое оружие"
                : "пусто")),
          () => this.show(equipped ?? null),
        );
        if (
          equipped ||
          (slot === "weapon" && s.game.state.defaultWeapon && s.project.weapon)
        )
          this.button(cell, "Снять", () => {
            s.game.unequip(slot);
            s.sync();
            this.show(null);
          });
      }
      if (
        s.project.weapon &&
        !s.game.state.defaultWeapon &&
        !s.game.state.equipped.weapon
      ) {
        this.button(panel, "Надеть стартовое оружие", () => {
          s.game.state.defaultWeapon = true;
          s.sync();
          this.show(null);
        });
      }
      const list = document.createElement("div");
      list.className = "inventory-list";
      panel.append(list);
      for (const item of s.game.state.inventory) {
        const entity = s.entitiesById.get(item);
        this.button(list, entity?.name ?? item, () => this.show(item));
      }
    }
    const entity = s.entitiesById.get(id);
    if (entity) {
      const title = document.createElement("h3");
      title.textContent = entity.name;
      panel.append(title);
      const hint = document.createElement("p");
      if (entity.book) mountBook(panel, entity, s.game);
      else {
        const host = document.createElement("div");
        host.className = "item-preview";
        panel.append(host);
        try {
          this.preview = new ItemPreview(host, s.view.objects.get(id));
        } catch {
          host.textContent =
            "3D-предпросмотр недоступен в этом браузере. Описание и действия доступны.";
        }
        const description = document.createElement("p");
        description.textContent =
          entity.inspection?.description || "Описание не задано.";
        panel.append(description);
        hint.textContent =
          "Вращение: тяните мышью или пальцем. Масштаб: колесо или кнопки + / −.";
        panel.append(hint);
        this.button(panel, "↶", () => this.preview?.rotate(-0.3, 0));
        this.button(panel, "↷", () => this.preview?.rotate(0.3, 0));
        this.button(panel, "↑", () => this.preview?.rotate(0, -0.3));
        this.button(panel, "↓", () => this.preview?.rotate(0, 0.3));
        this.button(panel, "+", () => this.preview?.zoom(0.85));
        this.button(panel, "−", () => this.preview?.zoom(1.15));
      }
      if (this.fromWorld && entity.kind === "item")
        this.button(
          panel,
          "Забрать",
          () => {
            if (s.game.collect(id)) {
              s.audio?.event("pickup");
              s.sync();
              this.close();
            }
          },
          "inspect-take",
        );
      if (!this.fromWorld && !this.lootOwner)
        this.button(
          panel,
          "Выбросить",
          () => {
            const position = s.dropPosition(id);
            if (!position) {
              hint.textContent =
                "Рядом нет свободного места. Отойдите от стен и попробуйте снова.";
              return;
            }
            if (s.game.drop(id, position)) {
              s.sync();
              this.show(s.game.state.inventory[0] ?? null);
            }
          },
          "inventory-drop",
        );
      if (!this.fromWorld && !this.lootOwner && SLOTS[entity.gear?.slot]) {
        const gear = gearConfig(entity),
          stats = document.createElement("p");
        stats.textContent =
          gear.slot === "weapon"
            ? `Урон: ${gear.damage}`
            : `Защита: ${gear.armor}%`;
        panel.append(stats);
        this.button(
          panel,
          s.game.state.equipped[gear.slot] === id ? "Снять" : "Надеть",
          () => {
            if (s.game.state.equipped[gear.slot] === id)
              s.game.unequip(gear.slot);
            else s.game.equip(id);
            s.sync();
            this.show(id);
          },
          "inventory-equip",
        );
      }
      const quest = s.project.quests.find(
        (q) =>
          q.type === "collect" &&
          q.target === id &&
          s.game.state.quests[q.id] !== "complete",
      );
      if (!this.fromWorld && quest) {
        const note = document.createElement("p");
        note.textContent = `Нужен для квеста «${quest.title}». После выбрасывания его придётся подобрать снова.`;
        panel.append(note);
      }
    } else if (!this.lootOwner) {
      const host = document.createElement("div");
      host.className = "item-preview";
      panel.append(host);
      try {
        this.doll = heroDoll(s);
        this.preview = new ItemPreview(host, this.doll.object);
      } catch {
        host.textContent =
          "Кукла героя: 3D недоступно; используйте слоты выше.";
      }
      const hint = document.createElement("p");
      hint.textContent =
        "Поверните героя пальцем или мышью. Выберите вещь ниже слотов и нажмите «Надеть».";
      panel.append(hint);
      const empty = document.createElement("p");
      empty.textContent = s.game.state.inventory.length
        ? "Предметы доступны в списке выше."
        : "Инвентарь пуст. Осмотрите предмет по E или обыщите тело.";
      panel.append(empty);
    }
    this.button(
      panel,
      this.fromWorld ? "Оставить / закрыть" : "Закрыть",
      () => this.close(),
      "inventory-close",
    ).focus();
  }
  close() {
    if (!this.active) return;
    this.dispose();
    this.session.paused = false;
    this.session.view.gamePaused = false;
    this.session.keys.clear();
    this.session.lock();
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    this.lootOwner = null;
    this.preview?.dispose();
    this.doll?.dispose();
    this.doll = null;
    this.preview = null;
    this.root.remove();
    document.removeEventListener("keydown", this.onKey, true);
    this.session.paused = false;
    this.session.view.gamePaused = false;
  }
}
