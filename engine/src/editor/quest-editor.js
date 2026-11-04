import { conditionFields } from "./world-events-editor.js";
import { questTargets, questObjectivesChanged } from "../core/quests.js";
import { createEntity } from "../core/project.js";
import { heightAt } from "../core/terrain.js";
export function questWizard({ project, modal, element, commit, existing }) {
  const q = structuredClone(
    existing ?? {
      id: crypto.randomUUID(),
      title: "Новое задание",
      type: "defeat",
      giver: "",
      target: "",
      required: 1,
      reward: 25,
    },
  );
  q.targets = q.target ? [...questTargets(q)] : [];
  const pending = [];
  let step = 0;
  const all = () => [...project.entities, ...pending];
  const create = (kind) => {
    const e = createEntity(
      kind,
      ["enemy", "npc"].includes(kind) ? "humanoid" : "sphere",
    );
    e.name =
      kind === "npc"
        ? "Заказчик задания"
        : kind === "enemy"
          ? "Противник задания"
          : "Предмет задания";
    e.position = [
      Math.max(
        -project.world.size / 2 + 2,
        Math.min(
          project.world.size / 2 - 2,
          project.world.spawn[0] + 3 + pending.length * 2,
        ),
      ),
      0,
      project.world.spawn[2] - 3,
    ];
    e.position[2] = Math.max(
      -project.world.size / 2 + 2,
      Math.min(project.world.size / 2 - 2, e.position[2]),
    );
    e.position[1] =
      heightAt(project.world, e.position[0], e.position[2]) +
      (["enemy", "npc"].includes(kind) ? 0 : 0.5);
    e.solid = false;
    if (kind === "npc")
      e.dialogue = "Помоги мне с заданием. Вернись, когда закончишь.";
    pending.push(e);
    return e.id;
  };
  const show = () => {
    const box = element("div", "", "quest-wizard");
    box.append(
      element(
        "small",
        `Шаг ${step + 1} из 4 · ${["Задание", "Кто выдаёт", "Цель", "Проверка и награда"][step]}`,
      ),
    );
    const error = element("p", "", "wizard-error");
    error.setAttribute("role", "alert");
    const select = (label, list, key) => {
      const l = element("label", label, "field"),
        s = element("select");
      s.id = "quest-" + key;
      const blank = element("option", "Выберите…");
      blank.value = "";
      s.append(blank);
      for (const item of list) {
        const o = element("option", `${item.name} · ID: ${item.id}`);
        o.value = item.id;
        s.append(o);
      }
      s.value = q[key];
      s.onchange = () => (q[key] = s.value);
      l.append(s);
      box.append(l);
    };
    if (step === 0) {
      const l = element("label", "Название, которое увидит игрок", "field"),
        input = element("input");
      input.id = "quest-title";
      input.value = q.title;
      input.maxLength = 200;
      input.oninput = () => (q.title = input.value);
      l.append(input);
      box.append(l);
      box.append(element("p", "Что нужно сделать?"));
      for (const [type, label] of [
        ["defeat", "⚔ Победить выбранных противников"],
        ["collect", "◇ Найти и забрать предмет"],
      ]) {
        const b = element("button", label, q.type === type ? "primary" : "");
        b.dataset.questType = type;
        b.onclick = () => {
          if (q.type !== type) {
            q.target = "";
            delete q.targets;
            q.targets = [];
          }
          q.type = type;
          show();
        };
        box.append(b);
      }
    }
    if (step === 1) {
      box.append(
        element(
          "p",
          "Игрок поговорит с этим NPC клавишей E, чтобы получить задание. После выполнения нужно вернуться к нему.",
        ),
      );
      select(
        "Кто выдаёт задание",
        all().filter((e) => e.kind === "npc"),
        "giver",
      );
      const add = element("button", "＋ Создать NPC рядом со стартом");
      add.id = "quest-create-giver";
      add.onclick = () => {
        q.giver = create("npc");
        show();
      };
      box.append(add);
    }
    if (step === 2) {
      const kind = q.type === "defeat" ? "enemy" : "item";
      box.append(
        element(
          "p",
          kind === "enemy"
            ? "Отметьте всех противников, которых нужно устранить. Квест выполнится только после победы над каждым выбранным врагом."
            : "Выберите предмет, который нужно подобрать клавишей E.",
        ),
      );
      {
        const search = element("input");
        search.type = "search";
        search.placeholder = "Найти врага по имени или ID";
        search.id = "quest-target-search";
        const count = element("p", `Выбрано целей: ${q.targets.length}`);
        count.id = "quest-target-count";
        const list = element("div", "", "quest-target-list");
        list.id = "quest-targets";
        const enemies = all().filter((e) => e.kind === kind);
        if (!enemies.length)
          list.append(
            element("p", "Врагов пока нет. Создайте их кнопкой ниже."),
          );
        for (const enemy of enemies) {
          const label = element(
            "label",
            `${enemy.name} · ID: ${enemy.id}`,
            "check",
          );
          label.dataset.search = `${enemy.name} ${enemy.id}`.toLowerCase();
          const input = element("input");
          input.type = "checkbox";
          input.value = enemy.id;
          input.checked = q.targets.includes(enemy.id);
          input.onchange = () => {
            if (input.checked) q.targets.push(enemy.id);
            else q.targets = q.targets.filter((id) => id !== enemy.id);
            q.target = q.targets[0] ?? "";
            count.textContent = `Выбрано целей: ${q.targets.length}`;
          };
          label.prepend(input);
          list.append(label);
        }
        search.oninput = () => {
          for (const label of list.querySelectorAll("label"))
            label.hidden = !label.dataset.search.includes(
              search.value.trim().toLowerCase(),
            );
        };
        box.append(search, count, list);
      }
      const add = element(
        "button",
        kind === "enemy"
          ? "＋ Создать противника рядом со стартом"
          : "＋ Создать предмет рядом со стартом",
      );
      add.id = "quest-create-target";
      add.onclick = () => {
        const id = create(kind);
        {
          q.targets.push(id);
          q.target = q.targets[0];
        }
        show();
      };
      box.append(add);
    }
    if (step === 3) {
      const giver = all().find((e) => e.id === q.giver),
        targets = questTargets(q).map((id) => all().find((e) => e.id === id));
      box.append(
        element("h3", q.title),
        element("p", `1. Поговорить: ${giver?.name}.`),
        element(
          "p",
          `2. ${q.type === "defeat" ? "Победить" : "Забрать"}: ${targets.map((e) => `${e?.name} (ID: ${e?.id})`).join("; ")}.`,
        ),
        element("p", `3. Вернуться к ${giver?.name} за наградой.`),
      );
      const l = element("label", "Награда, золото", "field"),
        input = element("input");
      input.type = "number";
      input.min = 0;
      input.max = 100000;
      input.step = 1;
      input.value = q.reward;
      input.id = "quest-reward";
      input.oninput = () => (q.reward = Number(input.value));
      l.append(input);
      box.append(l);
      const mainLabel = element(
          "label",
          "Основной сюжет (приоритет навигации)",
          "check",
        ),
        mainInput = element("input");
      mainInput.type = "checkbox";
      mainInput.checked = !!q.main;
      mainInput.onchange = () => (q.main = mainInput.checked);
      mainLabel.prepend(mainInput);
      box.append(mainLabel);
      box.append(element("h3", "Условия доступа к заданию"));
      conditionFields(box, q, project);
      if (existing && questObjectivesChanged(existing, q))
        box.append(
          element(
            "p",
            "Изменение целей создаст новую версию контента игры: прежние сейвы к ней не подойдут.",
          ),
        );
      if (pending.length)
        box.append(
          element(
            "p",
            `Будут добавлены рядом со стартом: ${pending
              .filter((e) => e.id === q.giver || questTargets(q).includes(e.id))
              .map((e) => e.name)
              .join(", ")}. Их можно передвинуть после сохранения.`,
          ),
        );
    }
    box.append(error);
    const row = element("div", "", "button-row");
    if (step) {
      const back = element("button", "← Назад");
      back.onclick = () => {
        step--;
        show();
      };
      row.append(back);
    }
    const next = element(
      "button",
      step === 3 ? "✓ Сохранить квест" : "Далее →",
      "primary",
    );
    next.id = "quest-next";
    next.onclick = async () => {
      if (step === 0 && !q.title.trim()) {
        error.textContent = "Введите название задания.";
        return;
      }
      if (step === 1 && !q.giver) {
        error.textContent = "Выберите NPC или создайте его кнопкой выше.";
        return;
      }
      if (step === 2 && !q.target) {
        error.textContent = "Выберите цель или создайте её кнопкой выше.";
        return;
      }
      if (step < 3) {
        step++;
        show();
        return;
      }
      if (!Number.isInteger(q.reward) || q.reward < 0 || q.reward > 100000) {
        error.textContent = "Награда — целое число от 0 до 100000.";
        return;
      }
      const p = structuredClone(project);
      if (existing && questObjectivesChanged(existing, q)) p.contentVersion++;
      p.entities.push(
        ...pending.filter(
          (e) => e.id === q.giver || questTargets(q).includes(e.id),
        ),
      );
      const index = p.quests.findIndex((x) => x.id === q.id);
      if (index < 0) p.quests.push(q);
      else p.quests[index] = q;
      if (await commit(p)) document.querySelector("#modal").close();
    };
    row.append(next);
    box.append(row);
    modal(existing ? "Изменить квест" : "Создать квест", box);
  };
  show();
}
