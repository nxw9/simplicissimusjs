// Small real GLB fixtures with the same rig/node but different named motion clips.
export function animatedGLB(name = "Action", amount = 1) {
  const values = new Float32Array([
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    0,
    amount,
    0,
    0,
  ]);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Actor", mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: values.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 8 },
      { buffer: 0, byteOffset: 44, byteLength: 24 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 2,
        type: "SCALAR",
        min: [0],
        max: [1],
      },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
    ],
    animations: [
      {
        name,
        samplers: [{ input: 1, output: 2, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
      },
    ],
  };
  const raw = Buffer.from(JSON.stringify(json)),
    len = Math.ceil(raw.length / 4) * 4;
  const out = Buffer.alloc(12 + 8 + len + 8 + values.byteLength);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(len, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  out.fill(32, 20, 20 + len);
  raw.copy(out, 20);
  out.writeUInt32LE(values.byteLength, 20 + len);
  out.writeUInt32LE(0x004e4942, 24 + len);
  Buffer.from(values.buffer).copy(out, 28 + len);
  return out;
}
