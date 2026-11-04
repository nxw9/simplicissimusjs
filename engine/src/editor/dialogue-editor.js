import { readProject } from "../core/project.js";
import {
  defaultDialogue,
  questChoices,
  conditionLabels,
  openingNodes,
  questLabel,
  conditionDescription,
} from "../core/dialogue.js";

export function dialogueEditor({ entity, project, element, modal, commit }) {
  let tree = structuredClone(
    entity.dialogueTree ?? defaultDialogue(entity, project),
  );
  let selected = tree.start;
  const box = element("div", "", "dialogue-editor");
  const uid = () => "d_" + crypto.randomUUID().replaceAll("-", "");
  const button = (parent, text, click, id) => {
    const b = element("button", text);
    if (id) b.id = id;
    b.onclick = click;
    parent.append(b);
    return b;
  };
  const input = (parent, title, value, change, multiline = false) => {
    const l = element("label", title, "field"),
      i = element(multiline ? "textarea" : "input");
    i.value = value;
    i.oninput = () => change(i.value);
    l.append(i);
    parent.append(l);
    return i;
  };
  const select = (parent, title, options, value, change) => {
    const l = element("label", title, "field"),
      s = element("select");
    for (const [v, t] of options) {
      const o = element("option", t);
      o.value = v;
      s.append(o);
    }
    s.value = value;
    s.onchange = () => change(s.value);
    l.append(s);
    parent.append(l);
    return s;
  };
  const conditionsEditor = (parent, owner, className, addLabel) => {
    owner.conditions ??= [];
    if (owner.conditions.length)
      parent.append(
        element(
          "p",
          "Должны выполняться все условия ниже (И). Каждый квест проверяется отдельно, независимо от того, какой NPC его выдаёт.",
        ),
      );
    for (const condition of owner.conditions) {
      const row = element("div", "", className);
      const category = condition.kind.startsWith("quest")
        ? "quest"
        : condition.kind.startsWith("enemy")
          ? "enemy"
          : "item";
      select(
        row,
        "Что проверять",
        [
          ["quest", "Квест из всей игры"],
          ["enemy", "Враг"],
          ["item", "Предмет"],
        ],
        category,
        (v) => {
          condition.kind = {
            quest: "questComplete",
            enemy: "enemyDefeated",
            item: "itemOwned",
          }[v];
          condition.target = "";
          render();
        },
      ).classList.add("condition-category");
      const options =
        category === "quest"
          ? project.quests.map((q) => [q.id, questLabel(project, q)])
          : project.entities
              .filter((e) => e.kind === category)
              .map((e) => [e.id, `${e.name} · ${e.id}`]);
      let targetSelect;
      if (category === "quest") {
        const search = input(
          row,
          "Найти по названию квеста, NPC или ID",
          "",
          (value) => {
            const filtered = options.filter(
              ([id, label]) =>
                id === condition.target ||
                label.toLocaleLowerCase().includes(value.toLocaleLowerCase()),
            );
            targetSelect.replaceChildren();
            for (const [id, label] of [
              [
                "",
                filtered.length
                  ? "Выберите конкретный квест"
                  : "Ничего не найдено",
              ],
              ...filtered,
            ]) {
              const o = element("option", label);
              o.value = id;
              targetSelect.append(o);
            }
            targetSelect.value = condition.target;
          },
        );
        search.type = "search";
        search.classList.add("condition-search");
      }
      targetSelect = select(
        row,
        category === "quest"
          ? "Какой квест — название / кто выдаёт / ID"
          : category === "enemy"
            ? "Какой враг"
            : "Какой предмет",
        [["", "Выберите"], ...options],
        condition.target,
        (v) => {
          condition.target = v;
          render();
        },
      );
      targetSelect.classList.add("condition-target");
      select(
        row,
        "Требуемое состояние",
        Object.entries(conditionLabels).filter(([kind]) =>
          kind.startsWith(category),
        ),
        condition.kind,
        (v) => {
          condition.kind = v;
          render();
        },
      ).classList.add("condition-state");
      if (category === "quest")
        row.append(
          element(
            "small",
            "«Квест сдан» — награда получена у его заказчика. «Цели выполнены» — квест принят, цели готовы, награда ещё не получена. «Выполняется» включает готовый к сдаче квест.",
          ),
        );
      if (!options.length)
        row.append(
          element(
            "p",
            category === "quest"
              ? "В проекте пока нет квестов. Сначала создайте квест у любого NPC."
              : "В проекте нет объектов этого типа.",
          ),
        );
      if (condition.target)
        row.append(
          element(
            "p",
            conditionDescription(project, condition),
            "condition-summary",
          ),
        );
      button(row, "Убрать условие", () => {
        owner.conditions = owner.conditions.filter((c) => c !== condition);
        render();
      });
      parent.append(row);
    }
    button(parent, addLabel, () => {
      owner.conditions.push({ kind: "questComplete", target: "" });
      render();
    });
  };
  const render = () => {
    box.replaceChildren();
    box.append(
      element(
        "p",
        "При начале разговора проверяются автоматические реплики по приоритету: большее число — раньше. При равенстве — порядок создания. Выбирается первая подходящая. Если ни одна не подходит, проверяется обычное начало. Все условия реплики должны выполняться.",
      ),
    );
    select(
      box,
      "Обычное начало (если автоматические реплики не подошли)",
      tree.nodes.map((n) => [n.id, n.title]),
      tree.start,
      (v) => {
        tree.start = v;
        render();
      },
    ).id = "dialogue-start";
    select(
      box,
      "Редактируемая реплика",
      tree.nodes.map((n) => [n.id, n.title]),
      selected,
      (v) => {
        selected = v;
        render();
      },
    ).id = "dialogue-node";
    button(
      box,
      "＋ Реплика NPC",
      () => {
        const n = {
          id: uid(),
          title: `Реплика ${tree.nodes.length + 1}`,
          text: "",
          choices: [],
          conditions: [],
          autoStart: true,
          priority: 10,
        };
        tree.nodes.push(n);
        selected = n.id;
        render();
      },
      "dialogue-add-node",
    );
    const node = tree.nodes.find((n) => n.id === selected);
    const display = element("fieldset", "", "dialogue-node-rules");
    display.append(element("legend", "Когда показывать эту реплику"));
    if (node.id === tree.start) {
      display.append(
        element(
          "p",
          "Обычное начало: запускается, если ни одна автоматическая реплика не подошла и выполнены условия ниже.",
        ),
      );
    } else {
      select(
        display,
        "Способ запуска",
        [
          ["auto", "Автоматически при разговоре с NPC"],
          ["answer", "Только через ответ игрока"],
        ],
        node.autoStart ? "auto" : "answer",
        (v) => {
          node.autoStart = v === "auto";
          render();
        },
      ).id = "dialogue-node-trigger";
      if (node.autoStart) {
        const priority = input(
          display,
          "Приоритет (0–1000, больше — раньше)",
          node.priority ?? 0,
          (v) => (node.priority = Number(v)),
        );
        priority.id = "dialogue-node-priority";
        priority.type = "number";
        priority.min = 0;
        priority.max = 1000;
        priority.step = 1;
        priority.onchange = render;
      }
    }
    conditionsEditor(
      display,
      node,
      "dialogue-node-condition dialogue-condition",
      "＋ Условие показа реплики",
    );
    const incoming = tree.nodes.flatMap((n) =>
      n.choices
        .filter((c) => c.next === node.id)
        .map((c) => `«${n.title}» → «${c.text}»`),
    );
    const hint = element(
      "p",
      node.conditions.length
        ? "Реплика появится только при выполнении ВСЕХ условий. Они действуют и при переходе из ответа; действие ответа учитывается до проверки следующей реплики."
        : "Без условий: реплика доступна всегда. Автоматическая реплика без условий может перекрыть реплики с меньшим приоритетом.",
    );
    hint.id = "dialogue-node-hint";
    display.append(hint);
    display.append(
      element(
        "p",
        incoming.length
          ? "Переходы сюда: " + incoming.join("; ")
          : node.id !== tree.start && !node.autoStart
            ? "⚠ Реплика не появится: ни один ответ не ведёт сюда. Выберите её в поле «После ответа» другой реплики или включите автоматический запуск."
            : "Входящих ответов нет; реплика может запускаться в начале разговора.",
      ),
    );
    box.append(display);
    const order = element(
      "p",
      "Порядок проверки: " +
        [
          ...openingNodes(tree).map((n) => `${n.title} (${n.priority ?? 0})`),
          `${tree.nodes.find((n) => n.id === tree.start).title} (обычное начало)`,
        ].join(" → "),
    );
    order.id = "dialogue-opening-order";
    box.append(order);
    box.append(
      element(
        "small",
        "Если условия не выполнены ни у одной стартовой реплики, NPC предложит вернуться позже. Реплики не запускаются сами посреди разговора.",
      ),
    );

    input(
      box,
      "Название реплики (только в редакторе)",
      node.title,
      (v) => (node.title = v),
    ).onchange = render;
    input(box, "Слова NPC", node.text, (v) => (node.text = v), true).id =
      "dialogue-text";
    select(
      box,
      "Аудио реплики (озвучка NPC)",
      [
        ["", "Без озвучки"],
        ...(project.audio?.assets ?? []).map((a) => [a.id, a.name]),
      ],
      node.audioId ?? "",
      (v) => (node.audioId = v || null),
    ).id = "dialogue-audio";
    box.append(
      element(
        "small",
        "Добавить файлы: кнопка «Звуки» в библиотеке. Озвучка начинается при показе этой реплики и останавливается при переходе или закрытии разговора.",
      ),
    );
    select(
      box,
      "Видео перед репликой (катсцена)",
      [["", "Без видео"], ...(project.videos ?? []).map((a) => [a.id, a.name])],
      node.videoId ?? "",
      (v) => (node.videoId = v || null),
    ).id = "dialogue-video";
    box.append(
      element(
        "small",
        "Добавить ролики: «Видео / катсцены» в библиотеке. После окончания или пропуска появятся текст, озвучка и ответы этой реплики. Видео повторяется при каждом входе в неё.",
      ),
    );
    if (tree.nodes.length > 1)
      button(box, "Удалить эту реплику", () => {
        if (
          tree.nodes.some(
            (n) =>
              n.id !== node.id && n.choices.some((c) => c.next === node.id),
          )
        ) {
          error.textContent =
            "Сначала измените ответы, ведущие к этой реплике.";
          return;
        }
        tree.nodes = tree.nodes.filter((n) => n !== node);
        if (tree.start === node.id) tree.start = tree.nodes[0].id;
        selected = tree.start;
        render();
      });
    for (const c of node.choices) {
      const card = element("fieldset", "", "dialogue-answer");
      card.dataset.answer = c.id;
      card.append(element("legend", "Ответ игрока"));
      input(card, "Текст кнопки", c.text, (v) => (c.text = v)).classList.add(
        "answer-text",
      );
      select(
        card,
        "После ответа",
        [["", "Завершить разговор"], ...tree.nodes.map((n) => [n.id, n.title])],
        c.next ?? "",
        (v) => (c.next = v || null),
      ).classList.add("answer-next");
      select(
        card,
        "Действие",
        [
          ["", "Только разговор"],
          ["accept", "Принять квест"],
          ["complete", "Сдать квест и получить награду"],
        ],
        c.action?.type ?? "",
        (v) => {
          c.action = v
            ? {
                type: v,
                quest:
                  project.quests.find((q) => q.giver === entity.id)?.id ?? "",
              }
            : null;
          render();
        },
      ).classList.add("answer-action");
      if (c.action) {
        select(
          card,
          "Какой квест этот NPC выдаёт / принимает",
          [
            ["", "Выберите квест"],
            ...project.quests
              .filter((q) => q.giver === entity.id)
              .map((q) => [q.id, questLabel(project, q)]),
          ],
          c.action.quest,
          (v) => (c.action.quest = v),
        ).classList.add("answer-quest");
        card.append(
          element(
            "small",
            c.action.type === "accept"
              ? "Действие выдаёт квест этого NPC. Условия могут проверять квесты любых NPC. Доступно только до принятия."
              : "Этот NPC принимает свой квест. Условия могут проверять квесты любых NPC. Доступно после выполнения целей; награда выдаётся один раз.",
          ),
        );
      }
      conditionsEditor(card, c, "dialogue-condition", "＋ Условие доступности");
      select(
        card,
        "Если ответ недоступен",
        [
          ["hide", "Скрыть ответ"],
          ["show", "Показать закрытым с объяснением"],
        ],
        c.showLocked ? "show" : "hide",
        (v) => (c.showLocked = v === "show"),
      );
      button(card, "Удалить ответ", () => {
        node.choices = node.choices.filter((x) => x !== c);
        render();
      });
      box.append(card);
    }
    button(
      box,
      "＋ Ответ игрока",
      () => {
        node.choices.push({
          id: uid(),
          text: "Новый ответ",
          next: null,
          conditions: [],
          showLocked: false,
          action: null,
        });
        render();
      },
      "dialogue-add-answer",
    );
    const quests = project.quests.filter((q) => q.giver === entity.id);
    if (quests.length) {
      let qid = quests[0].id;
      select(
        box,
        "Готовые ответы для квеста",
        quests.map((q) => [q.id, questLabel(project, q)]),
        qid,
        (v) => (qid = v),
      );
      button(box, "＋ Принять / сдать / отказаться", () => {
        const q = quests.find((q) => q.id === qid);
        node.choices.push(
          ...questChoices(q).map((c) => ({ ...c, id: uid() })),
          {
            id: uid(),
            text: "Нет, не сейчас",
            next: null,
            conditions: [],
            showLocked: false,
            action: null,
          },
        );
        render();
      });
    }
    box.append(
      element(
        "p",
        "Отказ без действия оставляет квест непринятым: к нему можно вернуться позже. Кнопка «Закончить разговор» доступна всегда. Квест «сдан» — игрок уже получил награду.",
      ),
    );
    const error = element("p", "", "error");
    error.setAttribute("role", "alert");
    box.append(error);
    button(
      box,
      "✓ Сохранить диалог",
      async () => {
        const p = structuredClone(project);
        p.entities.find((e) => e.id === entity.id).dialogueTree = tree;
        try {
          if (await commit(readProject(p)))
            document.querySelector("#modal").close();
        } catch (e) {
          error.textContent = e.message;
        }
      },
      "dialogue-save",
    );
    button(
      box,
      "Вернуть обычный разговор",
      async () => {
        const p = structuredClone(project);
        delete p.entities.find((e) => e.id === entity.id).dialogueTree;
        if (await commit(readProject(p)))
          document.querySelector("#modal").close();
      },
      "dialogue-reset",
    );
  };
  render();
  modal(`Диалоги: ${entity.name}`, box);
}
