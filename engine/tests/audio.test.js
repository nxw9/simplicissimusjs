import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { demoProject } from "../src/core/demo.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { audioBytes } from "../src/core/audio.js";
import { GameAudio } from "../src/render/audio.js";
import { audioEditor } from "../src/editor/audio-editor.js";
import { dialogueEditor } from "../src/editor/dialogue-editor.js";
import { GameState } from "../src/core/game.js";
import { Conversation } from "../src/core/dialogue.js";
import { Session } from "../src/render/session.js";
function wav() {
  const b = Buffer.alloc(60);
  b.write("RIFF");
  b.writeUInt32LE(52, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(16, 40);
  return b;
}
function project() {
  const p = demoProject();
  p.audio = {
    assets: [
      {
        id: "voice",
        name: "Ответ.wav",
        data: "data:audio/wav;base64," + wav().toString("base64"),
      },
    ],
    sounds: { attack: "voice", jump: "voice", questAccept: "voice" },
  };
  return p;
}
class Context {
  constructor() {
    this.state = "running";
    this.destination = {};
    this.sources = [];
    this.decodes = 0;
  }
  createGain() {
    return { gain: { value: 1 }, connect() {} };
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  decodeAudioData() {
    this.decodes++;
    return Promise.resolve({});
  }
  createBufferSource() {
    const source = {
      connect() {},
      disconnect() {},
      start() {
        this.started = true;
      },
      stop() {
        this.stopped = true;
      },
    };
    this.sources.push(source);
    return source;
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}
test("audio references and portable bytes validate; v13 projects migrate unchanged", () => {
  const p = project();
  assert.equal(audioBytes(p.audio.assets[0].data).byteLength, 60);
  assert.deepEqual(readProject(serializeProject(p)), p);
  const bad = structuredClone(p);
  bad.audio.assets = [];
  assert.throws(() => readProject(bad), /Звук/);
  assert.throws(() => audioBytes("https://example.com/audio.mp3"));
  assert.throws(() => audioBytes("data:audio/wav;base64,AAAA"), /Содержимое/);
  const old = demoProject();
  old.schemaVersion = 13;
  const next = readProject(old);
  assert.equal(next.schemaVersion, 25);
  assert.equal(next.audio, undefined);
  assert.equal(old.schemaVersion, 13);
});
test("runtime caches audio, replaces dialogue voice, respects volume and caps overlap", async () => {
  globalThis.AudioContext = Context;
  const a = new GameAudio(project());
  try {
    await a.play("voice", true);
    const first = a.context.sources[0];
    await a.play("voice", true);
    assert.equal(first.stopped, true);
    assert.equal(a.active.size, 1);
    assert.equal(a.context.decodes, 1);
    for (let i = 0; i < 15; i++) await a.event("attack");
    assert.equal(a.active.size, 8);
    a.setVolume(0);
    assert.equal(a.gain.gain.value, 0);
    assert.equal(await a.event("attack"), false);
    a.stopAll();
    assert.equal(a.active.size, 0);
    a.dispose();
    assert.equal(a.context.state, "closed");
  } finally {
    delete globalThis.AudioContext;
  }
});
test("late decoding never starts voice after pause, dialogue change or dispose", async () => {
  let resolve;
  globalThis.AudioContext = class extends Context {
    decodeAudioData() {
      return new Promise((r) => (resolve = r));
    }
  };
  try {
    const a = new GameAudio(project()),
      pending = a.play("voice", true);
    await Promise.resolve();
    a.stopAll();
    resolve({});
    assert.equal(await pending, false);
    assert.equal(a.active.size, 0);
    a.dispose();
    assert.equal(await a.play("voice"), false);
  } finally {
    delete globalThis.AudioContext;
  }
});
test("audio editor imports WAV, assigns action and commits only on Save", async () => {
  const dom = new JSDOM('<dialog id="modal"></dialog>');
  globalThis.document = dom.window.document;
  globalThis.FileReader = dom.window.FileReader;
  const dialog = document.querySelector("dialog");
  dialog.close = () => dialog.dispatchEvent(new dom.window.Event("close"));
  const element = (tag, text = "", className = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = className;
    return e;
  };
  let saved;
  const p = demoProject();
  try {
    audioEditor({
      project: p,
      element,
      modal: (_, box) => dialog.replaceChildren(box),
      commit: async (next) => {
        saved = next;
        return true;
      },
    });
    const file = document.querySelector("#audio-files");
    Object.defineProperty(file, "files", {
      value: [new dom.window.File([wav()], "test.wav")],
    });
    await file.onchange();
    const select = document.querySelector('[data-sound="jump"]');
    assert.equal(select.options.length, 2);
    select.value = select.options[1].value;
    select.onchange();
    assert.equal(p.audio, undefined);
    await document.querySelector("#audio-save").onclick();
    assert.ok(saved.audio.sounds.jump);
    assert.equal(saved.audio.assets.length, 1);
    assert.doesNotThrow(() => readProject(saved));
  } finally {
    dom.window.close();
    delete globalThis.FileReader;
  }
});
test("dialogue editor persists per-line voice and rejects deleting used audio", async () => {
  const dom = new JSDOM('<dialog id="modal"></dialog>');
  globalThis.document = dom.window.document;
  document.querySelector("dialog").close = () => {};
  const element = (tag, text = "", className = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = className;
    return e;
  };
  const p = project();
  let saved;
  try {
    dialogueEditor({
      project: p,
      entity: p.entities.find((e) => e.id === "warden"),
      element,
      modal: (_, box) => document.querySelector("dialog").append(box),
      commit: async (next) => {
        saved = next;
        return true;
      },
    });
    const select = document.querySelector("#dialogue-audio");
    select.value = "voice";
    select.onchange();
    await document.querySelector("#dialogue-save").onclick();
    assert.equal(
      new Conversation(new GameState(saved), "warden").screen().audioId,
      "voice",
    );
    saved.audio.sounds = {};
    saved.audio.assets = [];
    assert.throws(() => readProject(saved), /Звук/);
  } finally {
    dom.window.close();
  }
});
test("attack audio fires only for accepted swings; hit and death are separate events", () => {
  const s = Object.create(Session.prototype),
    events = [];
  Object.assign(s, {
    controlsActive: () => true,
    attackCooldown: 0,
    audio: { event: (e) => events.push(e) },
    weapon: { attack: () => false },
    entitiesById: new Map([
      ["enemy", { id: "enemy", kind: "enemy", name: "Enemy" }],
    ]),
    view: { target: () => "enemy" },
    game: { collected: () => false, hit: () => false },
    notify() {},
    sync() {},
  });
  s.attack();
  assert.deepEqual(events, []);
  s.weapon.attack = () => true;
  s.attack();
  s.strike();
  s.game.hit = () => true;
  s.strike();
  assert.deepEqual(events, ["attack", "hit", "enemyDeath"]);
});
