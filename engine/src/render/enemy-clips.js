import { PropertyBinding } from "three";
// Clips are borrowed from their GLB; the visible actor and skeleton remain unchanged.
export function enemyClip(config, state, ownClips, models) {
  const source = config.animationSources?.[state];
  const clips = source ? models?.get(source)?.animations : ownClips;
  return clips?.find((c) => c.name === config[state]) ?? null;
}
export function clipFits(clip, model) {
  if (!clip || !model) return false;
  return (clip.tracks ?? []).every((track) => {
    try {
      const path = PropertyBinding.parseTrackName(track.name);
      let node = PropertyBinding.findNode(model, path.nodeName);
      if (!node) return false;
      if (path.objectName === "bones") {
        const bones = node.skeleton?.bones;
        node =
          bones?.find((b) => b.name === path.objectIndex) ??
          bones?.[path.objectIndex];
      } else if (path.objectName) {
        node = node[path.objectName];
        if (path.objectIndex !== undefined) node = node?.[path.objectIndex];
      }
      return node != null && path.propertyName in node;
    } catch {
      return false;
    }
  });
}
