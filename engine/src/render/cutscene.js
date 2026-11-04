export class Cutscene {
  constructor(session) {
    this.session = session;
  }
  play(asset, done) {
    if (this.active) this.dispose();
    const s = this.session;
    this.active = true;
    this.done = done;
    this.wasPaused = s.paused;
    s.paused = true;
    s.view.gamePaused = true;
    s.keys.clear();
    s.touch?.reset();
    s.weapon?.cancel();
    s.audio?.stopAll();
    document.exitPointerLock?.();
    const root = document.createElement("div");
    root.className = "cutscene";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Катсцена");
    root.setAttribute("aria-modal", "true");
    this.root = root;
    const video = document.createElement("video");
    this.video = video;
    video.controls = true;
    video.playsInline = true;
    video.preload = "auto";
    video.volume = s.settings?.volume ?? 0.8;
    video.src = asset.data;
    const message = document.createElement("p");
    message.setAttribute("role", "status");
    message.textContent = asset.name;
    const resume = document.createElement("button");
    resume.textContent = "▶ Воспроизвести / продолжить";
    resume.onclick = () =>
      video
        .play()
        .catch(
          () =>
            (message.textContent =
              "Браузер не воспроизводит этот ролик. Можно пропустить катсцену."),
        );
    const skip = document.createElement("button");
    skip.textContent = "Пропустить →";
    skip.id = "cutscene-skip";
    skip.onclick = () => this.finish();
    root.append(video, message, resume, skip);
    s.host.append(root);
    skip.focus();
    video.onended = () => this.finish();
    video.onerror = () => {
      message.textContent =
        "Видео не поддерживается или повреждено. Нажмите «Пропустить», чтобы продолжить.";
    };
    this.onKey = (e) => {
      if (e.code === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.finish();
      } else if (e.code === "Tab") {
        const focusable = [video, resume, skip],
          index = focusable.indexOf(document.activeElement);
        e.preventDefault();
        e.stopImmediatePropagation();
        focusable[
          (index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length
        ].focus();
      } else e.stopPropagation();
    };
    this.onBlur = () => {
      video.pause();
      message.textContent = "Просмотр приостановлен. Нажмите «Продолжить».";
    };
    this.onVisibility = () => {
      if (document.hidden) this.onBlur();
    };
    document.addEventListener("keydown", this.onKey, true);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    video.play().catch(() => {
      if (this.active)
        message.textContent = "Нажмите «Воспроизвести», чтобы начать катсцену.";
    });
  }
  finish() {
    if (!this.active) return;
    const done = this.done,
      paused = this.wasPaused;
    this.dispose();
    this.session.paused = paused;
    this.session.view.gamePaused = paused;
    this.session.view.invalidate?.();
    done?.();
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    this.session.paused = this.wasPaused;
    this.session.view.gamePaused = this.wasPaused;
    this.done = null;
    this.video.onended = null;
    this.video.onerror = null;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    this.root.remove();
    document.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
