import { audioBytes } from "../core/audio.js";
export class GameAudio {
  constructor(project) {
    this.project = project;
    this.buffers = new Map();
    this.active = new Set();
    this.epoch = 0;
    this.voiceEpoch = 0;
    this.volume = 0.8;
  }
  unlock() {
    if (this.disposed || !this.project.audio?.assets.length) return;
    try {
      const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Context) return;
      if (!this.context) {
        this.context = new Context();
        this.gain = this.context.createGain();
        this.gain.connect(this.context.destination);
        this.setVolume(this.volume);
      }
      if (this.context.state === "suspended")
        return this.context.resume().catch(() => {});
    } catch {}
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.gain) this.gain.gain.value = this.volume;
  }
  event(name) {
    return this.play(this.project.audio?.sounds?.[name]);
  }
  async play(id, voice = false) {
    if (voice) this.stopVoice();
    const asset = this.project.audio?.assets.find((a) => a.id === id);
    if (!asset || this.disposed || this.volume === 0) return false;
    const resumed = this.unlock();
    if (!this.context) return false;
    const epoch = this.epoch,
      voiceEpoch = this.voiceEpoch;
    try {
      await resumed;
      if (
        this.disposed ||
        epoch !== this.epoch ||
        (voice && voiceEpoch !== this.voiceEpoch)
      )
        return false;
      if (!this.buffers.has(id))
        this.buffers.set(
          id,
          this.context.decodeAudioData(audioBytes(asset.data)),
        );
      const buffer = await this.buffers.get(id);
      if (
        this.disposed ||
        epoch !== this.epoch ||
        (voice && voiceEpoch !== this.voiceEpoch) ||
        this.context.state !== "running"
      )
        return false;
      if (this.active.size >= 8) this.stop(this.active.values().next().value);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain);
      source.isVoice = voice;
      source.onended = () => {
        this.active.delete(source);
        source.disconnect();
      };
      this.active.add(source);
      source.start();
      return true;
    } catch {
      return false;
    }
  }
  stop(source) {
    this.active.delete(source);
    try {
      source.stop();
      source.disconnect();
    } catch {}
  }
  stopVoice() {
    this.voiceEpoch++;
    for (const source of this.active) if (source.isVoice) this.stop(source);
  }
  stopAll() {
    this.epoch++;
    this.stopVoice();
    for (const source of this.active) this.stop(source);
  }
  dispose() {
    this.disposed = true;
    this.stopAll();
    this.buffers.clear();
    this.context?.close().catch(() => {});
  }
}
