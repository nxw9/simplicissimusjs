import {
  generateAdventure,
  normalizeOptions,
  STORIES,
  BIOMES,
  SIZES,
  DIFFICULTIES,
} from "../generation/adventure.js";

/** Stage the complete adventure before replacing the current project. */
export function generatorEditor({
  modal,
  element,
  commit,
  onCreated = () => {},
  seed = crypto.randomUUID().slice(0, 12),
}) {
  const form = element("form", "", "generator-form");
  form.append(
    element(
      "p",
      "Создайте приключение, лабиринт с ключами и дверями или холмистую долину четырёх городов. Всё работает локально, без AI-сервисов и ключей.",
    ),
  );
  const fields = element("div", "", "generator-fields");
  const label = (title, input) => {
    const row = element("label", title, "field");
    row.append(input);
    fields.append(row);
    return input;
  };
  const input = element("input");
  input.id = "generator-seed";
  input.name = "seed";
  input.value = seed;
  input.required = true;
  input.maxLength = 80;
  label("Seed · код мира", input);
  const select = (id, title, values, value) => {
    const control = element("select");
    control.id = `generator-${id}`;
    control.name = id;
    for (const [key, text] of Object.entries(values)) {
      const option = element("option", text);
      option.value = key;
      control.append(option);
    }
    control.value = value;
    return label(title, control);
  };
  const names = (entries) =>
    Object.fromEntries(
      Object.entries(entries).map(([key, value]) => [key, value.name]),
    );
  const mode = select(
    "mode",
    "Вид игры",
    {
      adventure: "Приключение · открытый мир",
      maze: "Лабиринт · ключи и двери",
      highlands: "Холмистые города · общий сюжет",
    },
    "adventure",
  );
  const story = select(
    "story",
    "Сюжет",
    { random: "Случайный сюжет", ...names(STORIES) },
    "random",
  );
  select(
    "biome",
    "Окружение",
    { story: "По сюжету", ...names(BIOMES) },
    "story",
  );
  select("size", "Размер мира", names(SIZES), "medium");
  select("difficulty", "Сложность боя", names(DIFFICULTIES), "normal");
  select(
    "sideQuests",
    "Побочные задания",
    {
      0: "Без побочных заданий",
      1: "1 · необязательное ответвление",
      2: "2 · необязательных ответвления",
      3: "3 · необязательных ответвления",
    },
    "2",
  );
  mode.addEventListener("change", () => {
    story.disabled = mode.value !== "adventure";
  });
  const shuffle = element("button", "↻ Другой seed");
  shuffle.type = "button";
  shuffle.id = "generator-random";
  shuffle.onclick = () => {
    input.value = crypto.randomUUID().slice(0, 12);
    invalidate();
  };
  const preview = element("section", "", "generator-preview");
  preview.id = "generator-preview";
  preview.setAttribute("aria-live", "polite");
  const error = element("p", "", "wizard-error");
  error.setAttribute("role", "alert");
  const note = element(
    "p",
    "При создании текущая сцена будет заменена. Её можно вернуть кнопкой ↶. Для отдельной копии сначала скачайте текущий проект.",
    "muted",
  );
  const actions = element("div", "", "generator-actions");
  const inspect = element("button", "Предпросмотр");
  inspect.type = "button";
  inspect.id = "generator-preview-button";
  const apply = element("button", "Создать игру", "primary");
  apply.type = "submit";
  apply.id = "generator-create";
  actions.append(inspect, apply);
  form.append(fields, shuffle, preview, error, note, actions);
  let staged = null,
    submitting = false;
  function invalidate() {
    staged = null;
    preview.replaceChildren();
    error.textContent = "";
  }
  form.addEventListener("input", invalidate);
  form.addEventListener("change", invalidate);
  function prepare() {
    const values = Object.fromEntries(
      [...form.elements].filter((e) => e.name).map((e) => [e.name, e.value]),
    );
    values.sideQuests = Number(values.sideQuests);
    if (values.mode !== "adventure") values.story = "random";
    staged = generateAdventure(normalizeOptions(values));
    preview.replaceChildren(element("h3", staged.title));
    preview.append(
      element(
        "p",
        mode.value === "maze"
          ? `${staged.quests.filter((q) => q.id.startsWith("maze-stage-")).length} секций · ${staged.entities.filter((e) => e.motion).length} дверей и печатей · ${values.sideQuests} необязательных крыльев · старт снаружи`
          : mode.value === "highlands"
            ? `3 города в долинах + 1 на вершине · ${staged.world.size} × ${staged.world.size} м · 2 финала · ${values.sideQuests} побочных историй`
            : `${staged.world.size} × ${staged.world.size} м · ${staged.entities.filter((e) => e.kind === "npc").length} персонажа · ${staged.quests.length - 1} доступных заданий за прохождение · 2 финала`,
      ),
    );
    preview.append(
      element("p", staged.entities.find((e) => e.id === "guide").dialogue),
    );
    preview.append(
      element(
        "small",
        mode.value === "maze"
          ? "Получите допуск в наружном лагере. Внутри ищите ключи, сдавайте задания хранителям и открывайте двери (E). Указатель ведёт по коридорам. Побочные крылья необязательны."
          : mode.value === "highlands"
            ? "Холмы скрывают нижние города друг от друга. Начните со старосты Миры: улики соединят три долины с крепостью на вершине. Указатель ведёт по кольцевой дороге и подъёму."
            : "Начните с хранителя возле точки появления. Светлые тропы ведут к целям. Готовый мир можно редактировать и скачать как игру HTML.",
      ),
    );
    return staged;
  }
  inspect.onclick = () => {
    try {
      error.textContent = "";
      prepare();
    } catch (e) {
      error.textContent = e.message;
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    try {
      error.textContent = "";
      const next = staged ?? prepare();
      submitting = true;
      for (const control of form.elements) control.disabled = true;
      apply.textContent = "Создаём мир…";
      if (await commit(next)) {
        document.querySelector("#modal").close();
        onCreated(next);
      } else
        error.textContent =
          "Не удалось применить мир. Текущий проект сохранён; попробуйте ещё раз.";
    } catch (e) {
      error.textContent = e.message;
    } finally {
      submitting = false;
      for (const control of form.elements) control.disabled = false;
      story.disabled = mode.value !== "adventure";
      apply.textContent = "Создать игру";
    }
  };
  modal("✦ Генератор приключений", form);
}
