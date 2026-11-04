export const DAY_NIGHT_DEFAULTS = Object.freeze({
  enabled: true,
  dayMinutes: 20,
  startHour: 9,
});
export function advanceTime(hour, dt, config) {
  if (!config?.enabled || !Number.isFinite(dt) || dt <= 0) return hour;
  return (hour + (dt * 24) / (config.dayMinutes * 60)) % 24;
}
export function timeLabel(hour) {
  const minutes = Math.floor((((hour % 24) + 24) % 24) * 60 + 1e-6) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function skyState(hour) {
  const angle = ((hour - 6) / 24) * Math.PI * 2;
  const elevation = Math.sin(angle),
    daylight = smooth(-0.15, 0.25, elevation);
  return {
    direction: [Math.cos(angle), elevation, 0.25 * Math.cos(angle)],
    elevation,
    daylight,
    sun: 3.2 * smooth(-0.025, 0.2, elevation),
    moon: 0.22 * (1 - smooth(-0.2, 0.05, elevation)),
    ambient: 0.16 + 2.44 * daylight,
    dusk: 1 - smooth(0, 0.35, Math.abs(elevation)),
    stars: 1 - smooth(-0.3, -0.08, elevation),
  };
}
