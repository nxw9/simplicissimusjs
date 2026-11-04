export const ENEMY_DEFAULTS = Object.freeze({
  speed: 2,
  notice: 12,
  reach: 1.8,
  damage: 10,
  duration: 0.9,
  cooldown: 1.2,
  impact: 0.45,
  facing: 0,
  idle: null,
  walk: null,
  attack: null,
  death: null,
  corpseAssetId: null,
  corpseScale: 1,
  corpseFacing: 0,
});
export function enemyConfig(entity) {
  return {
    ...ENEMY_DEFAULTS,
    ...entity.enemy,
    animationSources: { ...entity.enemy?.animationSources },
  };
}
export function suggestClips(clips) {
  const find = (re) => clips.find((c) => re.test(c.name))?.name ?? null;
  return {
    idle: find(/idle|stand|дых|стой/i),
    walk: find(/walk|run|ход|бег/i),
    attack: find(/attack|slash|punch|swing|удар/i),
    death: find(/death|die|dying|смерт|умира/i),
  };
}
