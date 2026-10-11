import * as THREE from 'three';
import * as TX from './textures.js';

// One shared material library. Texture "scale" (metres per repeat) is
// handled by the builder's world-space UVs, so maps repeat at 1 per unit;
// we set texture.repeat to 1/scale here.
export const MAT = {};
export const TEX = {};

function scaled(tex, metres) {
  if (!tex) return tex;
  tex.repeat.set(1 / metres, 1 / metres);
  tex.needsUpdate = true;
  return tex;
}

export function buildMaterials(quality) {
  const ash = TX.ashlarTextures();
  const ashDark = TX.ashlarTextures({ base: [206, 186, 150], seed: 19, rows: 5 });
  const floor = TX.floorTextures();
  const floorN = TX.floorTextures({ base: [214, 200, 176], seed: 8, slabs: 8 });
  const floorO = TX.floorTextures({ base: [222, 204, 170], seed: 13, slabs: 4 });
  const plaster = TX.plasterTextures();
  const marble = TX.marbleTextures();
  const gold = TX.goldTextures();
  const relief = TX.goldReliefTextures();
  const log = TX.woodTextures('log');
  const plank = TX.woodTextures('plank');
  const bronze = TX.bronzeTextures();
  const paroches = TX.parochesTexture();
  TEX.avnet = TX.avnetTexture();
  TEX.linen = TX.linenTexture();
  TEX.terrain = TX.terrainDetail();
  TEX.soft = TX.softSprite();
  TEX.smoke = TX.smokeSprite();

  const bumpScale = quality === 'low' ? 0 : 1;

  MAT.stone = new THREE.MeshStandardMaterial({
    map: scaled(ash.map, 6), bumpMap: scaled(ash.bump, 6), bumpScale: 2.2 * bumpScale,
    roughness: 0.88, metalness: 0, color: 0xffffff,
  });
  MAT.stoneWarm = new THREE.MeshStandardMaterial({
    map: scaled(ashDark.map, 5), bumpMap: scaled(ashDark.bump, 5), bumpScale: 2.2 * bumpScale,
    roughness: 0.9, color: 0xffffff,
  });
  MAT.stoneTrim = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.75, map: scaled(marble.map.clone(), 4) });
  MAT.floor = new THREE.MeshStandardMaterial({
    map: scaled(floor.map, 8), roughnessMap: scaled(floor.rough, 8), bumpMap: scaled(floor.bump, 8), bumpScale: 0.6 * bumpScale,
    roughness: 0.62, metalness: 0,
  });
  MAT.floorNorth = new THREE.MeshStandardMaterial({
    map: scaled(floorN.map, 8), roughnessMap: scaled(floorN.rough, 8), roughness: 0.7,
  });
  MAT.floorOuter = new THREE.MeshStandardMaterial({ map: scaled(floorO.map, 14), roughness: 0.85 });
  MAT.plaster = new THREE.MeshStandardMaterial({
    map: scaled(plaster.map, 3), bumpMap: scaled(plaster.bump, 3), bumpScale: 1.8 * bumpScale, roughness: 0.95,
  });
  MAT.marble = new THREE.MeshStandardMaterial({ map: scaled(marble.map, 10), roughness: 0.45, metalness: 0 });
  MAT.gold = new THREE.MeshStandardMaterial({
    color: 0xffc95c, metalness: 1, roughness: 0.28,
    roughnessMap: scaled(gold.rough, 2), bumpMap: scaled(gold.bump, 2), bumpScale: 0.25 * bumpScale,
  });
  MAT.goldBright = new THREE.MeshStandardMaterial({ color: 0xffd36e, metalness: 1, roughness: 0.18 });
  MAT.goldRelief = new THREE.MeshStandardMaterial({
    color: 0xf5bf55, metalness: 1, roughness: 0.32, map: scaled(relief.map, 6),
    bumpMap: scaled(relief.bump, 6), bumpScale: 3 * bumpScale,
  });
  MAT.silver = new THREE.MeshStandardMaterial({ color: 0xe8edf2, metalness: 1, roughness: 0.22 });
  MAT.bronze = new THREE.MeshStandardMaterial({
    color: 0xd08a4c, metalness: 1, roughness: 0.35, roughnessMap: scaled(bronze.rough, 3),
  });
  MAT.wood = new THREE.MeshStandardMaterial({ map: scaled(log.map, 1.5), roughness: 0.9 });
  MAT.cedar = new THREE.MeshStandardMaterial({ map: scaled(plank.map, 4), roughness: 0.8 });
  MAT.paroches = new THREE.MeshStandardMaterial({ map: paroches.map, roughness: 0.9, side: THREE.DoubleSide });
  MAT.redLine = new THREE.MeshStandardMaterial({ color: 0x9c1c1c, roughness: 0.8 });
  MAT.dark = new THREE.MeshStandardMaterial({ color: 0x1a140e, roughness: 1 });
  MAT.ash = new THREE.MeshStandardMaterial({ color: 0x5e5853, roughness: 1, emissive: 0x180700 });
  MAT.ember = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 1, emissive: 0xff5a10, emissiveIntensity: 1.2 });
  MAT.water = new THREE.MeshStandardMaterial({ color: 0x86b8d0, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.85 });
  MAT.blood = new THREE.MeshStandardMaterial({ color: 0x6e0a12, roughness: 0.35 });
  MAT.house = new THREE.MeshStandardMaterial({
    map: scaled(ash.map.clone(), 3), roughness: 0.92, color: 0xf0e6d4,
  });
  MAT.houseDark = new THREE.MeshStandardMaterial({ map: scaled(ashDark.map.clone(), 3), roughness: 0.95, color: 0xe2d2b8 });
  MAT.leaf = new THREE.MeshStandardMaterial({ color: 0x6f8350, roughness: 0.95 });
  MAT.oliveLeaf = new THREE.MeshStandardMaterial({ color: 0x8a9a74, roughness: 0.95 });
  MAT.cypress = new THREE.MeshStandardMaterial({ color: 0x3f5a35, roughness: 0.95 });
  MAT.trunk = new THREE.MeshStandardMaterial({ color: 0x6b5442, roughness: 1 });
  MAT.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, map: scaled(TEX.terrain, 30), roughness: 1 });
  MAT.white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  MAT.lattice = new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.9 });
  MAT.sign = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  return MAT;
}
