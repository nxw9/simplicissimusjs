export const SLOTS = {
  weapon: "Оружие",
  head: "Голова",
  body: "Тело",
  hands: "Руки",
  feet: "Ноги",
};
export function gearConfig(e) {
  return {
    slot: "none",
    damage: 20,
    armor: 0,
    length: 1.08,
    grip: 0.16,
    rotation: [0, 0, 0],
    ...e?.gear,
  };
}
export function behaviorConfig(e) {
  return {
    faction: e.kind === "enemy" ? "enemies" : "villagers",
    reaction: "fight",
    enemies: "ignore",
    others: "neutral",
    assist: false,
    invulnerable: false,
    routine: "stand",
    radius: 5,
    ...e.behavior,
  };
}
export function reactionTo(e, other) {
  const b = behaviorConfig(e),
    target = behaviorConfig(other);
  if (b.faction === target.faction) return "ignore";
  if (e.kind === "enemy")
    return other.kind === "npc" && other.behavior ? "fight" : "ignore";
  return other.kind === "enemy"
    ? b.enemies
    : b.others === "hostile"
      ? "fight"
      : "ignore";
}
