// Preserve normal deltas; verify isolated spikes before they reach the camera.
export class MouseLook {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0;
    this.active = false;
    this.skipFirst = true;
    this.history = [];
    this.pending = null;
    this.events = new Array(2048);
    this.eventCount = 0;
  }
  log(dx, dy, time, result) {
    this.events[this.eventCount++ % this.events.length] = {
      dx,
      dy,
      time,
      result,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }
  report() {
    const size = Math.min(this.eventCount, this.events.length),
      start = Math.max(0, this.eventCount - size);
    return {
      version: 1,
      events: Array.from(
        { length: size },
        (_, i) => this.events[(start + i) % this.events.length],
      ),
    };
  }
  setActive(active) {
    if (active !== this.active) {
      this.skipFirst = true;
      this.pending = null;
      this.history = [];
    }
    this.active = active;
  }
  apply(dx, dy, time) {
    this.yaw =
      ((((this.yaw - dx * 0.002 + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2)) -
      Math.PI;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.002));
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.updateMatrixWorld(true);
    this.history.push(Math.hypot(dx, dy));
    if (this.history.length > 12) this.history.shift();
    this.log(dx, dy, time, "applied");
  }
  move(dx, dy, time = performance.now()) {
    if (!this.active) return false;
    if (
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      !Number.isFinite(time)
    ) {
      this.log(dx, dy, time, "invalid");
      return false;
    }
    if (this.skipFirst) {
      this.skipFirst = false;
      this.log(dx, dy, time, "capture-transition");
      return false;
    }
    if (Math.abs(dx) > 4096 || Math.abs(dy) > 4096) {
      this.log(dx, dy, time, "invalid-warp");
      return false;
    }
    const length = Math.hypot(dx, dy);
    if (length === 0) return false;
    const sorted = [...this.history].sort((a, b) => a - b),
      median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const suspicious =
      this.history.length >= 5 && length > Math.max(64, median * 6);
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      const ratio = length / p.length,
        alignment = (p.dx * dx + p.dy * dy) / (p.length * length);
      if (
        time - p.time >= 0 &&
        time - p.time <= 40 &&
        ratio >= 0.35 &&
        ratio <= 3 &&
        alignment > 0.7
      ) {
        this.apply(p.dx, p.dy, p.time);
        this.apply(dx, dy, time);
        return true;
      }
      this.log(p.dx, p.dy, p.time, "rejected-spike");
    }
    if (suspicious) {
      this.pending = { dx, dy, time, length };
      this.log(dx, dy, time, "pending-spike");
      return false;
    }
    this.apply(dx, dy, time);
    return true;
  }
}
export async function requestMouseLock(canvas) {
  try {
    await canvas.requestPointerLock({ unadjustedMovement: true });
    return "raw-requested";
  } catch (error) {
    if (error?.name !== "NotSupportedError") throw error;
    await canvas.requestPointerLock();
    return "normal-fallback";
  }
}
