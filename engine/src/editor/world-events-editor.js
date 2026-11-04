import * as T from "three";
import { weaponPreview } from "./weapon-preview.js";
import { stopEnemyPreview } from "./enemy-editor.js";
import { HeldWeaponSchema } from "../core/world-events.js";
import { conditionLabels } from "../core/dialogue.js";
import { RED_MOON_DEFAULTS } from "../core/world-events.js";
import { attachHeldWeapon, defaultHeldWeapon } from "../render/held-weapon.js";

const el = (tag, text = "") => {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
};
function input(box, label, value, change, type = "text", attrs = {}) {
  const row = el("label", label),
    i = el(type === "textarea" ? "textarea" : "input");
  row.className = "field";
  if (type !== "textarea") i.type = type;
  Object.assign(i, attrs);
  i.value = value;
  i.oninput = () => change(type === "number" ? Number(i.value) : i.value);
  row.append(i);
  box.append(row);
  return i;
}
function select(box, label, value, options, change) {
  const row = el("label", label),
    s = el("select");
  row.className = "field";
  for (const [v, t] of options) {
    const o = el("option", t);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  s.onchange = () => change(s.value);
  row.append(s);
  box.append(row);
  return s;
}
function check(box, label, value, change) {
  const row = el("label", label),
    i = el("input");
  row.className = "check";
  i.type = "checkbox";
  i.checked = value;
  i.onchange = () => change(i.checked);
  row.prepend(i);
  box.append(row);
  return i;
}
export function conditionFields(box, config, project) {
  config.conditions ??= [];
  if (config.match)
    select(
      box,
      "Как проверять условия",
      config.match,
      [
        ["all", "Выполнены все"],
        ["any", "Выполнено хотя бы одно"],
      ],
      (v) => (config.match = v),
    );
  const rows = el("div");
  box.append(rows);
  function draw() {
    rows.replaceChildren();
    config.conditions.forEach((c, i) => {
      const row = el("div");
      row.className = "event-condition";
      rows.append(row);
      select(row, "Условие", c.kind, Object.entries(conditionLabels), (v) => {
        c.kind = v;
        c.target = "";
        draw();
      });
      const targets = c.kind.startsWith("quest")
        ? project.quests
        : project.entities.filter(
            (e) => e.kind === (c.kind.startsWith("enemy") ? "enemy" : "item"),
          );
      const opts = targets.map((t) => [t.id, `${t.title ?? t.name} · ${t.id}`]);
      select(
        row,
        "Цель",
        c.target,
        [["", "— Выберите цель —"], ...opts],
        (v) => (c.target = v),
      );
      const del = el("button", "Удалить условие");
      del.onclick = () => {
        config.conditions.splice(i, 1);
        draw();
      };
      row.append(del);
    });
  }
  const add = el("button", "＋ Условие");
  add.onclick = () => {
    if (config.conditions.length < 12) {
      config.conditions.push({
        kind: "questComplete",
        target: project.quests[0]?.id ?? "",
      });
      draw();
    }
  };
  box.append(add);
  draw();
}
function form(options, title, build) {
  const p = structuredClone(options.project),
    e = p.entities.find((e) => e.id === options.entity?.id),
    box = el("div");
  box.className = "event-editor";
  const beforeSave = build(box, p, e);
  const error = el("p");
  error.className = "wizard-error";
  error.setAttribute("role", "alert");
  box.append(error);
  const save = el("button", "Сохранить");
  save.className = "primary";
  save.dataset.eventSave = "true";
  save.onclick = async () => {
    try {
      beforeSave?.();
      if (await options.commit(p)) document.querySelector("#modal").close();
    } catch (err) {
      error.textContent = err.message;
    }
  };
  box.append(save);
  options.modal(title, box);
  return { box, p, e };
}
export function worldEventsEditor(o) {
  return form(o, "Красная луна и оформление игры", (box, p) => {
    const c = structuredClone(p.world.redMoon ?? RED_MOON_DEFAULTS);
    p.world.redMoon = c;
    check(box, "Включить ночь красной луны", c.enabled, (v) => (c.enabled = v));
    box.append(
      el(
        "p",
        "Ночь: 18:00–06:00. Случайный выбор один раз за ночь; результат сохраняется. Условия проверяются всю ночь. Событие длится до рассвета.",
      ),
    );
    select(
      box,
      "Как наступает красная луна",
      c.mode,
      [
        ["chance", "По вероятности"],
        ["conditions", "По условиям"],
        ["both", "Вероятность И условия"],
        ["either", "Вероятность ИЛИ условия"],
      ],
      (v) => (c.mode = v),
    );
    input(
      box,
      "Вероятность на ночь, %",
      c.chance * 100,
      (v) => (c.chance = v / 100),
      "number",
      { min: 0, max: 100, step: 1 },
    );
    conditionFields(box, c, p);
    box.append(el("h3", "Остров и проход красной луны"));
    let landEnabled = !!p.world.moonLand;
    const land = structuredClone(p.world.moonLand ?? {regionId: "", dormantHeight: -9, returnPosition: [...p.world.spawn]});
    check(box, "Скрывать участок рельефа вне красной луны", landEnabled, v => {landEnabled = v; if (v) p.world.moonLand = land; else delete p.world.moonLand;});
    select(box, "Временный участок", land.regionId, [["", "— Выберите участок —"], ...(p.world.terrain?.regions ?? []).map(r => [r.id, r.name])], v => land.regionId = v);
    input(box, "Высота дна вне события, м", land.dormantHeight, v => land.dormantHeight = v, "number", {min: -80, max: -0.1});
    for (const [i, axis] of ["X", "Y", "Z"].entries()) input(box, `Точка возврата на берег ${axis}`, land.returnPosition[i], v => land.returnPosition[i] = v, "number", {step: 0.5});
    if (landEnabled) p.world.moonLand = land;
    box.append(el("p", "В редакторе вылепите остров и проход внутри отдельного участка. В игре он поднимается только при красной луне; все объекты участка появляются вместе с ним. На рассвете игрок и оставленные вещи возвращаются на заданный берег. Точка возврата должна быть вне участка и на суше."));
    p.presentation ??= { theme: "classic" };
    select(
      box,
      "Шрифт и оформление игрового меню и книг",
      p.presentation.theme,
      [
        ["classic", "Классическое"],
        ["chronicle", "Летопись · готическая кириллица и латиница"],
      ],
      (v) => (p.presentation.theme = v),
    );
    box.append(
      el(
        "p",
        "Включите цикл суток в «День и ночь». Для проверки установите начало в 22:00 и вероятность 100%. Настройка относится к новой игре.",
      ),
    );
  });
}
export function spawnEditor(o) {
  return form(o, "Появление персонажа по времени", (box, p, e) => {
    const c = (e.spawn ??= {
      enabled: false,
      match: "all",
      conditions: [],
      windows: [{ from: 18, to: 6, chance: 1 }],
    });
    check(
      box,
      "Использовать расписание появления",
      c.enabled,
      (v) => (c.enabled = v),
    );
    box.append(
      el(
        "p",
        "Точка появления — позиция персонажа на карте. Проверка один раз за каждый интервал каждые сутки. Вне интервала персонаж скрыт. Погибшие остаются погибшими, добыча сохраняется. Равные часы означают полные сутки.",
      ),
    );
    const rows = el("div");
    box.append(rows);
    const draw = () => {
      rows.replaceChildren();
      c.windows.forEach((w, i) => {
        const row = el("fieldset");
        row.append(el("legend", `Интервал ${i + 1}`));
        rows.append(row);
        input(row, "С часа (0–23.99)", w.from, (v) => (w.from = v), "number", {
          min: 0,
          max: 23.99,
          step: 0.5,
        });
        input(row, "До часа (не включая)", w.to, (v) => (w.to = v), "number", {
          min: 0,
          max: 23.99,
          step: 0.5,
        });
        input(
          row,
          "Вероятность, %",
          w.chance * 100,
          (v) => (w.chance = v / 100),
          "number",
          { min: 0, max: 100 },
        );
        const del = el("button", "Удалить интервал");
        del.onclick = () => {
          c.windows.splice(i, 1);
          draw();
        };
        row.append(del);
      });
    };
    draw();
    const add = el("button", "＋ Интервал");
    add.onclick = () => {
      if (c.windows.length < 12) {
        c.windows.push({ from: 6, to: 18, chance: 1 });
        draw();
      }
    };
    box.append(add);
    conditionFields(box, c, p);
    return () => {
      if (!c.enabled) delete e.spawn;
    };
  });
}
export function heldWeaponEditor(o) {
  stopEnemyPreview(o.view);
  let preview, enabled, c, beginPreview;
  const result = form(o, "Оружие · хват и бьющая рука", (box, p, e) => {
    enabled = !!e.heldWeapon;
    c = (e.heldWeapon ??= defaultHeldWeapon());
    const enabledControl=check(box, "Показывать выбранное оружие в руке", enabled, v => enabled = v);
    select(box, "Модель оружия", c.assetId ?? "", [["", "Встроенный меч"], ...p.assets.map(a => [a.id, a.name])], v => c.assetId = v || null);
    const importButton = el("button", "＋ Импортировать оружие GLB");
    importButton.id = "held-import"; importButton.disabled = !o.importModel;
    importButton.onclick = async () => {
      try {
        e.heldWeapon = HeldWeaponSchema.parse(c);
        if (await o.commit(p)) {document.querySelector("#modal").close(); o.importModel(e.id, "held");}
      } catch (err) {box.querySelector(".wizard-error").textContent = err.message;}
    };
    box.append(importButton);
    select(box, "Бьющая рука", c.hand, [["right", "Правая"], ["left", "Левая"]], v => {c.hand = v; c.socket = ""; socket.value = "";});
    const names = [];
    o.view?.objects.get(e.id)?.traverse(n => {if (n.name && !n.userData.heldWeaponPart) names.push(n.name);});
    const socket = select(box, "Кость / узел крепления", c.socket, [["", "Автоматически найти кисть"], ...[...new Set(names)].map(n => [n, n])], v => c.socket = v);
    socket.id="held-socket";
    const autoFit=check(box,"Автоматически расположить хват в ладони",c.autoFit??false,v=>c.autoFit=v);autoFit.id="held-autofit";
    const axis=select(box,"Направление клинка в файле оружия",c.axis??"y",[["auto","Определить по длинной стороне"],["y","+Y"],["-y","−Y"],["x","+X"],["-x","−X"],["z","+Z"],["-z","−Z"]],v=>c.axis=v);axis.id="held-axis";
    const fit=el("button","↻ Найти кисть и сбросить подгонку");fit.id="held-auto-attach";box.append(fit);
    box.append(el("p","Сначала определяется кисть по костям и их именам; затем хват размещается по основаниям пальцев, если они есть. Ручные смещения и повороты добавляются к этому положению. Для старых проектов прежняя подгонка сохранена — кнопка выше включает новую."));
    const fitFields=[];
    input(box, "Длина модели, м", c.length, v => c.length = v, "number", {min: 0.05, max: 8, step: 0.05});
    input(box, "Место хвата от низа модели (0–1)", c.grip, v => c.grip = v, "number", {min: 0, max: 1, step: 0.01});
    for (const [i, axis] of ["X", "Y", "Z"].entries()) {
      fitFields.push(input(box, `Смещение ${axis} по осям кисти`, c.position[i], v => c.position[i] = v, "number", {step: 0.01}));
      fitFields.push(input(box, `Поворот ${axis}, °`, c.rotation[i] * 180 / Math.PI, v => c.rotation[i] = v * Math.PI / 180, "number", {step: 5}));
    }
    input(box, "Скрыть встроенные части модели (точные имена через запятую)", c.hideNodes.join(", "), v => c.hideNodes = v.split(",").map(x => x.trim()).filter(Boolean));
    box.append(el("p", "Оружие следует за кистью. Для своей модели назначьте анимацию удара в настройках боя: выбор руки не зеркалит импортированный клип. У встроенного персонажа удар выполняется выбранной рукой. Урон и дальность задаются в разделе боя."));
    const info = el("p"), start = el("button", "▶ Проверить удар"), pause = el("button", "Пауза"), reset = el("button", "Закончить просмотр");
    info.id="held-attachment-status";info.setAttribute("role","status");
    start.id = "held-preview"; pause.id = "held-pause"; reset.id = "held-stop";
    const progress = input(box, "Фаза удара", 0, v => {ensure()?.seek(Number(v));}, "range", {min: 0, max: 0.999, step: 0.001});
    progress.id = "held-phase";
    const apply = () => {
      if (!preview) return;
      try {
        const config = HeldWeaponSchema.parse(c);
        preview.apply({...e, heldWeapon: enabled ? config : undefined});
        const a = o.view.objects.get(e.id).userData.heldAttachment;
        info.textContent = a ? `${a.method==="manual"?"Выбран узел":a.method==="arm"?"Встроенная рука":a.method==="fallback"?"Временное крепление":"Найдена кисть"}: ${a.socket}. ${a.warning} ${a.palmAligned?"Хват выровнен по ладони. ":""}${preview.animated?"Изменения видны сразу; можно проверить удар.":"Нет анимации удара: показан статичный хват."}`:"Оружие выключено.";
      } catch {info.textContent = "Проверьте числовые значения: длина 0,05–8 м, хват 0–1.";}
    };
    const ensure = () => {
      if (!preview) {
        preview = weaponPreview(o.view, o.entity);
        if (!preview) return null;
        o.view.previewCleanup = () => {preview?.dispose(); preview = null;};
        o.view.editorPreview = dt => {if (preview) progress.value = preview.update(dt);};
        document.querySelector("#modal").classList.add("preview-dialog");
        const obj = o.view.objects.get(e.id);
        o.view.orbit.target.copy(obj.position).add(new T.Vector3(0, 1, 0));
        o.view.camera.position.copy(obj.position).add(new T.Vector3(3, 2.3, 4));
        o.view.orbit.update?.();
        apply();
      }
      return preview;
    };
    beginPreview=ensure;
    fit.onclick=()=>{enabled=true;enabledControl.checked=true;c.socket="";socket.value="";c.autoFit=true;autoFit.checked=true;c.axis="auto";axis.value="auto";c.position=[0,0,0];c.rotation=[0,0,0];fitFields.forEach(i=>i.value=0);ensure();apply();};
    start.onclick = () => {ensure()?.play();};
    pause.onclick = () => preview?.play(false);
    reset.onclick = () => {stopEnemyPreview(o.view); progress.value = 0; info.textContent = "Просмотр завершён. Настройки формы сохранены до закрытия окна.";};
    box.addEventListener("input", event => {if (event.target !== progress) apply();});
    box.addEventListener("change", event => {if (event.target !== progress) apply();});
    box.append(start, pause, reset, info);
    return () => {if (!enabled) delete e.heldWeapon; else e.heldWeapon = c;};
  });
  if(o.view?.objects)beginPreview?.();
  return result;
}
export function moonDoorEditor(o) {
  return form(o, "Тайная дверь красной луны", (box, p, e) => {
    let enabled = !!e.moonDoor;
    const c = (e.moonDoor ??= { duration: 4, refuge: null });
    check(
      box,
      "Растворять дверь при красной луне",
      enabled,
      (v) => (enabled = v),
    );
    input(
      box,
      "Время растворения, секунд",
      c.duration,
      (v) => (c.duration = v),
      "number",
      { min: 0.2, max: 60, step: 0.2 },
    );
    box.append(
      el(
        "p",
        "При красной луне камень светится алым и растворяется. Проход освобождается после завершения эффекта. Задайте прямоугольник подземелья, чтобы дверь не закрылась, пока игрок внутри.",
      ),
    );
    let bounds = c.refuge?.join(", ") ?? "";
    input(
      box,
      "Границы подземелья: Xmin, Zmin, Xmax, Zmax (или пусто)",
      bounds,
      (v) => (bounds = v),
    );
    return () => {
      if (!enabled) delete e.moonDoor;
      else {
        c.refuge = bounds.trim() ? bounds.split(",").map(Number) : null;
        e.solid = true;
        delete e.motion;
      }
    };
  });
}
export function bookEditor(o) {
  return form(o, "Книга и страницы", (box, p, e) => {
    let enabled = !!e.book;
    const c = (e.book ??= {
      author: "Неизвестный летописец",
      pages: ["Новая страница."],
    });
    check(box, "Это читаемая книга", enabled, (v) => (enabled = v));
    input(box, "Название", e.name, (v) => (e.name = v));
    input(box, "Автор", c.author, (v) => (c.author = v));
    const rows = el("div");
    box.append(rows);
    const draw = () => {
      rows.replaceChildren();
      c.pages.forEach((page, i) => {
        const row = el("fieldset");
        rows.append(row);
        input(
          row,
          `Страница ${i + 1}`,
          page,
          (v) => (c.pages[i] = v),
          "textarea",
        );
        const del = el("button", "Удалить страницу");
        del.onclick = () => {
          c.pages.splice(i, 1);
          draw();
        };
        row.append(del);
      });
    };
    draw();
    const add = el("button", "＋ Страница");
    add.onclick = () => {
      if (c.pages.length < 100) {
        c.pages.push("Новая страница.");
        draw();
      }
    };
    box.append(add);
    return () => {
      if (!enabled) delete e.book;
      else
        e.inspection = {
          enabled: true,
          description: e.inspection?.description ?? "",
        };
    };
  });
}
