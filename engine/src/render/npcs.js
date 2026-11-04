import * as T from "three";
export function npcConfig(e, clips = []) {
  const find = (re) => clips.find((c) => re.test(c.name))?.name ?? null;
  return {
    facing: 0,
    idle: find(/idle|stand|стой/i),
    talk: find(/talk|speak|gesture|разговор/i),
    ...e.npc,
  };
}
export class NPCs {
  constructor(view, project) {
    this.view = view;
    this.units = project.entities
      .filter((e) => e.kind === "npc")
      .map((e) => {
        const o = view.objects.get(e.id),
          model = o.userData.npcModel,
          clips = o.userData.npcClips ?? [];
        return {
          e,
          o,
          model,
          clips,
          config: npcConfig(e, clips),
          mixer: model ? new T.AnimationMixer(model) : null,
          time: 0,
          state: null,
          action: null,
        };
      });
  }
  update(dt, talking) {
    for (const u of this.units) {
      if (
        !u.o.visible ||
        u.o.userData.defeated ||
        (u.o.userData.aiState && u.o.userData.aiState !== "idle")
      ) {
        u.mixer?.stopAllAction();
        u.state = null;
        continue;
      }
      const state = u.e.id === talking ? "talk" : "idle";
      u.time += dt;
      if (u.state !== state) {
        u.state = state;
        const clip =
          u.clips.find((c) => c.name === u.config[state]) ??
          u.clips.find((c) => c.name === u.config.idle);
        u.action?.fadeOut(0.2);
        if (clip) {
          u.action = u.mixer.clipAction(clip);
          u.action.reset().fadeIn(0.2).play();
        } else u.action = null;
      }
      u.mixer?.update(dt);
      u.o.userData.npcPose?.(state, u.time);
      u.o.updateMatrixWorld(true);
    }
    this.shadowTime = (this.shadowTime ?? 0) + dt;
    if (this.units.length && this.shadowTime > 0.1) {
      this.view.invalidate?.(true);
      this.shadowTime = 0;
    }
  }
  dispose() {
    for (const u of this.units) {
      u.mixer?.stopAllAction();
      if (u.model) u.mixer?.uncacheRoot(u.model);
      u.o.userData.npcPose?.("idle", 0);
    }
    this.view.invalidate?.(true);
  }
}
