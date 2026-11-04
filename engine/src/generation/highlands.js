import { validateProject, FORMAT_VERSION } from "../core/project.js";
import { createTerrain, heightAt, groundPosition } from "../core/terrain.js";
import { behaviorConfig, gearConfig } from "../core/equipment.js";
import { enemyConfig } from "../core/enemy.js";
import { questChoices } from "../core/dialogue.js";

export const HIGHLAND_SIZES = {
  small: { size: 260, summit: 26, trees: 160 },
  medium: { size: 320, summit: 30, trees: 230 },
  large: { size: 380, summit: 34, trees: 300 },
};
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
export function roadProjection(x, z, a, b) {
  const dx = b[0] - a[0],
    dz = b[2] - a[2],
    t = clamp(((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz || 1));
  return {
    distance: Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz),
    height: a[1] + t * (b[1] - a[1]),
  };
}
const condition = (kind, target) => ({ kind, target });
const leave = () => ({
  id: "leave",
  text: "До встречи",
  next: null,
  conditions: [],
  showLocked: false,
  action: null,
});

export function generateHighlands(config, rng, identity, biome, difficulty) {
  const settings = HIGHLAND_SIZES[config.size],
    size = settings.size,
    R = size * 0.29,
    outer = R + 22,
    rotation = rng() * Math.PI * 2;
  const polar = (radius, angle, y = 2) => [
    Math.cos(angle) * radius,
    y,
    Math.sin(angle) * radius,
  ];
  const towns = [0, 1, 2].map((i) =>
    polar(R, rotation + (i * Math.PI * 2) / 3),
  );
  towns.push([0, settings.summit, 0]);
  const pick = (values) => values[Math.floor(rng() * values.length)];
  const names = [
    pick(["Колосов Брод", "Золотые Нивы", "Хлебная Заводь"]),
    pick(["Медный Дол", "Угольные Ключи", "Кузнечный Лог"]),
    pick(["Озёрные Письма", "Тихие Летописи", "Белый Исток"]),
    pick(["Высокий Дозор", "Небесный Венец", "Крепость Облаков"]),
  ];
  const colors = ["#c8a467", "#ac7861", "#83aeb9", "#c5c5b1"];
  const nodes = [],
    edges = [];
  const node = (point) => {
    nodes.push(point);
    return nodes.length - 1;
  };
  const connect = (a, b) => edges.push([a, b]);
  for (let i = 0; i < 24; i++)
    node(polar(outer, rotation + (i * Math.PI) / 12));
  for (let i = 0; i < 24; i++) connect(i, (i + 1) % 24);
  const townNodes = towns.map(node);
  for (let i = 0; i < 3; i++) connect(townNodes[i], i * 8);
  let previous = townNodes[0];
  for (let i = 1; i <= 18; i++) {
    const t = i / 19,
      radius = R * (1 - t),
      u = (R * t - 17) / (R - 34);
    const point = polar(
      radius,
      rotation + 0.32 * Math.sin(t * Math.PI * 2),
      2 + (settings.summit - 2) * smooth(u),
    );
    const id = node(point);
    connect(previous, id);
    previous = id;
  }
  connect(previous, townNodes[3]);
  const outposts = [4, 12, 20].map((i) => {
    const id = node(polar(outer + 12, rotation + (i * Math.PI) / 12));
    connect(i, id);
    return id;
  });
  const ridgeCentres = towns.slice(0, 3).map((a, i) => {
    const b = towns[(i + 1) % 3];
    return [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
  });
  const segments = edges.map(([a, b]) => [nodes[a], nodes[b]]);
  const closestRoad = (x, z) =>
    segments
      .map(([a, b]) => roadProjection(x, z, a, b))
      .reduce((a, b) => (a.distance < b.distance ? a : b));
  const terrain = createTerrain(128);
  terrain.paint = [];
  const world = {
    size,
    sky: biome.sky,
    ground: biome.ground,
    terrain,
    spawn: [towns[0][0], 3.7, towns[0][2] + 4],
    dayNight: { enabled: true, dayMinutes: 72, startHour: 9 },
  };
  const phase = rng() * Math.PI * 2;
  for (let row = 0; row <= 128; row++)
    for (let col = 0; col <= 128; col++) {
      const x = (col / 128 - 0.5) * size,
        z = (row / 128 - 0.5) * size;
      let height =
        2 +
        Math.max(
          (settings.summit - 2) *
            Math.exp(-(x * x + z * z) / (2 * (R * 0.46) ** 2)),
          ...ridgeCentres.map(
            ([cx, cz]) =>
              (settings.summit - 3) *
              Math.exp(
                -((x - cx) ** 2 + (z - cz) ** 2) / (2 * (R * 0.25) ** 2),
              ),
          ),
        );
      height += 0.5 * Math.sin(x * 0.08 + phase) * Math.cos(z * 0.06 - phase);
      const road = closestRoad(x, z),
        blend = 1 - smooth((road.distance - 2.5) / 4);
      height = height * (1 - blend) + road.height * blend;
      for (const city of towns) {
        const distance = Math.hypot(x - city[0], z - city[2]),
          flat = 1 - smooth((distance - 17) / 6);
        height = height * (1 - flat) + city[1] * flat;
      }
      const border = smooth(
        (size / 2 - Math.max(Math.abs(x), Math.abs(z))) / 15,
      );
      terrain.heights[row * 129 + col] = +(height * border).toFixed(5);
      terrain.paint.push(
        road.distance < 3 ||
          towns.some((p) => Math.hypot(x - p[0], z - p[2]) < 7)
          ? 3
          : 1,
      );
    }
  terrain.regions = [
    {
      id: "highland-region",
      name: "Долина четырёх городов",
      min: [-size / 2, -size / 2],
      max: [size / 2, size / 2],
    },
  ];
  world.spawn = groundPosition(world, world.spawn);
  const entities = [],
    quests = [];
  const add = (id, name, kind, shape, point, extra = {}) => {
    const e = {
      id,
      name,
      kind,
      shape,
      position: [point[0], heightAt(world, point[0], point[2]), point[2]],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: biome.rock,
      solid: kind === "prop",
      ...extra,
    };
    entities.push(e);
    return e;
  };
  const prop = (id, name, point, scale, color, y = 0, extra = {}) => {
    const e = add(id, name, "prop", "box", point, {
      scale,
      color,
      environment: true,
      ...extra,
    });
    e.position[1] += y;
    return e;
  };
  const item = (id, name, point, text, extra = {}) => {
    const e = add(id, name, "item", "sphere", point, {
      solid: false,
      scale: [0.65, 0.65, 0.65],
      color: "#f0d69a",
      inspection: { enabled: true, description: text },
      ...extra,
    });
    e.position[1] += 0.65;
    return e;
  };
  const npc = (id, name, point, text, color) =>
    add(id, name, "npc", "humanoid", point, {
      solid: false,
      color,
      dialogue: text,
      behavior: {
        ...behaviorConfig({ kind: "npc" }),
        reaction: "ignore",
        enemies: "ignore",
        invulnerable: true,
      },
      dialogueTree: {
        start: "start",
        nodes: [{ id: "start", title: name, text, choices: [leave()] }],
      },
    });
  const offset = (p, x, z) => [p[0] + x, 0, p[2] + z];
  const mayorIds = [
    "guide",
    "highland-smith",
    "highland-scholar",
    "highland-warden",
  ];
  const roles = [
    "Мира · староста",
    "Остен · мастер гильдии",
    "Ива · летописец",
    "Савелий · хранитель плотины",
  ];
  const intro = [
    `${names[0]} кормил долину, пока караваны не исчезли, а каналы не пересохли. Кузнецы обвиняют нас в голодных бунтах, мы обвиняем их в краже воды. Холмы скрывают соседей, а слухи заменили вести.`,
    `${names[1]} поставлял насосы всем городам. Теперь зерно не приходит, и нас называют ворами. Без настоящих документов я никому не поверю.`,
    `${names[2]} хранит карты долины. Старые русла соединяли всех; сегодня каждый видит лишь собственную нехватку воды.`,
    `${names[3]} стоит над тремя городами и управляет водохранилищем. Я защищал долину от паводка — но совет превратил временные ограничения в постоянную власть.`,
  ];
  const mayors = towns.map((p, i) =>
    npc(
      mayorIds[i],
      `${roles[i]} · ${names[i]}`,
      offset(p, -2, 1),
      intro[i],
      colors[i],
    ),
  );
  const q = (id, title, giver, target, type = "collect", reward = 35) => {
    const targets = Array.isArray(target) ? target : [target];
    const quest = {
      id,
      title,
      giver: giver.id,
      target: targets[0],
      required: 1,
      type,
      reward,
      ...(type === "defeat" ? { targets } : {}),
    };
    quests.push(quest);
    return quest;
  };
  const speech = (actor, id, text, conditions, priority, choices = [leave()]) =>
    actor.dialogueTree.nodes.push({
      id,
      title: actor.name,
      text,
      conditions,
      priority,
      autoStart: true,
      choices,
    });
  const stage = (actor, quest, text, result, requires = [], priority = 10) => {
    const [accept, claim] = questChoices(quest);
    accept.next = `${quest.id}-active`;
    claim.next = `${quest.id}-done`;
    speech(
      actor,
      `${quest.id}-offer`,
      text,
      [...requires, condition("questNew", quest.id)],
      priority,
      [accept, leave()],
    );
    speech(
      actor,
      `${quest.id}-active`,
      text,
      [condition("questActive", quest.id)],
      priority + 1,
      [claim, leave()],
    );
    speech(
      actor,
      `${quest.id}-done`,
      result,
      [condition("questComplete", quest.id)],
      priority + 2,
    );
  };
  item(
    "highland-ledger",
    "Журнал пропавшего каравана",
    nodes[outposts[0]],
    "В журнале стоят печати кузнецов, но распоряжение об отправке подписано канцелярией горной крепости.",
  );
  item(
    "highland-seal",
    "Сломанная печать мастера",
    offset(towns[1], 4, -3),
    "Настоящая печать треснула год назад. Оттиск в журнале сделан новой матрицей — её отливали по заказу крепости.",
  );
  item(
    "highland-map",
    "Карта старых русел",
    nodes[outposts[1]],
    "Три старых водовода перекрыли одновременно. Вода направлена к резервуару крепости, хотя сезон паводка давно закончился.",
  );
  item(
    "highland-order",
    "Подлинный приказ совета",
    offset(towns[3], 4, -3),
    "Совет продлевал чрезвычайный режим, чтобы города торговали водой через его посредников. Хранитель боялся засухи, но скрывал истинный объём запасов.",
  );
  stage(
    mayors[0],
    q(
      "highland-main-1",
      "I · Караван между холмами",
      mayors[0],
      "highland-ledger",
    ),
    `${intro[0]}\n\nНайди журнал у дорожного поста между нашим городом и ${names[1]}, затем вернись ко мне. Каменная дорога огибает гряды; указатель ведёт по ней.`,
    `Оттиск в журнале ведёт к кузнецам, но распоряжение пришло сверху. Отправляйся в ${names[1]} и поговори с мастером Остеном. Мы не станем начинать войну из-за одной печати.`,
  );
  stage(
    mayors[1],
    q(
      "highland-main-2",
      "II · Печать, которой не было",
      mayors[1],
      "highland-seal",
    ),
    `В караванном журнале наша печать? Старый образец лежит на площади возле мастерской. Принеси его, сравним трещину.`,
    `Этот оттиск поддельный. Новую матрицу заказала горная канцелярия. В ${names[2]} летописец Ива хранит карты: узнай, кто отвёл воду.`,
    [condition("questComplete", "highland-main-1")],
  );
  stage(
    mayors[2],
    q("highland-main-3", "III · Куда уходит вода", mayors[2], "highland-map"),
    `Сверим слухи с картой. Найди старый план русел у поста между ${names[1]} и нашим городом и принеси мне.`,
    `Все три канала перекрыты по одному приказу. Запас воды хранится в ${names[3]}. Возвращайся к ${names[0]}: от его площади начинается извилистая дорога на вершину. Наверху добейся ответа у хранителя.`,
    [condition("questComplete", "highland-main-2")],
  );
  stage(
    mayors[3],
    q(
      "highland-main-4",
      "IV · Правда над облаками",
      mayors[3],
      "highland-order",
      "collect",
      55,
    ),
    `Я подписывал аварийные распоряжения, но не приказы о торговой блокаде. Найди оригинал на архивной площадке рядом и покажи мне.`,
    `Документ подлинный. Совет наживался на страхе, а я предпочёл не задавать вопросов. Теперь решать придётся нам: совместное управление плотиной или открытие старых русел. Поговори со мной снова, чтобы выбрать.`,
    [condition("questComplete", "highland-main-3")],
  );
  item(
    "highland-charter",
    "Печать общего совета",
    offset(towns[3], -4, -4),
    "Управление передаётся представителям трёх городов. Водохранилище остаётся общим, и его придётся обслуживать вместе.",
  );
  item(
    "highland-spillway",
    "Ключ старого водосброса",
    nodes[outposts[2]],
    "Возврат старых русел позволит городам получать воду без крепостных квот. Но общий резерв на случай засухи уменьшится.",
  );
  const endings = [
    [
      "highland-treaty",
      "Общий договор",
      "highland-charter",
      "Возьми печать общего совета на верхней площади и вернись ко мне. Города будут вместе управлять плотиной, делить воду и отвечать за ремонт.",
      "ФИНАЛ · Союз за холмами. Крепость открыла сведения о запасах и передала голоса трём городам. Вода снова идёт в долины. Договор потребует доверия и постоянного совместного труда.",
    ],
    [
      "highland-river",
      "Свободные русла",
      "highland-spillway",
      `Найди ключ у старого водосброса между ${names[2]} и ${names[0]} и принеси мне. Мы вернём русла городам, отказавшись от крепостных квот и части общего резерва.`,
      "ФИНАЛ · Вода без границ. Старые русла открыты; города больше не зависят от крепостных квот. Теперь каждому придётся беречь свою воду, а в засуху — договариваться с соседями без общего запаса.",
    ],
  ];
  const choices = [];
  endings.forEach(([id, title, target, brief, epilogue], i) => {
    const quest = q(id, `V · ${title}`, mayors[3], target, "collect", 90),
      accept = questChoices(quest)[0];
    accept.text = title;
    accept.next = `${id}-active`;
    choices.push(accept);
    stage(
      mayors[3],
      quest,
      `${brief}\n\nЭто окончательный выбор для этого прохождения.`,
      `${epilogue}\n\nМожно продолжить помогать городам и узнать последствия.`,
      [
        condition("questComplete", "highland-main-4"),
        condition("questNew", endings[1 - i][0]),
      ],
      50,
    );
    mayors[3].dialogueTree.nodes.find((n) => n.id === `${id}-offer`).autoStart =
      false;
    mayors
      .slice(0, 3)
      .forEach((actor, city) =>
        speech(
          actor,
          `${id}-reaction`,
          `${names[city]} получил весть о твоём решении. ${i === 0 ? "Мы отправим представителя в общий совет. Теперь соседей придётся слышать, даже когда их не видно за холмом." : "Вода вернулась в старое русло. Теперь мы сами отвечаем за запас — и за помощь соседям в сухой год."}`,
          [condition("questComplete", id)],
          80,
        ),
      );
    towns.slice(0, 3).forEach((p, city) => {
      const fountain = prop(
        `highland-water-${i}-${city}`,
        `${names[city]} · вода возвращается`,
        offset(p, i ? -5 : 5, 4),
        [0.6, 0.7, 0.6],
        i ? "#77b8c8" : "#75b2d8",
        0.35,
        {
          solid: false,
          environment: false,
          motion: {
            trigger: "auto",
            condition: "quest",
            target: id,
            offset: [0, 1.1, 0],
            rotation: [0, 0, 0],
            pivot: "origin",
            duration: 3,
          },
        },
      );
      fountain.inspection = {
        enabled: true,
        description:
          "Когда вопрос о плотине будет решён, здесь вновь поднимется вода.",
      };
    });
  });
  speech(
    mayors[3],
    "highland-decision",
    "Правда раскрыта. Можно оставить общий резерв под совместным управлением городов или вернуть воду старым руслам, сократив зависимость от крепости и запас на случай засухи. У каждого решения есть цена.",
    [
      condition("questComplete", "highland-main-4"),
      ...endings.map(([id]) => condition("questNew", id)),
    ],
    40,
    [...choices, leave()],
  );
  const helpResults = [
    "Спасённое зерно обеспечило долину хлебом до нового урожая.",
    "Освобождённая дорога позволила доставить насосы и восстановить каналы.",
    "Семьи получили письма пропавших. Вместо слухов у городов появились свидетельства и общая память.",
  ];
  for (let i = 0; i < config.sideQuests; i++) {
    const actor = npc(
      `highland-helper-${i}`,
      `${["Рада · мельник", "Тихон · перевозчик", "Ная · почтальон"][i]} · ${names[i]}`,
      offset(towns[i], 3, 3),
      "Пока старосты спорят, обычным людям нужна помощь.",
      colors[i],
    );
    let target,
      type = "collect",
      brief,
      title;
    if (i === 0) {
      target = "highland-grain";
      title = "Зерно для соседей";
      item(
        target,
        "Мешок посевного зерна",
        offset(nodes[outposts[0]], 2, 2),
        "Этот запас можно разделить между городами.",
      );
      brief =
        "У пропавшего каравана остался запас посевного зерна. Принеси его мне: часть отправим соседям, несмотря на ссору.";
    }
    if (i === 1) {
      target = ["highland-raider-1", "highland-raider-2"];
      type = "defeat";
      title = "Насосы вместо оружия";
      target.forEach((id, j) =>
        add(
          id,
          "Налётчик у старого водосброса",
          "enemy",
          "humanoid",
          offset(nodes[outposts[2]], j ? 3 : -3, j ? 3 : -3),
          {
            solid: false,
            color: "#ad6556",
            health: difficulty.hp,
            enemy: {
              ...enemyConfig({}),
              speed: difficulty.speed,
              damage: difficulty.damage,
              notice: 5,
              reach: 1.5,
            },
            behavior: {
              ...behaviorConfig({ kind: "enemy" }),
              faction: "raiders",
            },
          },
        ),
      );
      brief = `Двое налётчиков держат дорогу у водосброса между ${names[2]} и ${names[0]}. Победи обоих и вернись: мы повезём насосы, а не оружие.`;
    }
    if (i === 2) {
      target = "highland-letters";
      title = "Письма через перевал";
      item(
        target,
        "Письма пропавших возчиков",
        offset(nodes[outposts[1]], 2, -2),
        "Последние вести караванщиков — для семей во всех трёх городах.",
      );
      brief =
        "Собери письма у архивного дорожного поста и верни мне. Я разнесу их семьям всех трёх городов: правда нужна не только совету.";
    }
    stage(
      actor,
      q(
        `highland-side-${i + 1}`,
        `Необязательно · ${title}`,
        actor,
        target,
        type,
        50,
      ),
      brief,
      helpResults[i],
    );
  }
  for (const [ending, , , , epilogue] of endings)
    for (let mask = 1; mask < 1 << config.sideQuests; mask++) {
      const helped = Array.from(
        { length: config.sideQuests },
        (_, i) => i,
      ).filter((i) => mask & (1 << i));
      speech(
        mayors[3],
        `${ending}-help-${mask}`,
        `${epilogue}\n\n${helped.map((i) => helpResults[i]).join("\n")}`,
        [
          condition("questComplete", ending),
          ...helped.map((i) =>
            condition("questComplete", `highland-side-${i + 1}`),
          ),
        ],
        90 + helped.length,
      );
    }
  towns.forEach((p, i) => {
    prop(`highland-town-${i}`, names[i], p, [3, 0.12, 3], colors[i], 0.06, {
      solid: false,
      inspection: {
        enabled: true,
        description: `${names[i]}. ${i === 3 ? "Горная крепость и общий резервуар." : ["Хлебный город в отдельной долине.", "Город мастеров в отдельной котловине.", "Город летописцев у старых источников."][i]}`,
      },
    });
    let count = 0;
    for (let plot = 0; plot < 12; plot++) {
      const angle = rotation + (plot * Math.PI) / 6,
        centre = offset(p, Math.cos(angle) * 12, Math.sin(angle) * 12);
      if (closestRoad(centre[0], centre[2]).distance < 5.3) continue;
      const h = 3 + rng() * 0.7,
        id = `highland-house-${i}-${count++}`;
      prop(
        id,
        `${names[i]} · ${["жилой дом", "мастерская", "амбар", "лавка"][plot % 4]}`,
        centre,
        [4, h, 3.8],
        colors[i],
        h / 2,
        { surface: i === 1 ? 4 : 3, collision: "box" },
      );
      for (const side of [-1, 1])
        prop(
          `${id}-roof-${side < 0 ? "l" : "r"}`,
          "Скат крыши",
          offset(centre, side * 1, 0),
          [2.5, 0.25, 4.5],
          i === 3 ? "#59646b" : "#79584b",
          h + 0.65,
          { rotation: [0, 0, -side * 0.55], collision: "box" },
        );
      prop(
        `${id}-door`,
        "Дверь дома",
        offset(centre, 0, 1.92),
        [0.8, 1.8, 0.08],
        "#4e4438",
        0.9,
        { solid: false },
      );
    }
    npc(
      `highland-resident-${i}`,
      `${["Пекарь", "Кузнец", "Писец", "Дозорный"][i]} · ${names[i]}`,
      offset(p, -4, -3),
      [
        "За холмами тоже есть семьи. Пусть хлеб снова станет товаром, а не угрозой.",
        "Хороший насос полезнее десятка мечей. Но кто теперь оплатит ремонт?",
        "На старых картах нет границ между водой разных городов.",
        "С этой высоты всё кажется близким. Внизу люди даже не видят друг друга.",
      ][i],
      colors[i],
    );
  });
  nodes.forEach((p, i) => {
    const e = add(
      `highland-node-${i}`,
      "Дорожный камень",
      "prop",
      "sphere",
      p,
      {
        solid: false,
        environment: true,
        scale: [0.35, 0.25, 0.35],
        color: "#d7c9a5",
      },
    );
    e.position[1] += 0.15;
  });
  edges.forEach(([a, b]) => {
    const pa = nodes[a],
      pb = nodes[b];
    const e = add(
      `highland-route-${a}-${b}`,
      "Отметка дороги",
      "prop",
      "sphere",
      [(pa[0] + pb[0]) / 2, 0, (pa[2] + pb[2]) / 2],
      {
        solid: false,
        environment: true,
        scale: [0.15, 0.12, 0.15],
        color: "#c8ba97",
      },
    );
    e.position[1] += 0.1;
  });
  for (let i = 0; i < 3; i++)
    prop(
      `highland-post-${i}`,
      "Старый дорожный пост",
      offset(nodes[outposts[i]], -4, 2),
      [2, 1.1, 1.5],
      "#938777",
      0.55,
      {
        inspection: {
          enabled: true,
          description: "Здесь останавливались караваны всех трёх городов.",
        },
      },
    );
  item("traveller-blade", "Клинок путника", towns[0], "Экипируй через I.", {
    startInInventory: true,
    gear: { ...gearConfig(), slot: "weapon", damage: 30 },
  });
  item("traveller-coat", "Куртка путника", towns[0], "Экипируй через I.", {
    startInInventory: true,
    gear: { ...gearConfig(), slot: "body", armor: 25 },
  });
  prop(
    "generation-notes",
    "Карта четырёх городов",
    offset(towns[0], -5, 4),
    [1, 0.7, 0.4],
    "#bba27d",
    0.35,
    {
      inspection: {
        enabled: true,
        description: `Три города скрыты друг от друга за холмами. ${names[3]} расположен на вершине. Кольцевая дорога огибает гряды, подъём к крепости начинается в ${names[0]}.\n\n${names.map((name, i) => `${name}: X ${Math.round(towns[i][0])}, Z ${Math.round(towns[i][2])}`).join("\n")}\n\nНачни с Миры. Для продвижения принимай и сдавай задания в диалогах. Побочные задания не обязательны и меняют последствия финала.\nНастройки: ${JSON.stringify(config)}`,
      },
    },
  );
  for (
    let attempt = 0, count = 0;
    attempt < settings.trees * 20 && count < settings.trees;
    attempt++
  ) {
    const x = (rng() - 0.5) * (size - 18),
      z = (rng() - 0.5) * (size - 18);
    if (
      towns.some((p) => Math.hypot(x - p[0], z - p[2]) < 22) ||
      closestRoad(x, z).distance < 7 ||
      nodes.some((p) => Math.hypot(x - p[0], z - p[2]) < 8)
    )
      continue;
    const s = 0.8 + rng() * 0.6;
    add(
      `highland-tree-${count++}`,
      "Дерево на склоне",
      "prop",
      "tree",
      [x, 0, z],
      {
        environment: true,
        collision: "trunk",
        color: biome.tree,
        scale: [s, s, s],
      },
    );
  }
  return validateProject({
    format: "hearth-project",
    schemaVersion: FORMAT_VERSION,
    id: `generated-highlands-v1-${identity}`,
    title: `Четыре города · ${names[3]}`,
    contentVersion: 1,
    weapon: null,
    world,
    assets: [],
    entities,
    quests,
  });
}
