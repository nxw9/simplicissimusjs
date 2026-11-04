import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Vector3, TOUCH } from "three";
import { installMobileEditor } from "../src/editor/mobile.js";
import { SceneTools } from "../src/editor/tools.js";

test("mobile panels and camera preserve placement, clamp zoom and switch back to editing", () => {
  const dom = new JSDOM('<div id="app"></div><button id="home"></button>');
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  const media = {matches:true, addEventListener(_, fn){this.change=fn;}};
  dom.window.matchMedia = () => media;
  let attached=0, modes=0;
  const tools={pending:{id:"tree"}, cb:{modeChanged(){modes++;}}, attach(){attached++;}, cancel(){throw Error("Idle placement must not be cancelled");}};
  const view={camera:{position:new Vector3(0,10,10)},orbit:{target:new Vector3(),update(){}},invalidate(){}};
  try {
    installMobileEditor(view,tools);
    assert.equal(tools.touchNavigation,true);
    document.querySelector('[data-camera="pan"]').click();
    assert.equal(view.orbit.touches.ONE,TOUCH.PAN);
    document.querySelector('[data-panel="properties"]').click();
    assert.equal(document.body.dataset.mobilePanel,"properties");
    tools.cb.modeChanged("place");
    assert.equal(tools.touchNavigation,false);
    assert.equal(tools.pending.id,"tree");
    assert.equal(document.body.dataset.mobilePanel,"map");
    assert.equal(modes,1);
    for(let i=0;i<60;i++) document.querySelector('[data-zoom="0.8"]').click();
    assert.ok(view.camera.position.length()>=1.999);
    media.matches=false;media.change();
    assert.equal(document.body.classList.contains("mobile-studio"),false);
    assert.equal(tools.touchNavigation,false);
    assert.ok(attached>0);
  } finally {globalThis.window=oldWindow;globalThis.document=oldDocument;dom.window.close();}
});
test("camera touches never enter scene editing and secondary touches cannot commit edits", async () => {
  const context={touchNavigation:true};
  SceneTools.prototype.pointerDown.call(context,{pointerType:"touch"});
  SceneTools.prototype.pointerMove.call(context,{pointerType:"touch"});
  await SceneTools.prototype.pointerUp.call(context,{pointerType:"touch"});
  context.touchNavigation=false;
  let consumed=false;context.consume=()=>consumed=true;
  SceneTools.prototype.pointerDown.call(context,{pointerType:"touch",isPrimary:false});
  await SceneTools.prototype.pointerUp.call(context,{pointerType:"touch",isPrimary:false});
  assert.equal(consumed,true);
});
