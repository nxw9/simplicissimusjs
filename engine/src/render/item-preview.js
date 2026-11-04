import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
export function previewObject(source) {
  const object = clone(source);
  object.visible = true;
  object.position.set(0, 0, 0);
  object.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(object);
  const size = box.getSize(new T.Vector3()).length();
  if (!Number.isFinite(size) || size < 1e-8)
    throw Error("У предмета нет видимой геометрии");
  object.position.sub(box.getCenter(new T.Vector3()));
  const pivot = new T.Group();
  pivot.add(object);
  pivot.scale.setScalar(2.5 / size);
  return pivot;
}
export class ItemPreview {
  constructor(host, source) {
    this.pivot = previewObject(source);
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    host.append(this.renderer.domElement);
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(40, 1, 0.01, 100);
    this.camera.position.set(0, 0, 4);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x586071, 3));
    const light = new T.DirectionalLight(0xffffff, 3);
    light.position.set(3, 4, 5);
    this.scene.add(light);
    this.scene.add(this.pivot);
    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    let pointer = null,
      last;
    canvas.onpointerdown = (e) => {
      if (pointer !== null) return;
      pointer = e.pointerId;
      last = [e.clientX, e.clientY];
      canvas.setPointerCapture?.(pointer);
    };
    canvas.onpointermove = (e) => {
      if (e.pointerId !== pointer) return;
      this.rotate((e.clientX - last[0]) * 0.012, (e.clientY - last[1]) * 0.012);
      last = [e.clientX, e.clientY];
    };
    canvas.onpointerup =
      canvas.onpointercancel =
      canvas.onlostpointercapture =
        () => (pointer = null);
    canvas.onwheel = (e) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.001));
    };
    this.resize = () => {
      const width = Math.max(1, host.clientWidth),
        height = Math.max(1, host.clientHeight);
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.draw();
    };
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
  }
  draw() {
    this.renderer.render(this.scene, this.camera);
  }
  rotate(x, y) {
    this.pivot.rotation.y += x;
    this.pivot.rotation.x += y;
    this.draw();
  }
  zoom(factor) {
    this.camera.position.z = Math.max(
      2,
      Math.min(8, this.camera.position.z * factor),
    );
    this.draw();
  }
  dispose() {
    this.observer?.disconnect();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove(); /* Geometry/materials belong to the world. */
  }
}
