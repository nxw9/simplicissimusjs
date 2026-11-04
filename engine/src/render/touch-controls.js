export class TouchControls {
  constructor(session) {
    this.session = session;
    this.move = { x: 0, z: 0 };
    this.sprint = false;
    this.enabled = false;
    const root = document.createElement("div");
    root.className = "touch-controls";
    root.hidden = true;
    root.innerHTML =
      '<div class="touch-look" aria-label="Обзор: ведите пальцем справа"><span>Обзор</span></div><div class="touch-stick" aria-label="Джойстик движения"><i></i></div><div class="touch-actions"><button data-touch="attack">⚔ Удар</button><button data-touch="interact">E · Действие</button><button data-touch="jump">↑ Прыжок</button><button data-touch="sprint">Бег</button></div>';
    session.ui.append(root);
    this.root = root;
    const stick = root.querySelector(".touch-stick"),
      knob = stick.querySelector("i");
    const bindDrag = (node, start, move, end) => {
      let id = null;
      node.onpointerdown = (e) => {
        if (id !== null || !session.controlsActive()) return;
        e.preventDefault();
        id = e.pointerId;
        node.setPointerCapture?.(id);
        start(e);
      };
      node.onpointermove = (e) => {
        if (e.pointerId === id) {
          e.preventDefault();
          move(e);
        }
      };
      const release = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        end();
      };
      node.onpointerup = release;
      node.onpointercancel = release;
      node.onlostpointercapture = release;
      return () => {
        id = null;
        end();
      };
    };
    const stickMove = (e) => {
      const r = stick.getBoundingClientRect(),
        x = (e.clientX - r.left - r.width / 2) / (r.width * 0.35),
        z = (e.clientY - r.top - r.height / 2) / (r.height * 0.35),
        n = Math.max(1, Math.hypot(x, z));
      this.move = { x: x / n, z: z / n };
      knob.style.transform = `translate(${this.move.x * 35}px,${this.move.z * 35}px)`;
    };
    this.resetStick = bindDrag(stick, stickMove, stickMove, () => {
      this.move = { x: 0, z: 0 };
      knob.style.transform = "";
    });
    let last;
    this.resetLook = bindDrag(
      root.querySelector(".touch-look"),
      (e) => {
        last = [e.clientX, e.clientY];
      },
      (e) => {
        if (!session.controlsActive()) return;
        const scale = session.settings?.touchSensitivity ?? 1;
        session.look.apply(
          (e.clientX - last[0]) * scale,
          (e.clientY - last[1]) * scale * (session.settings?.invertY ? -1 : 1),
          e.timeStamp,
        );
        session.yaw = session.look.yaw;
        session.pitch = session.look.pitch;
        last = [e.clientX, e.clientY];
      },
      () => {
        last = null;
      },
    );
    for (const button of root.querySelectorAll("button")) {
      button.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!session.controlsActive()) return;
        button.setPointerCapture?.(e.pointerId);
        const action = button.dataset.touch;
        if (action === "attack") session.attack();
        if (action === "interact") session.interact();
        if (action === "jump") session.jumpRequested = true;
        if (action === "sprint") this.sprint = true;
      };
      const release = () => {
        if (button.dataset.touch === "sprint") this.sprint = false;
      };
      button.onpointerup = release;
      button.onpointercancel = release;
      button.onlostpointercapture = release;
    }
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    this.root.hidden = !enabled;
    this.reset();
  }
  reset() {
    this.resetStick?.();
    this.resetLook?.();
    this.sprint = false;
  }
  dispose() {
    this.reset();
    this.root.remove();
  }
}
