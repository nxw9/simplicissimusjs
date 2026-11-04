import { z } from "zod";
const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,80}$/)
  .refine((v) => !(v in Object.prototype));
export const conditionLabels = {
  questNew: "Квест ещё не принят",
  questActive: "Квест выполняется",
  questReady: "Цели квеста выполнены (можно сдать)",
  questComplete: "Квест сдан",
  enemyDefeated: "Враг побеждён",
  enemyAlive: "Враг ещё жив",
  itemOwned: "Предмет получен",
  itemMissing: "Предмет ещё не получен",
};
export function questLabel(project, quest) {
  const giver = project.entities.find((e) => e.id === quest.giver);
  return `${quest.title} — ${giver?.name ?? quest.giver} · ${quest.id}`;
}
export function conditionDescription(project, condition) {
  const quest = project.quests.find((q) => q.id === condition.target);
  const target = condition.kind.startsWith("quest")
    ? quest
      ? questLabel(project, quest)
      : condition.target
    : (project.entities.find((e) => e.id === condition.target)?.name ??
      condition.target);
  return `${conditionLabels[condition.kind]}: ${target || "цель не выбрана"}`;
}
const ConditionsSchema = z
  .array(
    z
      .object({
        kind: z.enum(Object.keys(conditionLabels)),
        target: id,
      })
      .strict(),
  )
  .max(12);
export function nodeConditions(node) {
  return node.conditions ?? [];
}
export function nodeAvailable(node, game) {
  return !!node && nodeConditions(node).every((c) => conditionMet(c, game));
}
// Higher priority wins; equal priorities follow the saved node order.
export function openingNodes(tree) {
  return tree.nodes
    .filter((n) => n.autoStart && n.id !== tree.start)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
export function openingNode(tree, game) {
  return (
    openingNodes(tree).find((n) => nodeAvailable(n, game)) ??
    tree.nodes.find((n) => n.id === tree.start && nodeAvailable(n, game))
  );
}
export const DialogueSchema = z
  .object({
    start: id,
    nodes: z
      .array(
        z
          .object({
            id,
            audioId: id.nullable().optional(),
            videoId: id.nullable().optional(),
            conditions: ConditionsSchema.optional(),
            autoStart: z.boolean().optional(),
            priority: z.number().int().min(0).max(1000).optional(),
            title: z.string().min(1).max(160),
            text: z.string().max(4000),
            choices: z
              .array(
                z
                  .object({
                    id,
                    text: z.string().min(1).max(300),
                    next: id.nullable(),
                    conditions: ConditionsSchema,
                    showLocked: z.boolean(),
                    action: z
                      .object({
                        type: z.enum(["accept", "complete"]),
                        quest: id,
                      })
                      .strict()
                      .nullable(),
                  })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export function validateDialogues(project) {
  for (const e of project.entities) {
    const tree = e.dialogueTree;
    if (!tree) continue;
    const fail = (message) => {
      throw Error(`Диалог «${e.name}»: ${message}`);
    };
    if (e.kind !== "npc") fail("назначается только NPC");
    const ids = new Set(tree.nodes.map((n) => n.id));
    if (ids.size !== tree.nodes.length || !ids.has(tree.start))
      fail("неверная начальная реплика или повтор ID");
    for (const node of tree.nodes) {
      for (const condition of [
        ...nodeConditions(node),
        ...node.choices.flatMap((c) => c.conditions),
      ]) {
        const kind = condition.kind.startsWith("quest")
          ? "quest"
          : condition.kind.startsWith("enemy")
            ? "enemy"
            : "item";
        if (
          kind === "quest"
            ? !project.quests.some((q) => q.id === condition.target)
            : !project.entities.some(
                (e) => e.id === condition.target && e.kind === kind,
              )
        )
          fail(
            "условие ссылается на отсутствующий квест, врага или предмет; сначала измените условие",
          );
      }
      if (new Set(node.choices.map((c) => c.id)).size !== node.choices.length)
        fail("повтор ID ответа");
      for (const c of node.choices) {
        if (c.next !== null && !ids.has(c.next))
          fail("ответ ведёт к удалённой реплике");
        if (
          c.action &&
          !project.quests.some(
            (q) => q.id === c.action.quest && q.giver === e.id,
          )
        )
          fail("для действия выберите квест этого NPC");
      }
    }
  }
}
export function conditionMet(condition, game) {
  const { kind, target } = condition,
    status = game.state.quests[target];
  const q = game.project.quests.find((q) => q.id === target);
  switch (kind) {
    case "questNew":
      return !!q && !status;
    case "questActive":
      return status === "active";
    case "questReady":
      return status === "active" && !!q && game.questProgress(q).ready;
    case "questComplete":
      return status === "complete";
    case "enemyDefeated":
      return game.state.defeated.includes(target);
    case "enemyAlive":
      return !game.state.defeated.includes(target);
    case "itemOwned":
      return game.state.inventory.includes(target);
    case "itemMissing":
      return !game.state.inventory.includes(target);
    default:
      return false;
  }
}
export function defaultDialogue(npc, project) {
  const choices = [];
  for (const q of project.quests.filter((q) => q.giver === npc.id))
    choices.push(...questChoices(q));
  choices.push({
    id: "leave",
    text: "Не сейчас / До свидания",
    next: null,
    conditions: [],
    showLocked: false,
    action: null,
  });
  choices.forEach((c, i) => {
    c.id = "choice_" + i;
  });
  return {
    start: "start",
    nodes: [{ id: "start", title: "Начало", text: npc.dialogue, choices }],
  };
}
export function questChoices(q) {
  return [
    {
      id: `accept_${q.id}`.slice(0, 80),
      text: `Принять: ${q.title}`.slice(0, 300),
      next: null,
      conditions: [{ kind: "questNew", target: q.id }],
      showLocked: false,
      action: { type: "accept", quest: q.id },
    },
    {
      id: `claim_${q.id}`.slice(0, 80),
      text: `Сдать: ${q.title} (+${q.reward} золота)`.slice(0, 300),
      next: null,
      conditions: [{ kind: "questReady", target: q.id }],
      showLocked: false,
      action: { type: "complete", quest: q.id },
    },
  ];
}
export class Conversation {
  constructor(game, npcId) {
    this.game = game;
    this.npc = game.project.entities.find(
      (e) => e.id === npcId && e.kind === "npc",
    );
    if (!this.npc) throw Error("NPC не найден");
    this.tree =
      this.npc.dialogueTree ?? defaultDialogue(this.npc, game.project);
    this.nodeId = openingNode(this.tree, game)?.id ?? null;
    this.unavailable = this.nodeId === null;
  }
  screen() {
    const node = this.tree.nodes.find((n) => n.id === this.nodeId);
    if (this.unavailable || (node && !nodeAvailable(node, this.game)))
      return {
        text: "Сейчас у меня нет подходящей реплики. Вернитесь позже.",
        choices: [],
      };
    if (!node) return null;
    const choices = node.choices
      .map((c) => {
        const missing = c.conditions.filter(
          (condition) => !conditionMet(condition, this.game),
        );
        let enabled = this.game.alive && missing.length === 0;
        if (c.action)
          enabled &&= this.game.canQuestAction(
            c.action.type,
            c.action.quest,
            this.npc.id,
          );
        // Destination conditions see the state AFTER this answer's quest action.
        // Check a projection first: a blocked transition must never grant a reward.
        const nextGame = Object.create(this.game);
        nextGame.state = {
          ...this.game.state,
          quests: { ...this.game.state.quests },
        };
        if (c.action && enabled)
          nextGame.state.quests[c.action.quest] =
            c.action.type === "accept" ? "active" : "complete";
        const next = this.tree.nodes.find((n) => n.id === c.next);
        const destinationMissing = next
          ? nodeConditions(next).filter(
              (condition) => !conditionMet(condition, nextGame),
            )
          : [];
        if (c.next !== null && (!next || destinationMissing.length))
          enabled = false;
        missing.push(...destinationMissing);
        const reason = missing
          .map((c) => conditionDescription(this.game.project, c))
          .join("; ");
        return {
          ...c,
          enabled,
          reason:
            reason ||
            (!enabled ? "Квест пока недоступен для этого действия" : ""),
        };
      })
      .filter((c) => c.enabled || c.showLocked);
    return {
      text: node.text,
      choices,
      audioId: node.audioId ?? null,
      videoId: node.videoId ?? null,
    };
  }
  choose(id) {
    const c = this.screen()?.choices.find((c) => c.id === id);
    if (!c?.enabled) return false;
    if (
      c.action &&
      !this.game.questAction(c.action.type, c.action.quest, this.npc.id)
    )
      return false;
    this.nodeId = c.next;
    return true;
  }
}
