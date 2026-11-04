export function canSimplify(mesh) {
  const g = mesh.geometry;
  return (
    mesh.isMesh &&
    !mesh.isSkinnedMesh &&
    !mesh.isInstancedMesh &&
    g?.attributes.position &&
    !Object.keys(g.morphAttributes).length &&
    g.groups.length <= 1 &&
    !Object.values(g.attributes).some((a) => a.isInterleavedBufferAttribute) &&
    g.drawRange.start === 0 &&
    g.drawRange.count === Infinity
  );
}
