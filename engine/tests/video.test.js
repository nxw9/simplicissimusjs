import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { demoProject } from "../src/core/demo.js";
import { readProject, serializeProject } from "../src/core/project.js";
import { validateVideo } from "../src/core/video.js";
import { videoEditor } from "../src/editor/video-editor.js";
import { Cutscene } from "../src/render/cutscene.js";
import { Session } from "../src/render/session.js";
import { GameState } from "../src/core/game.js";
import { Conversation, defaultDialogue } from "../src/core/dialogue.js";
function asset() {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(24, 0);
  bytes.write("ftypisom", 4);
  return {
    id: "intro",
    name: "intro.mp4",
    data: "data:video/mp4;base64," + bytes.toString("base64"),
  };
}
function setup() {
  const dom = new JSDOM('<dialog id="modal"></dialog><div id="host"></div>');
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const media = dom.window.HTMLMediaElement.prototype;
  media.play = function () {
    this.playedTest = true;
    return Promise.resolve();
  };
  media.pause = function () {
    this.pausedTest = true;
  };
  media.load = function () {};
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.dispatchEvent(new dom.window.Event("close"));
  };
  return dom;
}
function session() {
  return {
    project: demoProject(),
    host: document.querySelector("#host"),
    paused: false,
    view: { gamePaused: false, invalidate() {} },
    keys: new Set(["KeyW"]),
    touch: { reset() {} },
    audio: { stopAll() {} },
    settings: { volume: 0.3 },
  };
}
test("videos embed and roundtrip, validate refs and migrate old projects", () => {
  const p = demoProject();
  p.videos = [asset()];
  const npc = p.entities.find((e) => e.id === "warden");
  npc.dialogueTree = defaultDialogue(npc, p);
  npc.dialogueTree.nodes[0].videoId = "intro";
  assert.deepEqual(readProject(serializeProject(p)), p);
  validateVideo(asset().data);
  assert.throws(() => validateVideo("https://example.com/video.mp4"));
  assert.throws(() => validateVideo("data:video/mp4;base64,AAAA"));
  p.videos = [];
  assert.throws(() => readProject(p), /Видео/);
  const old = demoProject();
  old.schemaVersion = 14;
  assert.equal(readProject(old).schemaVersion, 25);
  assert.equal(old.schemaVersion, 14);
});
test("cutscene pauses world, finishes once, restores state and cleans video", () => {
  const dom = setup();
  try {
    const s = session(),
      c = new Cutscene(s);
    let done = 0;
    c.play(asset(), () => done++);
    assert.equal(s.paused, true);
    assert.equal(s.view.gamePaused, true);
    assert.equal(s.keys.size, 0);
    assert.equal(c.video.volume, 0.3);
    assert.equal(c.video.playsInline, true);
    const video = c.video;
    video.onended();
    c.finish();
    assert.equal(done, 1);
    assert.equal(s.paused, false);
    assert.equal(s.view.gamePaused, false);
    assert.equal(video.hasAttribute("src"), false);
    assert.equal(document.querySelector(".cutscene"), null);
  } finally {
    dom.window.close();
  }
});
test("skip and playback error permit continuation; dispose cancels callback", async () => {
  const dom = setup();
  try {
    const s = session(),
      c = new Cutscene(s);
    let done = 0;
    c.play(asset(), () => done++);
    c.video.onerror();
    assert.match(c.root.textContent, /повреждено/);
    document.querySelector("#cutscene-skip").click();
    assert.equal(done, 1);
    c.play(asset(), () => done++);
    window.dispatchEvent(new window.Event("blur"));
    assert.equal(c.video.pausedTest, true);
    assert.equal(s.paused, true);
    document.dispatchEvent(
      new window.KeyboardEvent("keydown", { code: "Escape", bubbles: true }),
    );
    assert.equal(done, 2);
    assert.equal(s.paused, false);
    c.play(asset(), () => done++);
    c.dispose();
    c.finish();
    assert.equal(done, 2);
    assert.equal(document.querySelector(".cutscene"), null);
  } finally {
    dom.window.close();
  }
});
test("video editor imports local MP4 into draft and commits only on Save", async () => {
  const dom = setup();
  globalThis.FileReader = dom.window.FileReader;
  const element = (tag, text = "", className = "") => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.className = className;
    return e;
  };
  let saved;
  const p = demoProject();
  try {
    videoEditor({
      project: p,
      element,
      modal: (_, box) => document.querySelector("dialog").append(box),
      commit: async (next) => {
        saved = next;
        return true;
      },
    });
    const input = document.querySelector("#video-files");
    Object.defineProperty(input, "files", {
      value: [
        new window.File(
          [Buffer.from(asset().data.split(",")[1], "base64")],
          "movie.mp4",
        ),
      ],
    });
    await input.onchange();
    assert.equal(p.videos, undefined);
    await document.querySelector("#video-save").onclick();
    assert.equal(saved.videos.length, 1);
    assert.equal(saved.videos[0].name, "movie.mp4");
    assert.doesNotThrow(() => readProject(saved));
  } finally {
    dom.window.close();
    delete globalThis.FileReader;
  }
});
test("session shows video before voice/text and does not replay it when it ends", () => {
  const dom = setup();
  try {
    const p = demoProject();
    p.videos = [asset()];
    const npc = p.entities.find((e) => e.id === "warden");
    npc.dialogueTree = defaultDialogue(npc, p);
    npc.dialogueTree.nodes[0].videoId = "intro";
    const s = Object.assign(Object.create(Session.prototype), session(), {
      project: p,
      game: new GameState(p),
      dialogOpen: true,
      talkingNPC: "warden",
      lock() {},
      notify() {},
    });
    s.ui = document.createElement("div");
    s.ui.innerHTML =
      '<div class="dialogue"><h3></h3><p></p><div class="dialogue-choices"></div><button class="dialogue-close"></button></div>';
    s.host.append(s.ui);
    s.audio = {
      stopAll() {},
      play() {
        s.voiceStarted = true;
      },
    };
    s.cutscene = new Cutscene(s);
    s.conversation = new Conversation(s.game, "warden");
    s.showDialogue();
    assert.equal(s.cutscene.active, true);
    assert.equal(s.voiceStarted, undefined);
    s.cutscene.video.onended();
    assert.equal(s.cutscene.active, false);
    assert.equal(s.voiceStarted, true);
    assert.equal(s.ui.querySelector(".dialogue").hidden, false);
    assert.equal(s.paused, false);
  } finally {
    dom.window.close();
  }
});
