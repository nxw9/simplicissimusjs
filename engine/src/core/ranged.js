import { z } from "zod";
const vec = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const RangedSchema = z.object({
  assetId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).nullable(),
  range: z.number().min(3).max(100), preferredDistance: z.number().min(1).max(100),
  speed: z.number().min(2).max(120), gravity: z.number().min(0).max(40),
  radius: z.number().min(0.02).max(1), length: z.number().min(0.05).max(6), rotation: vec,
  muzzle: vec.refine(v => v.every(n => Math.abs(n) <= 15)),
}).strict().refine(c => c.preferredDistance <= c.range, "Дистанция удержания должна быть не больше дальности выстрела.");
export const defaultRanged = () => ({assetId: null, range: 25, preferredDistance: 14,
  speed: 20, gravity: 0, radius: 0.09, length: 0.7, rotation: [0, 0, 0], muzzle: [0.25, 1.25, 0.5]});
