/** Legacy quests keep their single target; new defeat quests require every ID. */
export function questTargets(quest) {
  return quest.targets ? quest.targets : [quest.target];
}
export function questObjectivesChanged(before, after) {
  return (
    JSON.stringify(before.conditions ?? []) !==
      JSON.stringify(after.conditions ?? []) ||
    before.type !== after.type ||
    JSON.stringify([...questTargets(before)].sort()) !==
      JSON.stringify([...questTargets(after)].sort())
  );
}
