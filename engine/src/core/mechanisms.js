export function defaultMotion(door = false) {
  return {
    trigger: "interact",
    condition: "none",
    target: null,
    offset: door ? [0, 0, 0] : [0, 2.5, 0],
    rotation: door ? [0, Math.PI / 2, 0] : [0, 0, 0],
    pivot: door ? "left" : "origin",
    duration: 1,
  };
}
export function conditionMet(m, state) {
  if (m.condition === "none") return true;
  if (m.condition === "quest") return state.quests[m.target] === "complete";
  if (m.condition === "item") return state.inventory.includes(m.target);
  return state.defeated.includes(m.target);
}
export function conditionLabel(m, project) {
  if (m.condition === "none") return "Без условий";
  if (m.condition === "quest")
    return `Завершите квест: ${project.quests.find((q) => q.id === m.target)?.title ?? "не выбран"}`;
  return `${m.condition === "item" ? "Нужен предмет" : "Победите врага"}: ${project.entities.find((e) => e.id === m.target)?.name ?? "не выбран"}`;
}
