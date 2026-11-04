import { generateHighlands } from "./highlands.js";
import { generateMazeAdventure } from "./maze.js";
import { validateProject, FORMAT_VERSION } from "../core/project.js";
import { createTerrain, heightAt, groundPosition } from "../core/terrain.js";
import { behaviorConfig, gearConfig } from "../core/equipment.js";
import { enemyConfig } from "../core/enemy.js";
import { questChoices } from "../core/dialogue.js";
import { STORIES, BIOMES } from "./stories.js";

export const GENERATOR_VERSION = 1;
export const SIZES = {
  small: { name: "Короткое", size: 100, trees: 100 },
  medium: { name: "Обычное", size: 140, trees: 180 },
  large: { name: "Большое", size: 180, trees: 260 },
};
export const DIFFICULTIES = {
  story: { name: "История", hp: 30, damage: 3, speed: 1.3 },
  normal: { name: "Обычная", hp: 50, damage: 6, speed: 1.7 },
  hard: { name: "Сложная", hp: 80, damage: 10, speed: 2.1 },
};
export { STORIES, BIOMES };

function hash(text, initial = 2166136261) {
  let value = initial;
  for (let i = 0; i < text.length; i++)
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}
function random(seed) {
  let value = hash(seed);
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function normalizeOptions(options = {}) {
  const seed = String(options.seed ?? "hearth").trim();
  if (!seed || seed.length > 80)
    throw Error("Seed должен содержать от 1 до 80 символов.");
  const result = {
    seed,
    story: options.story ?? "random",
    biome: options.biome ?? "story",
    size: options.size ?? "medium",
    difficulty: options.difficulty ?? "normal",
    sideQuests: options.sideQuests ?? 2,
  };
  const mode = options.mode ?? "adventure";
  if (!["adventure", "maze", "highlands"].includes(mode))
    throw Error("Неизвестный вид игры");
  if (mode !== "adventure") result.mode = mode;
  for (const [key, values] of [
    ["story", ["random", ...Object.keys(STORIES)]],
    ["biome", ["story", ...Object.keys(BIOMES)]],
    ["size", Object.keys(SIZES)],
    ["difficulty", Object.keys(DIFFICULTIES)],
  ])
    if (!values.includes(result[key]))
      throw Error(`Неизвестная настройка: ${key}`);
  if (
    !Number.isInteger(result.sideQuests) ||
    result.sideQuests < 0 ||
    result.sideQuests > 3
  )
    throw Error("Число побочных квестов: от 0 до 3.");
  return result;
}
export function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
const condition = (kind, target) => ({ kind, target });
const complete = (id) => condition("questComplete", id);
const fresh = (id) => condition("questNew", id);
const choice = (id, text, next = null, conditions = [], action = null) => ({
  id,
  text,
  next,
  conditions,
  action,
  showLocked: false,
});
const leave = () => choice("leave", "До встречи");

/** Pure and deterministic: no clock, network, global random or renderer. Standard v17 project output. */
export function generateAdventure(options = {}) {
  const config = normalizeOptions(options);
  const signature = JSON.stringify([GENERATOR_VERSION, config]);
  const rng = random(signature),
    pick = (list) => list[Math.floor(rng() * list.length)];
  const storyKey =
    config.story === "random" ? pick(Object.keys(STORIES)) : config.story;
  const story = STORIES[storyKey],
    biome = BIOMES[config.biome === "story" ? story.biome : config.biome];
  if (config.mode === "maze")
    return generateMazeAdventure(
      config,
      rng,
      `${hash(signature).toString(16)}-${hash(signature, 333555777).toString(16)}`,
      biome,
      DIFFICULTIES[config.difficulty],
    );
  if (config.mode === "highlands")
    return generateHighlands(
      config,
      rng,
      `${hash(signature).toString(16)}-${hash(signature, 333555777).toString(16)}`,
      biome,
      DIFFICULTIES[config.difficulty],
    );
  const dimensions = SIZES[config.size],
    difficulty = DIFFICULTIES[config.difficulty];
  const village = pick([
    "Тихая Заводь",
    "Ясный Дол",
    "Серебряный Брод",
    "Старые Ключи",
    "Вересковый Предел",
    "Каменный Берег",
  ]);
  const names = [
    pick(["Мира", "Рада", "Лада", "Элина"]),
    pick(["Тихон", "Савелий", "Велемир", "Остен"]),
    pick(["Ная", "Ива", "Тая", "Ярина"]),
  ];
  const scale = dimensions.size / 100;
  const hub = [0, 27 * scale];
  const angle = (rng() - 0.5) * 0.3;
  const slots = [
    [-27, 8],
    [25, 4],
    [-23, -22],
    [24, -23],
    [0, -36],
  ].map(([x, z]) => [
    (x * Math.cos(angle) - z * Math.sin(angle)) * scale,
    (x * Math.sin(angle) + z * Math.cos(angle)) * scale,
  ]);
  // Keep shrine remote, shuffle the four other destinations.
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const [archive, camp, grove, watch, shrine] = slots;
  const sites = [hub, ...slots],
    roads = slots.map((site) => [hub, site]);
  const world = {
    size: dimensions.size,
    sky: biome.sky,
    ground: biome.ground,
    spawn: [0, 1.7, hub[1] + 5],
    terrain: createTerrain(64),
    dayNight: { enabled: true, dayMinutes: 24, startHour: 8 },
  };
  const pathDistance = (x, z) =>
    Math.min(...roads.map(([a, b]) => segmentDistance(x, z, a, b)));
  const siteDistance = (x, z) =>
    Math.min(...sites.map(([sx, sz]) => Math.hypot(x - sx, z - sz)));
  const phase = rng() * Math.PI * 2,
    n = world.terrain.resolution;
  world.terrain.paint = [];
  for (let iz = 0; iz <= n; iz++)
    for (let ix = 0; ix <= n; ix++) {
      const x = (ix / n - 0.5) * world.size,
        z = (iz / n - 0.5) * world.size;
      const road = pathDistance(x, z),
        site = siteDistance(x, z);
      const edge = Math.min(ix, iz, n - ix, n - iz) / 3;
      const fade = Math.max(
        0,
        Math.min(1, (road - 4) / 7, (site - 8) / 7, edge),
      );
      world.terrain.heights[iz * (n + 1) + ix] =
        ix === 0 || iz === 0 || ix === n || iz === n
          ? 0
          : +(
              (Math.sin(x * 0.075 + phase) + Math.cos(z * 0.065 - phase) + 2) *
              0.6 *
              fade
            ).toFixed(4);
      world.terrain.paint.push(road < 3 || site < 6 ? 3 : 1);
    }
  world.terrain.regions = [
    {
      id: "generated-land",
      name: biome.name,
      min: [-world.size / 2, -world.size / 2],
      max: [world.size / 2, world.size / 2],
    },
  ];
  world.spawn = groundPosition(world, world.spawn);
  const entities = [],
    quests = [];
  const add = (id, name, kind, shape, point, extra = {}) => {
    const entity = {
      id,
      name,
      kind,
      shape,
      position: [point[0], heightAt(world, ...point), point[1]],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: biome.rock,
      solid: kind === "prop",
      ...extra,
    };
    entities.push(entity);
    return entity;
  };
  const npc = (id, name, point, text, color) =>
    add(id, name, "npc", "humanoid", point, {
      color,
      dialogue: text,
      behavior: {
        ...behaviorConfig({ kind: "npc" }),
        invulnerable: true,
        reaction: "ignore",
        enemies: "ignore",
      },
      dialogueTree: {
        start: "start",
        nodes: [{ id: "start", title: name, text, choices: [leave()] }],
      },
    });
  const guide = npc(
    "guide",
    `${names[0]} · хранитель`,
    [hub[0] - 2, hub[1]],
    `${village}. ${story.crisis} ${story.rumor}`,
    "#dfb878",
  );
  const witness = npc(
    "witness",
    `${names[1]} · свидетель`,
    [camp[0] - 2, camp[1]],
    "Мне есть что рассказать. Сначала принеси хранителю документ из архива — иначе мне снова никто не поверит.",
    "#94b9c2",
  );
  const helper = npc(
    "helper",
    `${names[2]} · следопыт`,
    [hub[0] + 3, hub[1] + 1],
    "Большие решения ничего не стоят, если забыть о тех, кому нужна помощь сегодня.",
    "#acba75",
  );
  const hint = (point) =>
    `Ориентир: X ${Math.round(point[0])}, Z ${Math.round(point[1])}. От поселения ведёт светлая тропа.`;
  const item = (id, name, point, text, extra = {}) => {
    const e = add(id, name, "item", "sphere", point, {
      scale: [0.65, 0.65, 0.65],
      color: "#f3d890",
      inspection: { enabled: true, description: text },
      ...extra,
    });
    e.position[1] += 0.65;
    return e;
  };
  item("clue", `${story.clue} · архив`, archive, story.reveal);
  item(
    "token",
    `${story.token} · лагерь`,
    [camp[0] + 2, camp[1] + 1],
    story.witness,
  );
  item(
    "relic",
    `${story.relic} · святилище`,
    [shrine[0], shrine[1] + 2],
    "Последний предмет старого договора. Решение о его судьбе принадлежит тебе.",
  );
  const enemy = (id, name, point, hp = 1) =>
    add(id, name, "enemy", "humanoid", point, {
      color: "#ae6660",
      health: Math.round(difficulty.hp * hp),
      enemy: {
        ...enemyConfig({}),
        speed: difficulty.speed,
        damage: difficulty.damage,
        notice: 7,
        reach: 1.5,
        cooldown: 1.6,
      },
      behavior: {
        ...behaviorConfig({ kind: "enemy" }),
        faction: "guardians",
        reaction: "fight",
      },
    });
  enemy("guardian-a", "Страж договора · святилище", [
    shrine[0] - 5,
    shrine[1] - 2,
  ]);
  enemy(
    "guardian-b",
    "Хранитель печати · святилище",
    [shrine[0] + 5, shrine[1] - 2],
    1.2,
  );
  item(
    "traveller-blade",
    "Клинок путника",
    hub,
    "Открой инвентарь (I), выбери клинок и экипируй его.",
    {
      startInInventory: true,
      shape: "box",
      scale: [0.12, 0.7, 0.12],
      gear: { ...gearConfig(), slot: "weapon", damage: 30 },
    },
  );
  item(
    "traveller-coat",
    "Куртка путника",
    hub,
    "Защищает от ударов. Экипируй через инвентарь (I).",
    {
      startInInventory: true,
      gear: { ...gearConfig(), slot: "body", armor: 25 },
    },
  );
  const addQuest = (
    id,
    title,
    giver,
    target,
    type = "collect",
    reward = 25,
  ) => {
    const targets = Array.isArray(target) ? target : [target];
    const q = {
      id,
      title,
      giver: giver.id,
      target: targets[0],
      type,
      required: 1,
      reward,
      ...(type === "defeat" ? { targets } : {}),
    };
    quests.push(q);
    return q;
  };
  const node = (
    actor,
    id,
    text,
    conditions = [],
    priority = 10,
    choices = [leave()],
  ) => {
    actor.dialogueTree.nodes.push({
      id,
      title: actor.name,
      text,
      conditions,
      priority,
      autoStart: true,
      choices,
    });
  };
  // Every stage has a briefing, an active reminder and an immediate debrief.
  const stage = (
    actor,
    q,
    brief,
    result,
    requirements = [],
    priority = 10,
    extraChoices = [],
  ) => {
    const [accept, claim] = questChoices(q);
    accept.next = `${q.id}-active`;
    claim.next = `${q.id}-done`;
    node(
      actor,
      `${q.id}-offer`,
      brief,
      [...requirements, fresh(q.id)],
      priority,
      [accept, ...extraChoices, leave()],
    );
    node(
      actor,
      `${q.id}-active`,
      brief,
      [condition("questActive", q.id)],
      priority + 1,
      [claim, leave()],
    );
    node(actor, `${q.id}-done`, result, [complete(q.id)], priority + 2);
  };
  const evidence = addQuest("evidence", "I · Следы лжи: архив", guide, "clue");
  stage(
    guide,
    evidence,
    `${guide.dialogue}\n\nНайди «${story.clue}» в архиве, затем вернись ко мне. ${hint(archive)}\n\nЯ стою у начала троп. Экипировка уже в твоём инвентаре (I).`,
    `${story.reveal}\n\nТеперь разыщи свидетеля ${names[1]} в лагере. ${hint(camp)} По возвращении расскажи мне, кому можно доверять.`,
  );
  const testimony = addQuest(
    "testimony",
    "II · Голос свидетеля: лагерь",
    witness,
    "token",
  );
  stage(
    witness,
    testimony,
    `${story.witness}\n\nЗабери «${story.token}» рядом со мной и покажи мне. Я подтвержу его происхождение.`,
    "Теперь у тебя есть и документ, и свидетельство. Вернись к хранителю в поселение. Решать придётся тебе.",
    [complete("evidence")],
  );
  node(
    guide,
    "await-witness",
    `${story.reveal}\n\nПоговори со свидетелем ${names[1]}, забери его доказательство и заверши его задание. ${hint(camp)}`,
    [complete("evidence"), fresh("testimony")],
    20,
  );
  node(
    guide,
    "await-testimony",
    "Сначала заверши задание свидетеля в лагере. Без его подтверждения совет отвергнет документ.",
    [condition("questActive", "testimony")],
    21,
  );
  const restore = addQuest(
    "restore",
    `III · ${story.restore}`,
    guide,
    "relic",
    "collect",
    70,
  );
  const release = addQuest(
    "release",
    `III · ${story.release}`,
    guide,
    ["guardian-a", "guardian-b"],
    "defeat",
    70,
  );
  const restoreChoice = questChoices(restore)[0],
    releaseChoice = questChoices(release)[0];
  restoreChoice.text = `${story.restore} — сохранить силу и принять её цену`;
  releaseChoice.text = `${story.release} — отказаться от силы и начать заново`;
  restoreChoice.next = "restore-active";
  releaseChoice.next = "release-active";
  node(
    guide,
    "decision",
    `${story.reveal}\n\nЕсть два пути. ${story.restoreTask} Либо: ${story.releaseTask}\n\nВыбор окончательный для этого прохождения. Побочные задания можно завершить до или после финала.`,
    [complete("testimony"), fresh("restore"), fresh("release")],
    40,
    [restoreChoice, releaseChoice, leave()],
  );
  // Branch offers are only reachable from decision; active stages survive reloads.
  for (const [q, task, ending, other] of [
    [restore, story.restoreTask, story.endingRestore, "release"],
    [release, story.releaseTask, story.endingRelease, "restore"],
  ]) {
    stage(
      guide,
      q,
      `${task}\n\n${hint(shrine)} После выполнения вернись ко мне в поселение.`,
      `${ending}\n\n${config.sideQuests ? story.noSideEnding : "Поселение будет помнить этот выбор."}\n\nФИНАЛ · ${q.title.slice(6)}. Можно продолжать исследование.`,
      [complete("testimony"), fresh(other)],
      50,
    );
    // The shared decision is the only offer: don't let stage auto-start pick a branch for the player.
    guide.dialogueTree.nodes.find((n) => n.id === `${q.id}-offer`).autoStart =
      false;
    if (config.sideQuests)
      node(
        guide,
        `${q.id}-hope`,
        `${ending}\n\n${story.sideEnding}\n\nФИНАЛ · ${q.title.slice(6)}. Твои малые поступки изменили судьбу поселения.`,
        [complete(q.id), complete("supplies")],
        90,
      );
    if (config.sideQuests) {
      const activeNode = guide.dialogueTree.nodes.find(
        (n) => n.id === `${q.id}-active`,
      );
      const claim = activeNode.choices[0];
      activeNode.choices.unshift({
        ...claim,
        id: `${claim.id}-hope`,
        next: `${q.id}-hope`,
        conditions: [...claim.conditions, complete("supplies")],
      });
      // Hide the ordinary epilogue once aid has been delivered, both during and after play.
      claim.conditions.push(fresh("supplies"));
      activeNode.choices.splice(1, 0, {
        ...claim,
        id: `${claim.id}-pending`,
        conditions: [
          condition("questReady", q.id),
          condition("questActive", "supplies"),
        ],
      });
    }
    const pillar = add(
      `monument-${q.id}`,
      q.id === "restore" ? "Знак нового договора" : "Знак освобождения",
      "prop",
      "sphere",
      [hub[0] + (q.id === "restore" ? -6 : 6), hub[1] - 5],
      {
        scale: [1, 1, 1],
        color: q.id === "restore" ? "#efc875" : "#8fc5da",
        solid: false,
        motion: {
          trigger: "auto",
          condition: "quest",
          target: q.id,
          offset: [0, 4, 0],
          rotation: [0, Math.PI * 2, 0],
          pivot: "origin",
          duration: 4,
        },
      },
    );
    pillar.inspection = {
      enabled: true,
      description:
        "Поднимется над поселением, когда будет решена судьба договора.",
    };
  }
  if (config.sideQuests >= 1) {
    item("supplies-item", `${story.sideItem} · роща`, grove, story.sideReason);
    stage(
      helper,
      addQuest(
        "supplies",
        "Помощь поселению: роща",
        helper,
        "supplies-item",
        "collect",
        35,
      ),
      `${story.sideReason} ${hint(grove)}\n\nПринеси находку мне в поселение. Это повлияет на последствия финала.`,
      story.sideEnding,
      [],
      10,
    );
  }
  if (config.sideQuests >= 2) {
    enemy("watch-a", "Мародёр · дозорная башня", [watch[0] - 3, watch[1]]);
    enemy("watch-b", "Налётчик · дозорная башня", [watch[0] + 3, watch[1] - 3]);
    stage(
      helper,
      addQuest(
        "safe-road",
        "Безопасная дорога: башня",
        helper,
        ["watch-a", "watch-b"],
        "defeat",
        45,
      ),
      `Двое мародёров грабят обозы у дозорной башни. Победи обоих и вернись ко мне. ${hint(watch)}\n\nЭто откроет возможность вернуть семейную реликвию.`,
      "Обозы снова могут ходить. Теперь можно искать потерянную реликвию.",
      config.sideQuests ? [complete("supplies")] : [],
      20,
    );
  }
  if (config.sideQuests >= 3) {
    item(
      "heirloom",
      "Компас переселенцев · башня",
      [watch[0] + 2, watch[1] + 3],
      "На крышке: «Дом — там, куда мы придём вместе». Он принадлежал семье следопыта.",
    );
    stage(
      helper,
      addQuest(
        "heirloom",
        "Не золото, а память",
        helper,
        "heirloom",
        "collect",
        30,
      ),
      `После нападения у башни остался компас моей семьи. Верни его — это единственная вещь, которую мы унесли из прежнего дома. ${hint(watch)}`,
      "Ты вернул не вещь, а историю моей семьи. Когда понадобится проводник, я помогу.",
      [complete("safe-road")],
      30,
    );
  }
  const placeNames = [
    village,
    "Архив",
    "Лагерь свидетеля",
    "Роща",
    "Дозорная башня",
    "Святилище",
  ];
  sites.forEach((point, i) => {
    add(
      `landmark-${i}`,
      placeNames[i],
      "prop",
      "ruin",
      [point[0], point[1] - 5],
      {
        scale: [1.2, 1.2, 1.2],
        inspection: {
          enabled: true,
          description: `${placeNames[i]}. ${hint(point)}`,
        },
      },
    );
    add(
      `waypoint-${i}`,
      `Камень пути · ${placeNames[i]}`,
      "prop",
      "sphere",
      [point[0] + 4, point[1] + 3],
      {
        scale: [0.5, 0.6, 0.5],
        color: "#d8cead",
        solid: false,
        inspection: {
          enabled: true,
          description: `${placeNames[i]}. Светлые тропы ведут обратно в поселение.`,
        },
      },
    );
  });
  add(
    "generation-notes",
    "Карта и летопись путешествия",
    "prop",
    "box",
    [hub[0] - 4, hub[1] + 3],
    {
      scale: [1, 0.7, 0.3],
      color: "#c1a780",
      inspection: {
        enabled: true,
        description: `${village} — ${story.subtitle}\n${story.crisis}\n\n${placeNames.map((name, i) => `${name}: X ${Math.round(sites[i][0])}, Z ${Math.round(sites[i][1])}`).join("\n")}\n\nГенератор v${GENERATOR_VERSION}. Настройки для повторения:\n${JSON.stringify(config)}\n\nНачни с хранителя. Светлые тропы соединяют поселение со всеми местами. В диалоге принимай и сдавай задания; найденные заранее предметы тоже учитываются. Развилка — окончательный выбор, помощь поселению улучшает эпилог.`,
      },
    },
  );
  // Rejection sampling has a fixed bound; critical destinations and paths stay clear.
  for (
    let attempt = 0, count = 0;
    attempt < dimensions.trees * 30 && count < dimensions.trees;
    attempt++
  ) {
    const x = (rng() - 0.5) * (world.size - 8),
      z = (rng() - 0.5) * (world.size - 8);
    if (siteDistance(x, z) < 10 || pathDistance(x, z) < 5) continue;
    const tree = rng() > 0.18,
      s = 0.7 + rng() * 0.6;
    add(
      `scenery-${count++}`,
      tree ? "Дерево" : "Валун",
      "prop",
      tree ? "tree" : "sphere",
      [x, z],
      {
        environment: true,
        collision: tree ? "trunk" : "box",
        color: tree ? biome.tree : biome.rock,
        scale: tree ? [s, s * (1 + rng() * 0.5), s] : [s, s * 0.6, s],
      },
    );
  }
  return validateProject({
    format: "hearth-project",
    schemaVersion: FORMAT_VERSION,
    id: `generated-v${GENERATOR_VERSION}-${hash(signature).toString(16)}-${hash(signature, 333555777).toString(16)}`,
    title: `${village}: ${story.subtitle}`,
    contentVersion: 1,
    weapon: null,
    world,
    assets: [],
    entities,
    quests,
  });
}
