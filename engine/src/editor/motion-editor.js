import * as T from "three";
import { createEntityObject } from "../render/world.js";
import { defaultMotion, conditionLabel } from "../core/mechanisms.js";
import { motionUnit, applyMotion } from "../render/mechanisms.js";
import { stopEnemyPreview } from "./enemy-editor.js";
export function motionEditor({
  entity,
  project,
  view,
  element,
  modal,
  field,
  commit,
}) {
  const cfg = structuredClone(
    entity.motion ?? defaultMotion(entity.shape === "door"),
  );
  const initialModel =
    entity.shape === "model"
      ? entity.assetId
      : entity.shape === "door"
        ? "builtin"
        : "current";
  let model = initialModel;
  const configured = () => {
    const e = structuredClone(entity);
    e.motion = structuredClone(cfg);
    if (model !== "current") {
      e.shape = model === "builtin" ? "door" : "model";
      if (model === "builtin") delete e.assetId;
      else e.assetId = model;
    }
    return e;
  };
  const show = () => {
    const box = element("div", "", "motion-editor");
    box.append(
      element(
        "p",
        "Исходное положение — как объект стоит сейчас в редакторе. Выберите движение, затем когда его запускать.",
      ),
    );
    const presets = element("div", "", "button-row");
    for (const [name, offset, rotation, pivot] of [
      ["Распахнуть дверь", [0, 0, 0], [0, Math.PI / 2, 0], "left"],
      ["Вправо", [2, 0, 0], [0, 0, 0], "origin"],
      ["Влево", [-2, 0, 0], [0, 0, 0], "origin"],
      ["Опустить", [0, -2.5, 0], [0, 0, 0], "origin"],
      ["Поднять", [0, 2.5, 0], [0, 0, 0], "origin"],
    ]) {
      const b = element("button", name);
      b.dataset.motionPreset = name;
      b.onclick = () => {
        stopEnemyPreview(view);
        const shift = new T.Vector3(...offset);
        if (name === "Вправо" || name === "Влево")
          shift.applyEuler(new T.Euler(...entity.rotation));
        Object.assign(cfg, { offset: shift.toArray(), rotation, pivot });
        show();
      };
      presets.append(b);
    }
    box.append(presets);
    const select = (id, label, options, value, change) => {
      const l = element("label", label, "field"),
        s = element("select");
      s.id = id;
      for (const [v, text] of options) {
        const o = element("option", text);
        o.value = v;
        s.append(o);
      }
      s.value = value;
      s.onchange = () => change(s.value);
      l.append(s);
      box.append(l);
      return s;
    };
    select(
      "door-model",
      "3D-модель двери",
      [
        ...(initialModel === "current"
          ? [["current", "Оставить текущий объект"]]
          : []),
        ["builtin", "Стандартная дверь"],
        ...project.assets.map((a) => [a.id, a.name]),
      ],
      model,
      (v) => {
        stopEnemyPreview(view);
        model = v;
        show();
      },
    );
    box.append(
      element(
        "small",
        "Свою GLB добавьте в библиотеку моделей, затем выберите здесь. Размер и положение сохраняются; масштаб можно изменить в свойствах объекта. Модель должна содержать только подвижное полотно — раму добавьте отдельно.",
      ),
    );
    select(
      "motion-trigger",
      "Как запускать",
      [
        ["interact", "Игрок нажимает E"],
        ["auto", "Автоматически, когда выполнено условие"],
      ],
      cfg.trigger,
      (v) => {
        cfg.trigger = v;
        show();
      },
    );
    select(
      "motion-condition",
      "Условие",
      [
        ["none", "Без условий"],
        ["quest", "Квест завершён"],
        ["item", "Предмет получен"],
        ["enemy", "Враг побеждён"],
      ],
      cfg.condition,
      (v) => {
        cfg.condition = v;
        cfg.target = null;
        show();
      },
    );
    if (cfg.condition !== "none") {
      const list =
        cfg.condition === "quest"
          ? project.quests.map((q) => [q.id, q.title])
          : project.entities
              .filter((e) => e.kind === cfg.condition)
              .map((e) => [e.id, e.name]);
      select(
        "motion-target",
        "Какой именно",
        [["", "Выберите…"], ...list],
        cfg.target ?? "",
        (v) => {
          cfg.target = v || null;
        },
      );
      if (!list.length)
        box.append(
          element(
            "p",
            "Сначала добавьте нужный квест, предмет или врага. Затем откройте это окно снова.",
          ),
        );
    }
    box.append(element("h3", "Конечное положение"));
    for (const [key, label, factor] of [
      ["offset", "Сдвиг по осям мира, м", 1],
      ["rotation", "Поворот от исходного, °", 180 / Math.PI],
    ]) {
      box.append(element("b", label));
      const row = element("div", "", "vector");
      ["X", "Y", "Z"].forEach((axis, i) => {
        const input = field(
          row,
          axis,
          cfg[key][i] * factor,
          "number",
          (v) => (cfg[key][i] = Number(v) / factor),
        );
        input.dataset.motionVector = key + axis;
      });
      box.append(row);
    }
    select(
      "motion-pivot",
      "Ось вращения / петли",
      [
        ["origin", "Центр модели (исходный pivot)"],
        ["left", "Левый край модели"],
        ["right", "Правый край модели"],
      ],
      cfg.pivot,
      (v) => (cfg.pivot = v),
    );
    field(
      box,
      "Время движения, с",
      cfg.duration,
      "number",
      (v) => (cfg.duration = Number(v)),
    );
    const error = element("p", "", "wizard-error");
    error.setAttribute("role", "alert");
    box.append(error);
    const valid = () => {
      if (cfg.condition !== "none" && !cfg.target) {
        error.textContent = "Выберите цель условия.";
        return false;
      }
      if (
        !Number.isFinite(cfg.duration) ||
        cfg.duration < 0.1 ||
        cfg.duration > 60 ||
        cfg.offset.some((v) => !Number.isFinite(v) || Math.abs(v) > 100) ||
        cfg.rotation.some(
          (v) => !Number.isFinite(v) || Math.abs(v) > Math.PI * 2,
        )
      ) {
        error.textContent =
          "Время: 0.1–60 с, сдвиг: до 100 м, поворот: до 360°.";
        return false;
      }
      return true;
    };
    const preview = element("button", "▶ Показать движение");
    preview.id = "motion-preview";
    preview.onclick = () => {
      if (!valid()) return;
      stopEnemyPreview(view);
      document.querySelector("#modal").classList.add("preview-dialog");
      const e = configured(),
        original = view.objects.get(e.id),
        temporary = model !== initialModel;
      const object = temporary
        ? createEntityObject(e, view.assetModels)
        : original;
      if (temporary) {
        original.visible = false;
        view.scene.add(object);
      }
      const u = motionUnit(object, e);
      let t = 0;
      view.previewCleanup = () => {
        applyMotion(u, 0);
        if (temporary) {
          original.visible = true;
          object.removeFromParent();
          if (e.shape !== "model")
            object.traverse((o) => {
              o.geometry?.dispose();
              if (o.material) o.material.dispose();
            });
        }
        view.touchObject?.(e.id);
        view.refreshColliders?.(e.id);
        view.selection?.update();
      };
      view.editorPreview = (dt) => {
        t = Math.min(1, t + dt / cfg.duration);
        applyMotion(u, t);
        view.touchObject?.(e.id);
        view.refreshColliders?.(e.id);
        view.selection?.update();
        view.invalidate(true);
        if (t === 1) view.editorPreview = null;
      };
      view.orbit.target.copy(object.position);
      view.camera.position.copy(object.position).add(new T.Vector3(5, 4, 6));
      view.orbit.update?.();
    };
    box.append(preview);
    const reset = element("button", "↶ Вернуть предпросмотр");
    reset.onclick = () => stopEnemyPreview(view);
    box.append(reset);
    box.append(
      element(
        "p",
        cfg.trigger === "auto" && cfg.condition === "none"
          ? "Начнёт движение при запуске игры."
          : cfg.trigger === "auto"
            ? `Сработает автоматически: ${conditionLabel(cfg, project)}.`
            : "В игре наведите прицел на объект и нажмите E. Повторное E возвращает его назад.",
      ),
    );
    box.append(
      element(
        "small",
        "Коллизия движется вместе с объектом. При пересечении с игроком движение приостанавливается. Перевозка игрока на платформах пока не поддерживается.",
      ),
    );
    const save = element("button", "✓ Сохранить движение", "primary");
    save.id = "motion-save";
    save.onclick = async () => {
      if (!valid()) return;
      stopEnemyPreview(view);
      const p = structuredClone(project);
      p.entities[p.entities.findIndex((e) => e.id === entity.id)] =
        configured();
      if (await commit(p)) document.querySelector("#modal").close();
    };
    box.append(save);
    if (entity.motion) {
      const remove = element("button", "Убрать движение");
      remove.onclick = async () => {
        stopEnemyPreview(view);
        const p = structuredClone(project);
        delete p.entities.find((e) => e.id === entity.id).motion;
        if (await commit(p)) document.querySelector("#modal").close();
      };
      box.append(remove);
    }
    modal(`Дверь / движение: ${entity.name}`, box);
  };
  show();
}
