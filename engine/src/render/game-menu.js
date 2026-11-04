import {QUALITY_OPTIONS} from "../core/quality.js";
import { GameState } from "../core/game.js";
import { download, errorText } from "../core/storage.js";
const defaults = {
  quality: "balanced",
  volume: 0.8,
  sensitivity: 1,
  touchSensitivity: 1,
  invertY: false,
  fov: 55,
  controls: "auto",
};
export class GameMenu {
  constructor(session, options = {}) {
    this.session = session;
    this.options = options;
    this.visible = false;
    this.started = !options.startPaused;
    this.key = `hearth-save:${session.project.id}:${session.project.contentVersion}`;
    this.settingsKey = "hearth-game-settings:v1";
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(this.settingsKey));
    } catch {}
    session.settings = { ...defaults, ...this.cleanSettings(stored) };
    this.root = document.createElement("div");
    this.root.className = "game-menu";
    this.root.hidden = true;
    session.host.append(this.root);
    this.button = document.createElement("button");
    this.button.className = "game-menu-button";
    this.button.textContent = "☰ Меню";
    this.button.onclick = () => this.open();
    session.host.append(this.button);
    this.file = document.createElement("input");
    this.file.type = "file";
    this.file.accept = ".json";
    this.file.hidden = true;
    this.root.append(this.file);
    this.file.onchange = async () => {
      try {
        const f = this.file.files[0];
        if (!f) return;
        if (f.size > 1024 * 1024) throw Error("Слишком большой сейв");
        session.load(await f.text());
        this.started = true;
        this.resume();
      } catch (e) {
        session.notify(errorText(e));
      } finally {
        this.file.value = "";
      }
    };
    this.onKey = (e) => {
      if (e.code === "Tab" && this.visible) {
        const focusable = [
          ...this.root.querySelectorAll(
            "button:not(:disabled), input:not([hidden]), select",
          ),
        ];
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
        return;
      }

      if (e.code !== "Escape") return;
      e.preventDefault();
      if (!this.visible) this.open();
    };
    window.addEventListener("keydown", this.onKey);
    this.onBlur = () => {
      if (!this.visible) this.open();
    };
    this.onVisibility = () => {
      if (document.hidden) this.onBlur();
    };
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);

    this.applySettings();
    if (options.startPaused) this.open("main");
  }
  cleanSettings(raw) {
    if (!raw || typeof raw !== "object") return {};
    const result = {};
    for (const [k, min, max] of [
      ["volume", 0, 1],
      ["sensitivity", 0.3, 2],
      ["touchSensitivity", 0.3, 2],
      ["fov", 45, 90],
    ])
      if (Number.isFinite(raw[k]))
        result[k] = Math.max(min, Math.min(max, raw[k]));
    if (QUALITY_OPTIONS.some(([id])=>id===raw.quality))
      result.quality = raw.quality;
    if (["auto", "touch", "desktop"].includes(raw.controls))
      result.controls = raw.controls;
    if (typeof raw.invertY === "boolean") result.invertY = raw.invertY;
    return result;
  }
  applySettings() {
    const s = this.session,
      v = s.view,
      cfg = s.settings;
    v.setQuality?.(cfg.quality);
    s.audio?.setVolume(cfg.volume);
    v.camera.fov = cfg.fov;
    v.camera.updateProjectionMatrix?.();
    const touch =
      cfg.controls === "touch" ||
      (cfg.controls === "auto" &&
        (globalThis.navigator?.maxTouchPoints ?? 0) > 0 &&
        globalThis.matchMedia?.("(pointer: coarse)").matches !== false);
    s.touch.setEnabled(touch);
    s.keys.clear();
    v.invalidate?.();
  }
  open(page = "pause") {
    if (this.session.cutscene?.active || this.session.inventoryUI?.active)
      return;
    this.visible = true;
    this.session.paused = true;
    this.session.audio?.stopAll();
    this.session.view.gamePaused = true;
    this.session.view.invalidate?.();
    this.session.onBlur();
    this.root.hidden = false;
    this.session.touch.reset();
    document.exitPointerLock?.();
    this.render(page);
  }
  resume() {
    if (!this.session.game.alive) {
      this.render("dead");
      return;
    }
    this.started = true;
    this.visible = false;
    this.root.hidden = true;
    this.session.paused = false;
    this.session.view.gamePaused = false;
    this.session.keys.clear();
    this.session.lock();
  }
  action(parent, text, fn, id) {
    const b = document.createElement("button");
    b.textContent = text;
    if (id) b.dataset.menuAction = id;
    b.onclick = fn;
    parent.append(b);
    return b;
  }
  latestSave() {
    try {
      const saves = [];
      for (let i = 1; i <= 3; i++) {
        const text = localStorage.getItem(`${this.key}:slot:${i}`);
        if (!text) continue;
        try {
          const entry = JSON.parse(text);
          if (typeof entry?.raw === "string") saves.push(entry);
        } catch {}
      }
      saves.sort(
        (a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0),
      );
      return saves[0]?.raw ?? localStorage.getItem(this.key);
    } catch {
      return null;
    }
  }
  render(page = "pause") {
    this.root.querySelector(".game-menu-panel")?.remove();
    const panel = document.createElement("section");
    panel.className = "game-menu-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.tabIndex = -1;
    const h = document.createElement("h1");
    h.textContent = page === "dead" ? "Вы погибли" : this.session.project.title;
    panel.append(h);
    this.root.append(panel);
    const title = (text) => {
      const p = document.createElement("p");
      p.textContent = text;
      panel.append(p);
    };
    if (page === "confirm-new") {
      title(
        "Начать новую игру? Несохранённый прогресс будет потерян. Слоты сохранений останутся.",
      );
      this.action(
        panel,
        "Начать заново",
        () => {
          this.session.load(new GameState(this.session.project).save());
          this.session.look.yaw = 0;
          this.session.look.pitch = 0;
          this.session.look.apply(0, 0, performance.now());
          this.session.yaw = 0;
          this.session.pitch = 0;
          this.resume();
        },
        "confirm-new",
      );
      this.action(panel, "Отмена", () => this.render());
    } else if (page === "saves" || page === "loads") {
      title(
        page === "saves" ? "Сохранить прохождение" : "Загрузить прохождение",
      );
      for (let i = 1; i <= 3; i++) {
        let saved = null,
          unavailable = false;
        try {
          const raw = localStorage.getItem(`${this.key}:slot:${i}`);
          if (raw) saved = JSON.parse(raw);
          else if (i === 1) {
            const legacy = localStorage.getItem(this.key);
            if (legacy) saved = { raw: legacy, date: null };
          }
        } catch {
          unavailable = true;
        }
        const label = saved
          ? `Слот ${i} · ${saved.date ? new Date(saved.date).toLocaleString() : "старое сохранение"}`
          : `Слот ${i} · ${unavailable ? "память недоступна" : "пусто"}`;
        if (page === "saves")
          this.action(
            panel,
            label,
            () => {
              if (saved) {
                this.renderConfirmSave(i);
              } else this.save(i);
            },
            `save-${i}`,
          );
        else
          this.action(
            panel,
            label,
            () => {
              try {
                this.session.load(saved.raw);
                this.started = true;
                this.resume();
              } catch (e) {
                this.session.notify(errorText(e));
              }
            },
            `load-${i}`,
          ).disabled = !saved;
      }
      this.action(
        panel,
        "Скачать сейв файлом",
        () =>
          download(
            `${this.session.project.id}.save.json`,
            this.session.game.save(),
          ),
        "export-save",
      );
      this.action(
        panel,
        "Открыть файл сейва",
        () => this.file.click(),
        "import-save",
      );
      title(
        "Слоты хранятся в этом браузере. Для переноса или резервной копии скачайте файл сейва.",
      );
      this.action(panel, "Назад", () => this.render());
    } else if (page === "settings") {
      title("Настройки");
      const cfg = this.session.settings;
      const setting = (key, label, values) => {
        const l = document.createElement("label");
        l.textContent = label;
        const input = document.createElement(values ? "select" : "input");
        if (values) {
          for (const [value, text] of values) {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = text;
            input.append(o);
          }
          input.value = cfg[key];
        } else if (key === "invertY") {
          input.type = "checkbox";
          input.checked = cfg[key];
        } else {
          input.type = "range";
          input.min = key === "volume" ? 0 : key === "fov" ? 45 : 0.3;
          input.max = key === "volume" ? 1 : key === "fov" ? 90 : 2;
          input.step = key === "fov" ? 1 : 0.1;
          input.value = cfg[key];
        }
        input.dataset.setting = key;
        input.onchange = () => {
          cfg[key] = values
            ? input.value
            : key === "invertY"
              ? input.checked
              : Number(input.value);
          this.applySettings();
          try {
            localStorage.setItem(this.settingsKey, JSON.stringify(cfg));
          } catch {
            this.session.notify(
              "Настройки применены на этот запуск: память браузера недоступна.",
            );
          }
        };
        l.append(input);
        panel.append(l);
      };
      setting("quality", "Качество", QUALITY_OPTIONS);
      setting("controls", "Управление", [
        ["auto", "Автоматически"],
        ["touch", "Сенсорное"],
        ["desktop", "Мышь и клавиатура"],
      ]);
      setting("volume", "Громкость (0 — без звука)");
      setting("sensitivity", "Чувствительность мыши");
      setting("touchSensitivity", "Чувствительность обзора пальцем");
      setting("fov", "Поле зрения");
      setting("invertY", "Инвертировать обзор по вертикали");
      this.action(panel, "Полный экран", async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else if (this.session.host.requestFullscreen)
            await this.session.host.requestFullscreen();
          else throw Error("Полный экран не поддерживается этим браузером.");
        } catch (e) {
          this.session.notify(errorText(e));
        }
      });
      this.action(panel, "Назад", () => this.render());
    } else if (page === "controls") {
      title(
        "Компьютер: WASD — движение, мышь — обзор, Shift — бег, пробел — прыжок, ЛКМ — удар, E — действие, Esc — пауза.",
      );
      title(
        "Телефон: джойстик слева — движение, ведите пальцем справа — обзор. Кнопки справа: удар, действие, прыжок и удержание бега. ☰ — пауза. Удобнее играть горизонтально.",
      );
      this.action(panel, "Скачать диагностику мыши", () =>
        download("hearth-mouse.json", this.session.mouseReport()),
      );
      this.action(panel, "Назад", () => this.render());
    } else {
      if(page==="dead"&&this.session.rpg)this.action(panel,"Вернуться к костру · −15 монет",()=>this.session.rpg.respawn(),"respawn");
      const latest = !this.started && this.latestSave();
      if (latest)
        this.action(
          panel,
          "Продолжить",
          () => {
            try {
              this.session.load(latest);
              this.started = true;
              this.resume();
            } catch (error) {
              this.session.notify(errorText(error));
            }
          },
          "continue-save",
        );
      if (this.started && this.session.game.alive)
        this.action(panel, "Продолжить", () => this.resume(), "resume");
      this.action(
        panel,
        "Новая игра",
        () => {
          if (this.started) this.render("confirm-new");
          else this.resume();
        },
        "new",
      );
      if (this.started && this.session.game.alive)
        this.action(panel, "Сохранить", () => this.render("saves"), "saves");
      this.action(panel, "Загрузить", () => this.render("loads"), "loads");
      this.action(
        panel,
        "Настройки",
        () => this.render("settings"),
        "settings",
      );
      this.action(
        panel,
        "Управление",
        () => this.render("controls"),
        "controls",
      );
      if (page !== "main")
        this.action(panel, "Главное меню", () => this.render("main"), "main");
      if (this.options.onExit)
        this.action(panel, "Вернуться в редактор", this.options.onExit, "exit");
    }
    panel.querySelector("button:not(:disabled)")?.focus();
  }
  renderConfirmSave(slot) {
    this.render("confirm-save");
    const panel = this.root.querySelector(".game-menu-panel");
    panel.replaceChildren();
    const p = document.createElement("p");
    p.textContent = `Перезаписать слот ${slot}?`;
    panel.append(p);
    this.action(panel, "Перезаписать", () => this.save(slot));
    this.action(panel, "Отмена", () => this.render("saves"));
  }
  save(slot) {
    try {
      localStorage.setItem(
        `${this.key}:slot:${slot}`,
        JSON.stringify({
          date: new Date().toISOString(),
          raw: this.session.game.save(),
        }),
      );
      this.session.notify("Прохождение сохранено.");
      this.render("saves");
    } catch {
      this.session.notify(
        "Память браузера недоступна или заполнена. Скачайте сейв файлом.",
      );
    }
  }
  dispose() {
    this.session.view.gamePaused = false;
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.root.remove();
    this.button.remove();
  }
}
