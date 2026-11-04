// Display settings only; collisions, AI and persistent game data do not change.
export const QUALITY_OPTIONS=[['minimum','Минимальное · максимум скорости'],['low','Низкое · без травы и эффектов'],['fast','Быстрое · без теней'],['balanced','Сбалансированное'],['high','Высокое']];
export const QUALITY_PROFILES={
 minimum:{pixelRatio:.5,maxPixels:480000,shadowSize:0,shadowInterval:Infinity,grass:0,grassDistance:0,treeNear:0,treeMid:0,viewDistance:160,terrainNear:28,terrainMid:50,terrainFar:85,detail:0,clouds:0,wind:0},
 low:{pixelRatio:.7,maxPixels:800000,shadowSize:0,shadowInterval:Infinity,grass:0,grassDistance:0,treeNear:0,treeMid:45,viewDistance:230,terrainNear:34,terrainMid:60,terrainFar:105,detail:1,clouds:0,wind:0},
 fast:{pixelRatio:.9,maxPixels:1200000,shadowSize:0,shadowInterval:Infinity,grass:.12,grassDistance:18,treeNear:15,treeMid:65,viewDistance:340,terrainNear:42,terrainMid:80,terrainFar:145,detail:1,clouds:1,wind:.3},
 balanced:{pixelRatio:1,maxPixels:1900000,shadowSize:1024,shadowInterval:1/6,grass:.35,grassDistance:32,treeNear:30,treeMid:90,viewDistance:540,terrainNear:50,terrainMid:100,terrainFar:180,detail:2,clouds:2,wind:.6},
 high:{pixelRatio:1.25,maxPixels:2700000,shadowSize:2048,shadowInterval:1/10,grass:.65,grassDistance:50,treeNear:45,treeMid:140,viewDistance:900,terrainNear:65,terrainMid:130,terrainFar:240,detail:2,clouds:3,wind:1}
};
export function qualityProfile(value){return QUALITY_PROFILES[value]??QUALITY_PROFILES.balanced;}
export function qualityPixelRatio(value,width,height,deviceRatio=1){const p=qualityProfile(value);return Math.min(Math.max(.1,deviceRatio),p.pixelRatio,Math.sqrt(p.maxPixels/Math.max(1,width*height)));}
