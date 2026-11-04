import { BufferGeometryLoader } from "three";
import { SimplifyModifier } from "three/addons/modifiers/SimplifyModifier.js";
export async function simplifyGeometry(json, ratio) {
  if (![0.5, 0.25].includes(ratio)) throw Error("Неизвестный режим упрощения");
  const source = new BufferGeometryLoader().parse(json);
  try {
    const result = await new SimplifyModifier().modify(
      source,
      Math.floor(source.attributes.position.count * (1 - ratio)),
    );
    if (source.groups.length)
      result.addGroup(0, result.index.count, source.groups[0].materialIndex);
    result.name = source.name;
    const data = result.toJSON();
    result.dispose();
    return data;
  } finally {
    source.dispose();
  }
}
