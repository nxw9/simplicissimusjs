export function rpgEditor({ project, element, field, modal, commit, openMount }) {
  const p = structuredClone(project),
    c = p.rpg,
    box = element("div", "", "rpg-settings");
  if (!c) {
    box.append(
      element(
        "p",
        "Этот проект не использует дополнительные правила RPG. Откройте проект с настроенными RPG-службами; квесты, оружие, книги и события доступны и без них.",
      ),
    );
    modal("Правила RPG", box);
    return;
  }
  box.append(
    element(
      "p",
      "Настройки сохраняются в проекте. Геометрия, модели, диалоги, квесты и механизмы редактируются обычными инструментами Hearth.",
    ),
  );
  const section = (title) => {
    const d = element("details");
    d.append(element("summary", title));
    box.append(d);
    return d;
  };
  const number = (b, title, o, key) =>
    field(b, title, o[key], "number", (v) => (o[key] = v));
  const select = (b, title, o, key, kind) => {
    const l = element("label", title, "field"),
      s = element("select");
    for (const e of p.entities.filter((e) => !kind || e.kind === kind)) {
      const op = element("option", `${e.name} · ${e.id}`);
      op.value = e.id;
      s.append(op);
    }
    s.value = o[key];
    s.onchange = () => (o[key] = s.value);
    l.append(s);
    b.append(l);
  };
  const combat = section("Лечение и кузница");
  for (const [key, label] of [
    ["startingPotions", "Настои в начале"],
    ["potionHeal", "Здоровье от настоя"],
    ["potionCost", "Цена настоя"],
  ])
    number(combat, label, c, key);
  c.upgradeCosts.forEach((_, i) =>
    field(
      combat,
      `Цена улучшения ${i + 1}`,
      c.upgradeCosts[i],
      "number",
      (v) => (c.upgradeCosts[i] = v),
    ),
  );
  const roles = section("Персонажи и интерактивные объекты");
  for (const [key, label] of [
    ["rest", "Костёр"],
    ["healer", "Травница"],
    ["smith", "Кузнец"],
    ["horse", "Конь"],
  ])
    select(
      roles,
      label,
      c.services,
      key,
      ["healer", "smith"].includes(key) ? "npc" : "prop",
    );
  if (openMount) {
    const mount = element("button", "Настроить модель маунта и посадку");
    mount.onclick = async () => {if (await commit(p)) openMount();}; roles.append(mount);
  }
  const rewards = section("Награды заданий");
  for (const q of p.quests) {
    const r = (c.rewards[q.id] ??= { xp: 0, potions: 0, items: [] });
    rewards.append(element("h4", q.title));
    number(rewards, "Опыт", r, "xp");
    number(rewards, "Настои", r, "potions");
    field(
      rewards,
      "Выдать предметы (ID через запятую)",
      r.items.join(", "),
      "text",
      (v) =>
        (r.items = v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)),
    );
  }
  const enemies = section("Награды за противников");
  for (const e of p.entities.filter((e) => e.kind === "enemy")) {
    const r = (c.enemyRewards[e.id] ??= { xp: 25, gold: 12 });
    enemies.append(element("h4", e.name));
    number(enemies, "Опыт", r, "xp");
    number(enemies, "Монеты", r, "gold");
  }
  const travel = section("Корабль и море");
  select(travel, "Объект корабля", c.ship, "entity", "prop");
  number(travel, "Длительность рейса, секунды", c.ship, "duration");
  for (const port of ["from", "to"])
    for (let i = 0; i < 3; i++)
      field(
        travel,
        `${port === "from" ? "Берег" : "Остров"} · ${["X", "Y", "Z"][i]}`,
        c.ship[port][i],
        "number",
        (v) => (c.ship[port][i] = v),
      );
  number(travel, "Высота палубы над началом модели", c.ship, "deckHeight");
  number(travel, "Уровень моря", c.water, "height");
  field(
    travel,
    "Цвет моря",
    c.water.color,
    "color",
    (v) => (c.water.color = v),
  );
  const advanced = section(
    "Все правила JSON: условия короны, припасы, границы склепа",
  );
  advanced.append(
    element(
      "p",
      "Правьте формы или JSON. Если JSON не изменён, сохраняются формы.",
    ),
  );
  const area = element("textarea");
  area.value = JSON.stringify(c, null, 2);
  let edited = false;
  area.oninput = () => (edited = true);
  const refresh = element("button", "Обновить JSON из форм");
  refresh.onclick = () => {
    area.value = JSON.stringify(c, null, 2);
    edited = false;
  };
  advanced.append(refresh, area);
  const err = element("p"),
    save = element("button", "Сохранить правила", "primary");
  save.onclick = async () => {
    try {
      if (edited) p.rpg = JSON.parse(area.value);
      if (await commit(p)) document.querySelector("#modal").close();
    } catch (e) {
      err.textContent = e.message;
    }
  };
  box.append(err, save);
  modal("RPG · правила и награды", box);
}
