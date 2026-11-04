import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { demoProject } from "../src/core/demo.js";
import { GameState } from "../src/core/game.js";
import {
  Conversation,
  defaultDialogue,
  conditionMet,
} from "../src/core/dialogue.js";
import {
  readProject,
  serializeProject,
  renameEntity,
} from "../src/core/project.js";
import { dialogueEditor } from "../src/editor/dialogue-editor.js";
import { Session } from "../src/render/session.js";

function branched() {
  const p = demoProject(),
    npc = p.entities.find((e) => e.id === "warden");
  npc.dialogueTree = {
    start: "hello",
    nodes: [
      {
        id: "hello",
        title: "Встреча",
        text: "Поможешь?",
        choices: [
          {
            id: "yes",
            text: "Да",
            next: "thanks",
            conditions: [{ kind: "questNew", target: "first-fire" }],
            showLocked: false,
            action: { type: "accept", quest: "first-fire" },
          },
          {
            id: "no",
            text: "Нет",
            next: "refuse",
            conditions: [],
            showLocked: false,
            action: null,
          },
          {
            id: "secret",
            text: "Расскажи тайну",
            next: "secret",
            conditions: [
              { kind: "questComplete", target: "first-fire" },
              { kind: "enemyDefeated", target: "sentinel" },
            ],
            showLocked: true,
            action: null,
          },
          {
            id: "claim",
            text: "Получить награду",
            next: null,
            conditions: [{ kind: "questReady", target: "first-fire" }],
            showLocked: false,
            action: { type: "complete", quest: "first-fire" },
          },
        ],
      },
      { id: "thanks", title: "Согласие", text: "Спасибо!", choices: [] },
      { id: "refuse", title: "Отказ", text: "Можешь передумать.", choices: [] },
      { id: "secret", title: "Тайна", text: "Теперь ты готов.", choices: [] },
    ],
  };
  return readProject(p);
}
test("default conversations never accept silently; refusal and explicit acceptance", () => {
  const g = new GameState(demoProject());
  g.talk("warden");
  assert.deepEqual(g.state.quests, {});
  let c = new Conversation(g, "warden");
  assert.ok(c.screen().choices.some((c) => c.action?.type === "accept"));
  assert.equal(c.choose(c.screen().choices.find((c) => !c.action).id), true);
  assert.equal(c.screen(), null);
  assert.deepEqual(g.state.quests, {});
  c = new Conversation(g, "warden");
  c.choose(c.screen().choices.find((c) => c.action?.type === "accept").id);
  assert.equal(g.state.quests["first-fire"], "active");
  assert.equal(g.state.gold, 0);
});
test("branching, all conditions, reward exactly once and progress across save/load", () => {
  const p = branched(),
    g = new GameState(p);
  let c = new Conversation(g, "warden");
  assert.equal(c.choose("secret"), false);
  assert.match(
    c.screen().choices.find((c) => c.id === "secret").reason,
    /Квест сдан.*Враг побеждён/,
  );
  c.choose("no");
  assert.equal(c.screen().text, "Можешь передумать.");
  assert.deepEqual(g.state.quests, {});
  c = new Conversation(g, "warden");
  c.choose("yes");
  assert.equal(c.screen().text, "Спасибо!");
  g.collect("shard");
  c = new Conversation(g, "warden");
  assert.equal(c.choose("claim"), true);
  assert.equal(g.state.gold, 25);
  c = new Conversation(g, "warden");
  assert.equal(c.choose("claim"), false);
  assert.equal(c.choose("secret"), false);
  g.hit("sentinel", 1000);
  const restored = new GameState(p);
  restored.load(g.save());
  c = new Conversation(restored, "warden");
  assert.equal(c.choose("secret"), true);
  assert.equal(c.screen().text, "Теперь ты готов.");
  assert.equal(restored.state.gold, 25);
});
test("choices recheck fresh state, action preconditions and player life", () => {
  const g = new GameState(branched()),
    c = new Conversation(g, "warden");
  assert.equal(c.screen().choices.find((c) => c.id === "yes").enabled, true);
  g.questAction("accept", "first-fire", "warden");
  assert.equal(c.choose("yes"), false);
  assert.equal(g.questAction("complete", "first-fire", "warden"), false);
  assert.equal(g.questAction("accept", "first-fire", "sentinel"), false);
  g.damage(100);
  assert.equal(c.choose("no"), false);
  assert.equal(c.choose("unknown"), false);
});
test("condition vocabulary distinguishes ready/completed and item/enemy state", () => {
  const g = new GameState(demoProject()),
    check = (kind, target) => conditionMet({ kind, target }, g);
  assert.equal(check("questNew", "first-fire"), true);
  assert.equal(check("questNew", "missing"), false);
  assert.equal(check("enemyAlive", "sentinel"), true);
  assert.equal(check("itemMissing", "shard"), true);
  g.questAction("accept", "first-fire", "warden");
  g.collect("shard");
  assert.equal(check("questActive", "first-fire"), true);
  assert.equal(check("questReady", "first-fire"), true);
  assert.equal(check("questComplete", "first-fire"), false);
  assert.equal(check("itemOwned", "shard"), true);
  g.questAction("complete", "first-fire", "warden");
  assert.equal(check("questReady", "first-fire"), false);
  assert.equal(check("questComplete", "first-fire"), true);
});
test("dialogue references validate, rename atomically, and allow cycles", () => {
  const p = branched();
  renameEntity(p, "sentinel", "guard");
  assert.equal(
    p.entities.find((e) => e.id === "warden").dialogueTree.nodes[0].choices[2]
      .conditions[1].target,
    "guard",
  );
  const tree = p.entities.find((e) => e.id === "warden").dialogueTree;
  tree.nodes[1].choices.push({
    id: "back",
    text: "Назад",
    next: "hello",
    conditions: [],
    showLocked: false,
    action: null,
  });
  assert.deepEqual(readProject(serializeProject(p)), p);
  for (const mutate of [
    (p) =>
      (p.entities.find((e) => e.id === "warden").dialogueTree.start =
        "missing"),
    (p) =>
      (p.entities.find(
        (e) => e.id === "warden",
      ).dialogueTree.nodes[0].choices[0].next = "missing"),
    (p) =>
      (p.entities.find(
        (e) => e.id === "warden",
      ).dialogueTree.nodes[0].choices[0].action.quest = "missing"),
    (p) => (p.entities = p.entities.filter((e) => e.id !== "guard")),
    (p) => (p.quests = []),
  ]) {
    const bad = structuredClone(p);
    mutate(bad);
    assert.throws(() => serializeProject(bad), /Диалог/);
  }
  const old = demoProject();
  old.schemaVersion = 11;
  assert.equal(readProject(old).schemaVersion, 25);
  assert.equal(old.schemaVersion, 11);
});
test("editor builds and saves a branch with a condition without mutating until commit", async () => {
  const dom = new JSDOM('<dialog id="modal"></dialog>');
  globalThis.document = dom.window.document;
  dom.window.HTMLDialogElement.prototype.close = function () {};
  const p = demoProject(),
    npc = p.entities.find((e) => e.id === "warden");
  let saved;
  const element = (tag, text = "", className = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = className;
    return e;
  };
  const click = (id) => document.querySelector(id).click();
  const change = (e, value) => {
    e.value = value;
    e.dispatchEvent(new dom.window.Event("change"));
  };
  try {
    dialogueEditor({
      entity: npc,
      project: p,
      element,
      modal: (_, box) => document.querySelector("#modal").append(box),
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
    });
    click("#dialogue-add-node");
    const text = document.querySelector("#dialogue-text");
    text.value = "После победы";
    text.dispatchEvent(new dom.window.Event("input"));
    click("#dialogue-add-answer");
    const card = document.querySelector(".dialogue-answer");
    [...card.querySelectorAll("button")]
      .find((b) => b.textContent.includes("Условие"))
      .click();
    change(
      document.querySelector(".dialogue-condition .condition-category"),
      "enemy",
    );
    change(
      document.querySelector(".dialogue-condition .condition-target"),
      "sentinel",
    );
    change(
      document.querySelector("#dialogue-start"),
      document.querySelector("#dialogue-node").value,
    );
    assert.equal(npc.dialogueTree, undefined);
    click("#dialogue-save");
    await Promise.resolve();
    const c = new Conversation(new GameState(saved), "warden");
    assert.equal(c.screen().text, "После победы");
    assert.equal(c.screen().choices.length, 0);
    c.game.hit("sentinel", 1000);
    assert.equal(c.screen().choices.length, 1);
  } finally {
    dom.window.close();
  }
});
test("runtime renders disabled choices, follows branches and ignores paused clicks", () => {
  const dom = new JSDOM(
    '<div id="ui"><div class="dialogue"><h3></h3><p></p><div class="dialogue-choices"></div><button class="dialogue-close"></button></div></div>',
  );
  globalThis.document = dom.window.document;
  try {
    const game = new GameState(branched()),
      s = Object.create(Session.prototype);
    Object.assign(s, {
      game,
      conversation: new Conversation(game, "warden"),
      ui: document.querySelector("#ui"),
      talkingNPC: "warden",
      dialogOpen: true,
      paused: false,
      notify() {},
      sync() {},
      lock() {},
    });
    s.showDialogue();
    assert.equal(
      document.querySelectorAll(".dialogue-choices button:disabled").length,
      1,
    );
    s.paused = true;
    document.querySelector(".dialogue-choices button").click();
    assert.deepEqual(game.state.quests, {});
    s.paused = false;
    document.querySelector(".dialogue-choices button").click();
    assert.equal(document.querySelector(".dialogue p").textContent, "Спасибо!");
    s.closeDialogue();
    assert.equal(s.dialogOpen, false);
    assert.equal(s.conversation, null);
  } finally {
    dom.window.close();
  }
});

test("node conditions select automatic openings by priority, stable ties and fallback", () => {
  const p = branched(),
    tree = p.entities.find((e) => e.id === "warden").dialogueTree;
  tree.nodes.find((n) => n.id === "thanks").autoStart = true;
  Object.assign(
    tree.nodes.find((n) => n.id === "thanks"),
    {
      priority: 10,
      conditions: [{ kind: "questActive", target: "first-fire" }],
    },
  );
  Object.assign(
    tree.nodes.find((n) => n.id === "secret"),
    {
      autoStart: true,
      priority: 20,
      conditions: [
        { kind: "enemyDefeated", target: "sentinel" },
        { kind: "questComplete", target: "first-fire" },
      ],
    },
  );
  const g = new GameState(readProject(p));
  assert.equal(new Conversation(g, "warden").nodeId, "hello");
  g.questAction("accept", "first-fire", "warden");
  assert.equal(new Conversation(g, "warden").nodeId, "thanks");
  g.hit("sentinel", 1000);
  assert.equal(new Conversation(g, "warden").nodeId, "thanks");
  g.collect("shard");
  g.questAction("complete", "first-fire", "warden");
  const restored = new GameState(g.project);
  restored.load(g.save());
  assert.equal(new Conversation(restored, "warden").nodeId, "secret");
  const t = restored.project.entities.find(
    (e) => e.id === "warden",
  ).dialogueTree;
  Object.assign(
    t.nodes.find((n) => n.id === "thanks"),
    { conditions: [], priority: 20 },
  );
  assert.equal(new Conversation(restored, "warden").nodeId, "thanks");
  t.nodes.find((n) => n.id === "thanks").priority = 19;
  assert.equal(new Conversation(restored, "warden").nodeId, "secret");
});
test("destination conditions see quest actions atomically and blocked choices have no effects", () => {
  const p = branched(),
    tree = p.entities.find((e) => e.id === "warden").dialogueTree;
  tree.nodes.find((n) => n.id === "thanks").conditions = [
    { kind: "questActive", target: "first-fire" },
    { kind: "enemyDefeated", target: "sentinel" },
  ];
  tree.nodes[0].choices.find((c) => c.id === "yes").showLocked = true;
  const g = new GameState(p),
    c = new Conversation(g, "warden");
  assert.equal(c.screen().choices.find((c) => c.id === "yes").enabled, false);
  assert.equal(c.choose("yes"), false);
  assert.deepEqual(g.state.quests, {});
  g.hit("sentinel", 1000);
  assert.equal(c.choose("yes"), true);
  assert.equal(c.screen().text, "Спасибо!");
  g.collect("shard");
  const claim = tree.nodes[0].choices.find((c) => c.id === "claim");
  claim.next = "secret";
  tree.nodes.find((n) => n.id === "secret").conditions = [
    { kind: "questComplete", target: "first-fire" },
  ];
  const turn = new Conversation(g, "warden");
  assert.equal(turn.choose("claim"), true);
  assert.equal(turn.screen().text, "Теперь ты готов.");
  assert.equal(g.state.gold, 25);
});
test("no eligible opening gives a clear message; node references migrate and rename", () => {
  const p = branched(),
    tree = p.entities.find((e) => e.id === "warden").dialogueTree;
  tree.nodes[0].conditions = [{ kind: "enemyDefeated", target: "sentinel" }];
  assert.match(
    new Conversation(new GameState(p), "warden").screen().text,
    /Вернитесь позже/,
  );
  renameEntity(p, "sentinel", "guard");
  assert.equal(tree.nodes[0].conditions[0].target, "guard");
  assert.doesNotThrow(() => serializeProject(p));
  tree.nodes[0].conditions[0].target = "missing";
  assert.throws(() => serializeProject(p), /условие/);
  const old = branched();
  old.schemaVersion = 12;
  const before = structuredClone(old);
  const migrated = readProject(old);
  assert.deepEqual(old, before);
  assert.deepEqual(migrated.entities, old.entities);
  assert.equal(
    new Conversation(new GameState(migrated), "warden").nodeId,
    "hello",
  );
});
test("node conditions recheck before a click and cannot leak a stale transition", () => {
  const p = branched(),
    tree = p.entities.find((e) => e.id === "warden").dialogueTree;
  tree.nodes.find((n) => n.id === "refuse").conditions = [
    { kind: "enemyAlive", target: "sentinel" },
  ];
  const g = new GameState(p),
    c = new Conversation(g, "warden");
  assert.ok(c.screen().choices.find((c) => c.id === "no"));
  g.hit("sentinel", 1000);
  assert.equal(c.choose("no"), false);
  assert.equal(c.nodeId, "hello");
});
test("editor exposes node conditions, launch mode, order and unreachable-node warning", async () => {
  const dom = new JSDOM('<dialog id="modal"></dialog>');
  globalThis.document = dom.window.document;
  dom.window.HTMLDialogElement.prototype.close = function () {};
  const p = demoProject(),
    npc = p.entities.find((e) => e.id === "warden");
  let saved;
  const element = (tag, text = "", className = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = className;
    return e;
  };
  const change = (selector, value) => {
    const e = document.querySelector(selector);
    e.value = value;
    e.dispatchEvent(new dom.window.Event("change"));
  };
  try {
    dialogueEditor({
      entity: npc,
      project: p,
      element,
      modal: (_, box) => document.querySelector("#modal").append(box),
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
    });
    document.querySelector("#dialogue-add-node").click();
    assert.equal(
      document.querySelector("#dialogue-node-trigger").value,
      "auto",
    );
    assert.match(
      document.querySelector("#dialogue-opening-order").textContent,
      /Реплика 2 \(10\).*Начало/,
    );
    [...document.querySelectorAll(".dialogue-node-rules button")]
      .find((b) => b.textContent.includes("Условие показа"))
      .click();
    change(".dialogue-node-condition .condition-category", "enemy");
    change(".dialogue-node-condition .condition-target", "sentinel");
    change("#dialogue-node-trigger", "answer");
    assert.match(
      document.querySelector(".dialogue-node-rules").textContent,
      /Реплика не появится/,
    );
    change("#dialogue-node-trigger", "auto");
    document.querySelector("#dialogue-save").click();
    await Promise.resolve();
    const g = new GameState(saved);
    assert.equal(new Conversation(g, "warden").nodeId, "start");
    g.hit("sentinel", 1000);
    assert.notEqual(new Conversation(g, "warden").nodeId, "start");
  } finally {
    dom.window.close();
  }
});

function multipleGivers() {
  const p = branched();
  const other = structuredClone(p.entities.find((e) => e.id === "warden"));
  other.id = "healer";
  other.name = "Целитель";
  delete other.dialogueTree;
  p.entities.push(other);
  p.quests.push(
    { ...p.quests[0], id: "warden-second" },
    { ...p.quests[0], id: "healer-quest", giver: "healer" },
  );
  return p;
}
test("a line can require two quests from its NPC and another NPC, independently across saves", () => {
  const p = multipleGivers(),
    tree = p.entities.find((e) => e.id === "warden").dialogueTree;
  Object.assign(
    tree.nodes.find((n) => n.id === "secret"),
    {
      autoStart: true,
      priority: 30,
      conditions: p.quests.map((q) => ({
        kind: "questComplete",
        target: q.id,
      })),
    },
  );
  const g = new GameState(readProject(p));
  g.collect("shard");
  for (const q of p.quests.slice(0, 2)) {
    g.questAction("accept", q.id, q.giver);
    g.questAction("complete", q.id, q.giver);
  }
  assert.equal(new Conversation(g, "warden").nodeId, "hello");
  assert.equal(g.questAction("accept", "healer-quest", "warden"), false);
  g.questAction("accept", "healer-quest", "healer");
  assert.equal(new Conversation(g, "warden").nodeId, "hello");
  g.questAction("complete", "healer-quest", "healer");
  const restored = new GameState(readProject(serializeProject(p)));
  restored.load(g.save());
  assert.equal(new Conversation(restored, "warden").nodeId, "secret");
  assert.equal(restored.state.quests["warden-second"], "complete");
});
test("condition UI distinguishes same-title quests by giver and ID and keeps target when state changes", async () => {
  const dom = new JSDOM('<dialog id="modal"></dialog>');
  globalThis.document = dom.window.document;
  dom.window.HTMLDialogElement.prototype.close = function () {};
  const p = multipleGivers(),
    npc = p.entities.find((e) => e.id === "warden");
  let saved;
  const element = (tag, text = "", className = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = className;
    return e;
  };
  const change = (selector, value) => {
    const e = document.querySelector(selector);
    e.value = value;
    e.dispatchEvent(new dom.window.Event("change"));
  };
  try {
    dialogueEditor({
      entity: npc,
      project: p,
      element,
      modal: (_, box) => document.querySelector("#modal").append(box),
      commit: async (next) => {
        saved = readProject(next);
        return true;
      },
    });
    [...document.querySelectorAll(".dialogue-node-rules button")]
      .find((b) => b.textContent.includes("Условие показа"))
      .click();
    let options = [
      ...document.querySelector(".dialogue-node-condition .condition-target")
        .options,
    ];
    assert.equal(options.length, 4);
    assert.match(
      options.find((o) => o.value === "healer-quest").textContent,
      /Целитель.*healer-quest/,
    );
    assert.match(
      options.find((o) => o.value === "warden-second").textContent,
      /warden-second/,
    );
    const search = document.querySelector(
      ".dialogue-node-condition .condition-search",
    );
    search.value = "Целитель";
    search.dispatchEvent(new dom.window.Event("input"));
    assert.deepEqual(
      [
        ...document.querySelector(".dialogue-node-condition .condition-target")
          .options,
      ].map((o) => o.value),
      ["", "healer-quest"],
    );
    change(".dialogue-node-condition .condition-target", "healer-quest");
    change(".dialogue-node-condition .condition-state", "questReady");
    assert.equal(
      document.querySelector(".dialogue-node-condition .condition-target")
        .value,
      "healer-quest",
    );
    assert.match(
      document.querySelector(".dialogue-node-condition .condition-summary")
        .textContent,
      /Целитель.*healer-quest/,
    );
    const actionOptions = [
      ...document.querySelector(".answer-quest").options,
    ].map((o) => o.value);
    assert.ok(actionOptions.includes("warden-second"));
    assert.ok(!actionOptions.includes("healer-quest"));
    document.querySelector("#dialogue-save").click();
    await Promise.resolve();
    assert.deepEqual(
      saved.entities.find((e) => e.id === "warden").dialogueTree.nodes[0]
        .conditions,
      [{ kind: "questReady", target: "healer-quest" }],
    );
    assert.equal(saved.schemaVersion, 25);
  } finally {
    dom.window.close();
  }
});
