import * as THREE from 'three';

// Map is 60 wide (X: 0-60) × 80 deep (Z: 0-80)
// Player team at Z=0 end (bottom), Enemy team at Z=80 end (top)
// Center is (30, 0, 40)

export const PLAYER_SPAWN = new THREE.Vector3(30, 1.7, 8);

// 4 friendly bot spawns near player base
export const FRIENDLY_SPAWNS = [
  new THREE.Vector3(25, 1.7, 6),
  new THREE.Vector3(35, 1.7, 6),
  new THREE.Vector3(22, 1.7, 10),
  new THREE.Vector3(38, 1.7, 10),
];

// 5 enemy bot spawns near enemy base
export const ENEMY_SPAWNS = [
  new THREE.Vector3(30, 1.7, 72),
  new THREE.Vector3(25, 1.7, 74),
  new THREE.Vector3(35, 1.7, 74),
  new THREE.Vector3(22, 1.7, 70),
  new THREE.Vector3(38, 1.7, 70),
];

// Team bomb positions
export const TEAM_BOMB_POS  = new THREE.Vector3(30, 0, 6);
export const ENEMY_BOMB_POS = new THREE.Vector3(30, 0, 74);

// Code note hiding spots (enemy bots walk here during HIDE phase)
export const CODE_NOTE_SPOTS = [
  new THREE.Vector3(10, 0, 35),
  new THREE.Vector3(18, 0, 28),
  new THREE.Vector3(28, 0, 42),
  new THREE.Vector3(42, 0, 36),
  new THREE.Vector3(50, 0, 45),
  new THREE.Vector3(15, 0, 55),
  new THREE.Vector3(45, 0, 55),
  new THREE.Vector3(30, 0, 50),
];
