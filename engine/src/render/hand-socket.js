import * as T from "three";
const tokens=name=>name.replace(/([a-z])([A-Z])/g,"$1 $2").toLowerCase().split(/[^a-zа-яё0-9]+/).filter(Boolean);
const compact=name=>tokens(name).join("");
const finger=/thumb|index|middle|ring|pinky|little|finger|палец|пальц/;
function sideOf(name) {
  const t=tokens(name),s=t.join("");
  if(/right|прав/.test(s)||t.includes("r")||/(?:hand|wrist|arm)\d*r\d*$|^r(?:hand|wrist)/.test(s))return "right";
  if(/left|лев/.test(s)||t.includes("l")||/(?:hand|wrist|arm)\d*l\d*$|^l(?:hand|wrist)/.test(s))return "left";
  return null;
}
function sideInTree(n) {
  for(let i=0;n&&i<4;i++,n=n.parent){const side=sideOf(n.name);if(side)return side;}
  return null;
}
/** Prefer skin joints over fingers, IK targets, meshes and opposite hands. */
export function findHandSocket(model,hand="right",explicit="") {
  const nodes=[],bones=new Set();
  model.traverse(n=>{if(!n.userData.heldWeaponPart)nodes.push(n);if(n.isSkinnedMesh)for(const b of n.skeleton.bones)bones.add(b);});
  if(explicit){const node=nodes.find(n=>n.name===explicit);if(node)return {node,method:"manual",warning:""};}
  const candidates=[];
  for(const n of nodes) {
    const s=compact(n.name),t=tokens(n.name);
    if(finger.test(s)||/end(?:site)?\d*$/.test(s)||sideInTree(n)!==hand)continue;
    let score=/hand|wrist|кисть|ладонь/.test(s)?100:/^arm[rl]$/.test(s)?15:0;
    if(!score)continue;
    if(bones.has(n))score+=35;else if(n.isBone)score+=25;
    if(n.isMesh)score-=100;
    if(t.some(x=>["ik","target","ctrl","control","helper","pole","twist"].includes(x))||/^(?:ik|ctrl)|(?:ik|ctrl|target|helper)$/.test(s))score-=200;
    if(/weapon|socket|attach|grip/.test(s))score-=35;
    if(n.children.some(c=>finger.test(compact(c.name))))score+=20;
    candidates.push({node:n,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  let node=candidates.find(c=>c.score>0)?.node;
  if(!node)node=nodes.find(n=>!n.isMesh&&n.children.filter(c=>finger.test(compact(c.name))&&sideInTree(c)===hand).length>=3);
  return {node,method:node?(/^Arm[RL]$/.test(node.name)?"arm":"auto"):"fallback",
    warning:explicit?`Узел «${explicit}» не найден; используется ${node?.name??"корень модели"}.`:node?"":"Кисть не распознана. Выберите кость вручную; сейчас оружие закреплено на корне модели."};
}
/** Captured once in bind pose, independent of later finger/attack animation. */
export function handFrame(node) {
  const position=new T.Vector3(),quaternion=new T.Quaternion();
  if(/^Arm[RL]$/.test(node.name))return {position:new T.Vector3(0,-.56,.04),quaternion,aligned:false};
  const fingers=node.children.filter(n=>finger.test(compact(n.name))&&!/thumb/.test(compact(n.name)));
  if(!fingers.length)return {position,quaternion,aligned:false};
  for(const f of fingers)position.add(f.position);
  position.multiplyScalar(.65/fingers.length);
  const index=fingers.find(n=>/index/.test(compact(n.name))),pinky=fingers.find(n=>/pinky|little/.test(compact(n.name)));
  if(!index||!pinky||position.lengthSq()<1e-10)return {position,quaternion,aligned:false};
  const x=position.clone().normalize(),y=index.position.clone().sub(pinky.position);y.addScaledVector(x,-y.dot(x));
  if(y.lengthSq()<1e-10)return {position,quaternion,aligned:false};
  y.normalize();const z=new T.Vector3().crossVectors(x,y).normalize();
  quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
  return {position,quaternion,aligned:true};
}
