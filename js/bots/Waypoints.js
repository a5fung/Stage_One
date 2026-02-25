import * as THREE from 'three';

// Patrol waypoints for enemy bots in MAIN phase
export const ENEMY_PATROL = [
  new THREE.Vector3(30, 1.7, 68),
  new THREE.Vector3(20, 1.7, 60),
  new THREE.Vector3(10, 1.7, 50),
  new THREE.Vector3(15, 1.7, 40),
  new THREE.Vector3(30, 1.7, 42),
  new THREE.Vector3(45, 1.7, 40),
  new THREE.Vector3(50, 1.7, 50),
  new THREE.Vector3(40, 1.7, 60),
  new THREE.Vector3(30, 1.7, 55),
  new THREE.Vector3(18, 1.7, 50),
  new THREE.Vector3(42, 1.7, 50),
];

// Per-bot patrol routes so each friendly covers a different lane
export const FRIENDLY_PATROL_ROUTES = [
  // Bot 0 — left flank
  [ new THREE.Vector3(10, 1.7, 20), new THREE.Vector3(10, 1.7, 50), new THREE.Vector3(15, 1.7, 60) ],
  // Bot 1 — centre
  [ new THREE.Vector3(30, 1.7, 25), new THREE.Vector3(30, 1.7, 55), new THREE.Vector3(30, 1.7, 65) ],
  // Bot 2 — right flank
  [ new THREE.Vector3(50, 1.7, 20), new THREE.Vector3(50, 1.7, 50), new THREE.Vector3(45, 1.7, 60) ],
  // Bot 3 — mid roam
  [ new THREE.Vector3(20, 1.7, 40), new THREE.Vector3(40, 1.7, 40), new THREE.Vector3(30, 1.7, 58) ],
];

// Spots where the FRIENDLY bot hides the player's defuse code.
// Spread across the whole map — deep mid-zone and enemy territory for challenge.
export const FRIENDLY_HIDE_SPOTS = [
  // Far left / right edges
  new THREE.Vector3(7,  0, 30),
  new THREE.Vector3(53, 0, 30),
  new THREE.Vector3(7,  0, 48),
  new THREE.Vector3(53, 0, 48),
  // Behind central pillar (very hard to spot)
  new THREE.Vector3(27, 0, 37),
  new THREE.Vector3(33, 0, 43),
  new THREE.Vector3(28, 0, 43),
  new THREE.Vector3(32, 0, 37),
  // Behind mid-zone boxes
  new THREE.Vector3(12, 0, 30),
  new THREE.Vector3(48, 0, 30),
  new THREE.Vector3(20, 0, 40),
  new THREE.Vector3(40, 0, 40),
  // Enemy half — forces player to cross the map
  new THREE.Vector3(15, 0, 55),
  new THREE.Vector3(45, 0, 55),
  new THREE.Vector3(24, 0, 64),
  new THREE.Vector3(36, 0, 64),
  new THREE.Vector3(8,  0, 60),
  new THREE.Vector3(52, 0, 60),
  new THREE.Vector3(30, 0, 58),
  // Corridor interiors
  new THREE.Vector3(7,  0, 40),
  new THREE.Vector3(53, 0, 40),
];

// Spots where the ENEMY bot hides the enemy defuse code (enemy half of map)
export const ENEMY_HIDE_SPOTS = [
  new THREE.Vector3(12, 0, 55),
  new THREE.Vector3(48, 0, 55),
  new THREE.Vector3(22, 0, 62),
  new THREE.Vector3(38, 0, 62),
  new THREE.Vector3(7,  0, 52),
  new THREE.Vector3(53, 0, 52),
  new THREE.Vector3(30, 0, 60),
  new THREE.Vector3(15, 0, 70),
  new THREE.Vector3(45, 0, 70),
  new THREE.Vector3(27, 0, 45),
  new THREE.Vector3(33, 0, 45),
];

// Backward-compat alias
export const CODE_HIDE_SPOTS = ENEMY_HIDE_SPOTS;
