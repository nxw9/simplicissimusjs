import { behaviorConfig, gearConfig, SLOTS } from "../core/equipment.js";
import { createEntity } from "../core/project.js";

function selectField(box, label, value, options, change, element) {
  const row = element("label", label, "field"),
    select = element("select");
  for (const [id, name] of options) {
    const o = element("option", name);
    o.value = id;
    select.append(o);
  }
  select.value = value;
  select.onchange = () => change(select.value);
  row.append(select);
  box.append(row);
  return select;
}
export function gearFields(box, e, project, { element, field }) {
  const cfg = gearConfig(e);
  e.gear = cfg;
  selectField(
    box,
    "Тип вещи",
    cfg.slot,
    [["none", "Обычный предмет"], ...Object.entries(SLOTS)],
    (v) => (cfg.slot = v),
    element,
  );
  field(
    box,
    "Урон оружия",
    cfg.damage,
    "number",
    (v) => (cfg.damage = Number(v)),
  );
  field(
    box,
    "Защита брони, % (общая защита до 80%)",
    cfg.armor,
    "number",
    (v) => (cfg.armor = Number(v)),
  );
  selectField(
    box,
    "3D-модель",
    e.assetId ?? "builtin",
    [
      ["builtin", "Встроенная форма"],
      ...project.assets.map((a) => [a.id, a.name]),
    ],
    (v) => {
      if (v === "builtin") {
        e.shape = "box";
        delete e.assetId;
      } else {
        e.shape = "model";
        e.assetId = v;
      }
    },
    element,
  );
  const details = element("details"),
    summary = element("summary", "Подгонка оружия в руке");
  details.append(summary);
  box.append(details);
  field(
    details,
    "Длина, м",
    cfg.length,
    "number",
    (v) => (cfg.length = Number(v)),
  );
  field(
    details,
    "Хват от низа (0–1)",
    cfg.grip,
    "number",
    (v) => (cfg.grip = Number(v)),
  );
  ["X", "Y", "Z"].forEach((axis, i) =>
    field(
      details,
      `Поворот ${axis}, °`,
      (cfg.rotation[i] * 180) / Math.PI,
      "number",
      (v) => (cfg.rotation[i] = (Number(v) * Math.PI) / 180),
    ),
  );
}
export function itemEditor({ entity, project, element, field, modal, commit }) {
  const p = structuredClone(project),
    e = p.entities.find((x) => x.id === entity.id),
    box = element("div", "", "character-settings");
  field(box, "Название", e.name, "text", (v) => (e.name = v));
  selectField(
    box,
    "Где находится в начале",
    e.itemOwner
      ? "actor:" + e.itemOwner
      : e.startInInventory
        ? "player"
        : "map",
    [
      ["map", "На карте"],
      ["player", "В инвентаре героя"],
      ...p.entities
        .filter((x) => ["enemy", "npc"].includes(x.kind))
        .map((x) => [
          "actor:" + x.id,
          `${x.name} (${x.id}) — добыча после смерти`,
        ]),
    ],
    (v) => {
      e.itemOwner = ["map", "player"].includes(v) ? null : v.slice(6);
      e.startInInventory = v === "player";
    },
    element,
  );
  gearFields(box, e, p, { element, field });
  box.append(
    element(
      "p",
      "Модель выберите из ассетов. Для нового GLB сначала импортируйте его в редактор. Вещь у персонажа не лежит на карте: её можно забрать при обыске тела.",
    ),
  );
  const save = element("button", "Сохранить предмет", "primary");
  save.onclick = async () => {
    if (await commit(p)) document.querySelector("#modal").close();
  };
  box.append(save);
  modal("Предмет и экипировка", box);
}
export function characterSettings({
  entity,
  project,
  element,
  field,
  modal,
  commit,
}) {
  const p = structuredClone(project),
    e = p.entities.find((x) => x.id === entity.id),
    box = element("div", "", "character-settings"),
    b = behaviorConfig(e);
  e.behavior = b;
  field(box, "Здоровье", e.health, "number", (v) => (e.health = Number(v)));
  if (e.kind === "npc") {
    const presets = {
      peaceful: {
        reaction: "flee",
        enemies: "flee",
        others: "neutral",
        assist: false,
      },
      guard: {
        reaction: "fight",
        enemies: "fight",
        others: "neutral",
        assist: true,
      },
      hostile: {
        reaction: "fight",
        enemies: "fight",
        others: "hostile",
        assist: true,
      },
    };
    const behavior = element("div");
    selectField(
      box,
      "Готовый характер",
      "custom",
      [
        ["custom", "Свои настройки"],
        ["peaceful", "Мирный житель"],
        ["guard", "Защитник своей группы"],
        ["hostile", "Враждует с чужими группами"],
      ],
      (v) => {
        if (presets[v]) {
          Object.assign(b, presets[v]);
          draw();
        }
      },
      element,
    );
    box.append(behavior);
    function draw() {
      behavior.replaceChildren();
      field(
        behavior,
        "Группа: латиница, цифры, _ (одинаковая = союзники)",
        b.faction,
        "text",
        (v) => (b.faction = v),
      );
      selectField(
        behavior,
        "Если ударили",
        b.reaction,
        [
          ["ignore", "Игнорировать"],
          ["flee", "Убегать"],
          ["fight", "Отвечать ударом"],
        ],
        (v) => (b.reaction = v),
        element,
      );
      selectField(
        behavior,
        "При встрече с врагами",
        b.enemies,
        [
          ["ignore", "Не вмешиваться"],
          ["flee", "Убегать"],
          ["fight", "Атаковать"],
        ],
        (v) => (b.enemies = v),
        element,
      );
      selectField(
        behavior,
        "NPC из других групп",
        b.others,
        [
          ["neutral", "Мирно сосуществовать"],
          ["hostile", "Атаковать"],
        ],
        (v) => (b.others = v),
        element,
      );
      selectField(
        behavior,
        "Помогать своей группе в бою",
        String(b.assist),
        [
          ["false", "Нет"],
          ["true", "Да"],
        ],
        (v) => (b.assist = v === "true"),
        element,
      );
      selectField(
        behavior,
        "В обычное время",
        b.routine,
        [
          ["stand", "Стоять на месте"],
          ["wander", "Гулять вокруг точки старта"],
        ],
        (v) => (b.routine = v),
        element,
      );
      field(
        behavior,
        "Радиус прогулки, м",
        b.radius,
        "number",
        (v) => (b.radius = Number(v)),
      );
    }
    draw();
  }
  selectField(
    box,
    "Можно погибнуть",
    String(!b.invulnerable),
    [
      ["true", "Да — после смерти доступен обыск"],
      ["false", "Нет — важный персонаж"],
    ],
    (v) => (b.invulnerable = v !== "true"),
    element,
  );
  box.append(element("h3", "Вещи при обыске тела"));
  box.append(
    element(
      "p",
      "Каждая вещь уникальна. После смерти её можно забрать один раз. Модель, урон и броня настраиваются прямо в карточке вещи.",
    ),
  );
  const loot = element("div");
  box.append(loot);
  function drawLoot() {
    loot.replaceChildren();
    for (const item of p.entities.filter((x) => x.kind === "item")) {
      const row = element("details"),
        title = element("summary", item.name);
      row.append(title);
      const label = element("label", "Положить в это тело "),
        check = element("input");
      check.type = "checkbox";
      check.checked = item.itemOwner === e.id;
      check.onchange = () => {
        item.itemOwner = check.checked ? e.id : null;
        if (check.checked) item.startInInventory = false;
      };
      label.append(check);
      row.append(label);
      field(row, "Название", item.name, "text", (v) => {
        item.name = v;
        title.textContent = v;
      });
      gearFields(row, item, p, { element, field });
      loot.append(row);
    }
  }
  for (const [slot, name] of [
    ["weapon", "Меч"],
    ["body", "Броня"],
    ["none", "Предмет"],
  ]) {
    const add = element("button", "＋ " + name);
    add.onclick = () => {
      const item = createEntity("item");
      item.position = [...e.position];
      item.name = name;
      item.itemOwner = e.id;
      item.startInInventory = false;
      item.gear = { ...gearConfig(), slot, armor: slot === "body" ? 15 : 0 };
      p.entities.push(item);
      drawLoot();
    };
    box.append(add);
  }
  drawLoot();
  const save = element("button", "Сохранить поведение и добычу", "primary");
  save.onclick = async () => {
    if (await commit(p)) document.querySelector("#modal").close();
  };
  box.append(save);
  modal(`${e.name} — поведение и добыча`, box);
}
