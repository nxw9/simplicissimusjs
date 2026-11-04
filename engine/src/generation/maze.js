import { validateProject, FORMAT_VERSION } from "../core/project.js";
import { behaviorConfig, gearConfig } from "../core/equipment.js";
import { enemyConfig } from "../core/enemy.js";
import { questChoices } from "../core/dialogue.js";
import { createMazeLayout, CELL_SIZE, edgeKey } from "./maze-layout.js";

const c = (kind, target) => ({ kind, target });
const leave = () => ({
  id: "leave",
  text: "До встречи",
  next: null,
  conditions: [],
  showLocked: false,
  action: null,
});
const chapters = [
  [
    "Медный ключ",
    "Водосбор",
    "Вода ушла из нижних залов. Старый водосбор запечатан, и лагерю нечего пить.",
    "Вода снова течёт к лагерю. На ключе обнаружен знак архивистов: они знали о перекрытии.",
  ],
  [
    "Серебряный ключ",
    "Архив",
    "В архиве спрятан приказ о закрытии комплекса. Найди ключ и принеси его: я сверю печать с уцелевшей копией.",
    "Архив подтверждает: двери закрыли намеренно, оставив рабочих внутри. Это был не обвал.",
  ],
  [
    "Янтарный ключ",
    "Мастерская",
    "Замки подчинены старому механизму. В мастерской оставлен ключ настройки — без него нельзя снять следующую печать.",
    "Механизм отремонтирован. Записи мастера ведут к сердцу лабиринта, где хранятся имена пропавших.",
  ],
  [
    "Лазурный ключ",
    "Обсерватория",
    "Смотритель стёр направление к сердцу. В забытом проходе лежит ключ от звёздного затвора.",
    "На карте вновь видна дорога. Смотритель не охранял людей: он охранял тайну совета.",
  ],
  [
    "Обсидиановый ключ",
    "Зал клятв",
    "Последняя печать признаёт только ключ старшего хранителя. Найди его и помоги мне отменить приказ о вечной изоляции.",
    "Приказ отменён. Осталось вынести летопись и назвать тех, кто приказал запереть людей.",
  ],
];
const sideStories = [
  [
    "Письма пропавшей экспедиции",
    "Письма экспедиции",
    "Мой брат был среди запертых. В боковом архиве остались его письма. Найди ключ архивариуса, открой дверь и принеси их мне.",
    "В письмах сохранились имена и адреса. Теперь семьи узнают правду.",
  ],
  [
    "Лекарство для лагеря",
    "Ларец лекарств",
    "В боковом лазарете есть лекарства. Его ключ потерян в ближайшей секции. Найди его, открой лазарет и верни ларец.",
    "Раненые получили лекарства. Экспедиция сможет вернуться домой без новых потерь.",
  ],
  [
    "Последний свет",
    "Линза маяка",
    "В заброшенном хранилище спрятана линза. Найди ключ кладовщика и верни её, чтобы зажечь сигнал для заблудившихся.",
    "Маяк снова светит. Теперь пропавшие группы смогут найти дорогу к выходу.",
  ],
];

export function generateMazeAdventure(
  config,
  rng,
  identity,
  biome,
  difficulty,
) {
  const layout = createMazeLayout(config.size, rng, config.sideQuests),
    { n, root, path, gates, adj, optional } = layout;
  const cell = CELL_SIZE,
    width = n * cell,
    half = width / 2,
    worldSize = width + 40;
  const point = (id) => [
    ((id % n) - (n - 1) / 2) * cell,
    0,
    (Math.floor(id / n) - (n - 1) / 2) * cell - 6,
  ];
  const rootPoint = point(root),
    front = half - 6,
    outside = [rootPoint[0], 0, front + 7];
  const entities = [],
    quests = [];
  const add = (id, name, kind, shape, position, extra = {}) => {
    const e = {
      id,
      name,
      kind,
      shape,
      position: [...position],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: biome.rock,
      solid: kind === "prop",
      ...extra,
    };
    entities.push(e);
    return e;
  };
  const npc = (id, name, position, text) =>
    add(id, name, "npc", "humanoid", position, {
      solid: false,
      color: "#c7b688",
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
  const item = (id, name, at, text, extra = {}) =>
    add(id, name, "item", "sphere", [at[0], 0.7, at[2]], {
      solid: false,
      color: "#f4d484",
      scale: [0.65, 0.65, 0.65],
      inspection: { enabled: true, description: text },
      ...extra,
    });
  const quest = (id, title, giver, target, reward = 30) => {
    const q = {
      id,
      title,
      giver: giver.id,
      target,
      type: "collect",
      required: 1,
      reward,
    };
    quests.push(q);
    return q;
  };
  const stage = (actor, q, text, result, requires = [], priority = 10) => {
    const [accept, claim] = questChoices(q);
    accept.next = `${q.id}-active`;
    claim.next = `${q.id}-done`;
    for (const [id, body, conditions, choices, rank] of [
      [
        `${q.id}-offer`,
        text,
        [...requires, c("questNew", q.id)],
        [accept, leave()],
        priority,
      ],
      [
        `${q.id}-active`,
        text,
        [c("questActive", q.id)],
        [claim, leave()],
        priority + 1,
      ],
      [
        `${q.id}-done`,
        result,
        [c("questComplete", q.id)],
        [leave()],
        priority + 2,
      ],
    ])
      actor.dialogueTree.nodes.push({
        id,
        title: actor.name,
        text: body,
        conditions,
        choices,
        autoStart: true,
        priority: rank,
      });
  };
  const gate = (id, name, a, b, condition, target, automatic = false) => {
    const mid = [(a[0] + b[0]) / 2, 2.25, (a[2] + b[2]) / 2],
      vertical = Math.abs(a[0] - b[0]) > Math.abs(a[2] - b[2]);
    return add(id, name, "prop", "box", mid, {
      scale: vertical ? [0.45, 4.5, cell] : [cell, 4.5, 0.45],
      color: condition === "item" ? "#b69150" : "#657f91",
      solid: true,
      collision: "box",
      motion: {
        trigger: automatic ? "auto" : "interact",
        condition,
        target,
        offset: [0, 4.8, 0],
        rotation: [0, 0, 0],
        pivot: "origin",
        duration: 1.2,
      },
    });
  };
  const wall = (id, a, b) => {
    const vertical = a[0] === b[0];
    return add(
      id,
      "Каменная стена",
      "prop",
      "box",
      [(a[0] + b[0]) / 2, 2.25, (a[2] + b[2]) / 2],
      {
        scale: vertical
          ? [0.45, 4.5, Math.abs(a[2] - b[2]) + 0.45]
          : [Math.abs(a[0] - b[0]) + 0.45, 4.5, 0.45],
        environment: true,
        collision: "box",
        color: biome.rock,
      },
    );
  };
  // Cell tiles are also stable, editable anchors used by the corridor navigator.
  for (let id = 0; id < n * n; id++) {
    const p = point(id),
      row = Math.floor(id / n),
      col = id % n;
    add(
      `maze-cell-${row}-${col}`,
      `Пол · ${row + 1}:${col + 1}`,
      "prop",
      "box",
      [p[0], -0.015, p[2]],
      {
        scale: [cell, 0.06, cell],
        solid: false,
        environment: true,
        color: (row + col) % 2 ? "#77786e" : "#838476",
      },
    );
    if (col < n - 1 && !adj[id].includes(id + 1))
      wall(
        `maze-wall-${edgeKey(id, id + 1)}`,
        [p[0] + cell / 2, 0, p[2] - cell / 2],
        [p[0] + cell / 2, 0, p[2] + cell / 2],
      );
    if (row < n - 1 && !adj[id].includes(id + n))
      wall(
        `maze-wall-${edgeKey(id, id + n)}`,
        [p[0] - cell / 2, 0, p[2] + cell / 2],
        [p[0] + cell / 2, 0, p[2] + cell / 2],
      );
  }
  wall("maze-boundary-north", [-half, 0, -half - 6], [half, 0, -half - 6]);
  wall("maze-boundary-west", [-half, 0, -half - 6], [-half, 0, front]);
  wall("maze-boundary-east", [half, 0, -half - 6], [half, 0, front]);
  wall(
    "maze-boundary-south-left",
    [-half, 0, front],
    [rootPoint[0] - cell / 2, 0, front],
  );
  wall(
    "maze-boundary-south-right",
    [rootPoint[0] + cell / 2, 0, front],
    [half, 0, front],
  );
  const guide = npc(
    "guide",
    "Мира · начальник экспедиции",
    [outside[0] - 2, 0, outside[2]],
    "Мы разбили лагерь снаружи. Экспедиция исчезла за этими стенами, а замки продолжают исполнять старый приказ. Сначала получим допуск, затем разберёмся, кто запер людей.",
  );
  item(
    "maze-permit",
    "Пропуск экспедиции",
    [outside[0] + 7, 0, outside[2] + 2],
    "Запасной пропуск лежал среди вещей курьера. Покажи его Мире у ворот.",
  );
  stage(
    guide,
    quest("maze-entry", "Пролог · допуск в лабиринт", guide, "maze-permit", 20),
    `${guide.dialogue}\n\nНайди пропуск у вещей курьера справа от лагеря и вернись ко мне. После проверки вход откроется.`,
    "Пропуск действителен. Вход открыт. Внутри найди хранителя водосбора: он объяснит, как пройти первую секцию. Ключи не расходуются; их и открытые двери можно сохранить.",
  );
  gate(
    "maze-entrance",
    "Вход · допуск экспедиции",
    rootPoint,
    [rootPoint[0], 0, front + cell / 2],
    "quest",
    "maze-entry",
    true,
  );
  const optionalCells = new Set(optional.flatMap((b) => b.cells));
  const stageIds = [];
  gates.forEach((section, i) => {
    const info = chapters[i],
      qid = `maze-stage-${i + 1}`,
      keyId = `maze-key-${i + 1}`,
      previous = i ? `maze-stage-${i}` : "maze-entry";
    const start = point(path[section.start]),
      actor = npc(
        `maze-keeper-${i + 1}`,
        `${info[1]} · хранитель ${i + 1}`,
        [start[0] - 1.3, 0, start[2] + 1.3],
        "Сначала разберись с предыдущей печатью. Мы сможем продолжить только после её снятия.",
      );
    const branches = layout.branches.filter(
      (b) =>
        b.pathIndex >= section.start &&
        b.pathIndex < section.end - 1 &&
        !optionalCells.has(b.root),
    );
    const keyCell = branches.length
      ? branches[Math.floor(rng() * branches.length)].leaf
      : path[
          section.start +
            Math.max(1, Math.floor((section.end - section.start - 1) / 2))
        ];
    item(
      keyId,
      `${info[0]} · секция ${i + 1}`,
      point(keyCell),
      `${info[0]} открывает ключевую дверь секции ${i + 1}. Покажи его хранителю ${info[1]}, чтобы снять следующую печать. Не оставляй ключ за закрытой дверью.`,
    );
    stage(
      actor,
      quest(
        qid,
        `${i + 1} · ${info[1]}: найти ключ`,
        actor,
        keyId,
        35 + i * 10,
      ),
      `${info[2]}\n\nОбыщи доступные коридоры секции ${i + 1}, найди «${info[0]}» и вернись ко мне. Я сниму печать, а ключевую дверь откроешь сам клавишей E. Боковые хранилища необязательны.`,
      `${info[3]}\n\nПечать снята. Возьми ключ с собой и открой золотистую дверь (E). За ней — проход к ${i === gates.length - 1 ? "сердцу лабиринта. Забери там летопись и отнеси Мире в наружный лагерь" : "следующему хранителю"}.`,
      [c("questComplete", previous)],
    );
    gate(
      `maze-gate-${edgeKey(...section.keyEdge)}`,
      `${info[0]} · ключевая дверь`,
      point(section.keyEdge[0]),
      point(section.keyEdge[1]),
      "item",
      keyId,
    );
    gate(
      `maze-gate-${edgeKey(...section.sealEdge)}`,
      `${info[1]} · печать хранителя`,
      point(section.sealEdge[0]),
      point(section.sealEdge[1]),
      "quest",
      qid,
      true,
    );
    stageIds.push(qid);
  });
  optional.forEach((branch, i) => {
    const [title, relic, brief, result] = sideStories[i],
      p = point(branch.attach),
      actor = npc(
        `maze-side-giver-${i + 1}`,
        `Исследователь · ${title}`,
        [p[0] + 1.4, 0, p[2] - 1.4],
        "У меня есть необязательная просьба. Основной проход можно открыть и без неё.",
      );
    const stageIndex = gates.findIndex((g) => branch.pathIndex <= g.end),
      required = stageIndex <= 0 ? "maze-entry" : `maze-stage-${stageIndex}`;
    const keyId = `maze-side-key-${i + 1}`,
      qid = `maze-side-${i + 1}`,
      relicId = `maze-side-relic-${i + 1}`;
    const keyAt = point(
      path[
        Math.max(
          stageIndex < 0 ? gates.at(-1).end + 1 : gates[stageIndex].start,
          branch.pathIndex - 2,
        )
      ],
    );
    item(
      keyId,
      `Ключ бокового хранилища ${i + 1}`,
      [keyAt[0] + 1.8, 0, keyAt[2] + 1.5],
      `Ключ к необязательной двери: ${title}. Основной маршрут не требует этого ключа.`,
    );
    item(relicId, relic, point(branch.leaf), result);
    stage(
      actor,
      quest(qid, `Необязательно · ${title}`, actor, relicId, 60 + i * 15),
      `${brief}\n\nКлюч лежит в открытой части этой секции, перед ответвлением. Указатель сначала поможет найти ключ, затем дверь и находку. Верни находку мне. Это не нужно для основного пути.`,
      `${result} В глубине хранилища также есть снаряжение — его можно забрать.`,
      [c("questComplete", required)],
    );
    gate(
      `maze-gate-${edgeKey(branch.attach, branch.root)}`,
      `Необязательно · ${title}`,
      point(branch.attach),
      point(branch.root),
      "item",
      keyId,
    );
    item(
      `maze-side-loot-${i + 1}`,
      i === 0
        ? "Доспех экспедиции"
        : i === 1
          ? "Клинок исследователя"
          : "Шлем хранителя",
      [point(branch.leaf)[0] + 1.4, 0, point(branch.leaf)[2] + 1.4],
      "Награда за исследование необязательного крыла. Экипируй через I.",
      {
        gear: {
          ...gearConfig(),
          slot: i === 0 ? "body" : i === 1 ? "weapon" : "head",
          armor: i === 0 ? 40 : 15,
          damage: 45,
        },
      },
    );
    if (branch.cells.length >= 3) {
      const ep = point(branch.cells[branch.cells.length - 2]);
      add(
        `maze-side-enemy-${i + 1}`,
        "Страж забытого крыла",
        "enemy",
        "humanoid",
        [ep[0] + 1.2, 0, ep[2] - 1.2],
        {
          solid: false,
          color: "#ae7163",
          health: difficulty.hp,
          enemy: {
            ...enemyConfig({}),
            speed: difficulty.speed,
            damage: difficulty.damage,
            notice: 3,
            reach: 1.4,
          },
          behavior: {
            ...behaviorConfig({ kind: "enemy" }),
            faction: "maze-guards",
          },
        },
      );
    }
  });
  item(
    "maze-chronicle",
    "Летопись запертых",
    point(path.at(-1)),
    "Здесь записаны имена всех, кого совет оставил в лабиринте. Вынеси летопись и вернись к Мире в наружный лагерь.",
  );
  stage(
    guide,
    quest(
      "maze-finale",
      "Финал · вынести правду",
      guide,
      "maze-chronicle",
      100,
    ),
    "Последняя печать снята. Забери летопись в сердце лабиринта и принеси мне в наружный лагерь. Все снятые печати останутся открыты. Боковые крылья можно исследовать позже.",
    "ФИНАЛ · Выход из молчания. Летопись вынесена на свет. Имена пропавших больше не будут тайной; приказ об изоляции отменён. Можно продолжить исследовать необязательные крылья.",
    [c("questComplete", stageIds.at(-1))],
    50,
  );
  // The chronicle is collectible early; Mira accepts the final report upon return.
  if (config.sideQuests) {
    for (let mask = 1; mask < 1 << config.sideQuests; mask++) {
      const done = Array.from(
        { length: config.sideQuests },
        (_, i) => i,
      ).filter((i) => mask & (1 << i));
      guide.dialogueTree.nodes.push({
        id: `maze-epilogue-${mask}`,
        title: guide.name,
        text: `ФИНАЛ · Выход из молчания. Летопись вынесена на свет.\n\n${done.map((i) => sideStories[i][3]).join("\n")}\n\nТвои необязательные находки изменили судьбу экспедиции. Можно продолжать исследование.`,
        conditions: [
          c("questComplete", "maze-finale"),
          ...done.map((i) => c("questComplete", `maze-side-${i + 1}`)),
        ],
        choices: [leave()],
        autoStart: true,
        priority: 80 + done.length,
      });
    }
  }
  item(
    "traveller-blade",
    "Клинок экспедиции",
    outside,
    "Экипируй через инвентарь (I).",
    {
      startInInventory: true,
      gear: { ...gearConfig(), slot: "weapon", damage: 30 },
    },
  );
  item(
    "traveller-coat",
    "Куртка экспедиции",
    outside,
    "Экипируй через инвентарь (I).",
    {
      startInInventory: true,
      gear: { ...gearConfig(), slot: "body", armor: 25 },
    },
  );
  add(
    "maze-courier-crate",
    "Вещи курьера",
    "prop",
    "box",
    [outside[0] + 7, 0.3, outside[2] + 4],
    {
      scale: [1.6, 0.6, 1],
      color: "#927354",
      inspection: {
        enabled: true,
        description: "Пропуск упал неподалёку. Отнеси его Мире.",
      },
    },
  );
  add(
    "generation-notes",
    "Журнал экспедиции",
    "prop",
    "box",
    [outside[0] - 5, 0.35, outside[2] + 3],
    {
      scale: [1, 0.7, 0.4],
      color: "#bba17b",
      inspection: {
        enabled: true,
        description: `Лабиринт · ${n} × ${n} залов. ${gates.length} основных секций, ${config.sideQuests} необязательных крыльев.\nНачни с Миры снаружи. Золотистые двери открываются ключами (E), синие печати — после сдачи задания хранителю. Ключи не расходуются.\nСохраняйся через Esc. Указатель ведёт по коридорам; при закрытой двери сначала ищет её ключ.\nSeed и настройки: ${JSON.stringify(config)}`,
      },
    },
  );
  for (let i = 0; i < 18; i++) {
    const x = (rng() - 0.5) * (width + 24),
      z = front + 12 + rng() * 5;
    if (Math.abs(x - outside[0]) < 10) continue;
    add(`maze-tree-${i}`, "Дерево у лагеря", "prop", "tree", [x, 0, z], {
      color: biome.tree,
      collision: "trunk",
      environment: true,
    });
  }
  return validateProject({
    format: "hearth-project",
    schemaVersion: FORMAT_VERSION,
    id: `generated-maze-v1-${identity}`,
    title: `Лабиринт потерянной экспедиции · ${config.seed}`,
    contentVersion: 1,
    weapon: null,
    world: {
      size: worldSize,
      sky: biome.sky,
      ground: biome.ground,
      terrain: null,
      spawn: [outside[0], 1.7, outside[2] + 5],
      dayNight: { enabled: false, dayMinutes: 24, startHour: 10 },
    },
    assets: [],
    entities,
    quests,
  });
}
