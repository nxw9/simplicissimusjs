import { z } from "zod";

const clip = z.string().min(1).max(160).nullable();
export const MountSchema = z.object({
  height: z.number().min(0.3).max(12),
  facing: z.number().finite(),
  seat: z.tuple([z.number().min(-5).max(5), z.number().min(0.1).max(12), z.number().min(-5).max(5)]),
  eyeHeight: z.number().min(0.2).max(2),
  speed: z.number().min(1).max(30),
  sprint: z.number().min(1).max(40),
  idle: clip,
  walk: clip,
  showWhileRiding: z.boolean(),
}).strict().refine(c => c.sprint >= c.speed, "Скорость бега маунта должна быть не ниже шага");

export const defaultMount = () => ({
  height: 2.15, facing: 0, seat: [0, 1.65, 0], eyeHeight: 0.85,
  speed: 8, sprint: 12, idle: null, walk: null, showWhileRiding: true,
});
// Existing projects keep their original mesh size and hidden first-person horse.
export const mountConfig = project => project.rpg?.mount ?? {...defaultMount(), showWhileRiding: false};
export function mountEyeOffset(config, yaw = 0) {
  const [x, y, z] = config.seat, c = Math.cos(yaw), s = Math.sin(yaw);
  return [x * c + z * s, y + config.eyeHeight, -x * s + z * c];
}
