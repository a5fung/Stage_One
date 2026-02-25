import * as THREE from 'three';

// Stage 2 map is 80×80 — teams at south (Z=0) and north (Z=80)
// Ice cream sandwich obstacles at X≈15 and X≈65, spanning Z=25–55
// Ice cream scoops at mid zone

export const S2_ENEMY_PATROL = [
  new THREE.Vector3(40, 0, 70),
  new THREE.Vector3(25, 0, 60),
  new THREE.Vector3(15, 0, 50),
  new THREE.Vector3(25, 0, 40),
  new THREE.Vector3(40, 0, 40),
  new THREE.Vector3(55, 0, 40),
  new THREE.Vector3(65, 0, 50),
  new THREE.Vector3(55, 0, 60),
  new THREE.Vector3(40, 0, 55),
];

export const S2_FRIENDLY_PATROL_ROUTES = [
  // Left flank — around left ice cream sandwich
  [ new THREE.Vector3(15, 0, 20), new THREE.Vector3(10, 0, 40), new THREE.Vector3(20, 0, 58) ],
  // Centre push
  [ new THREE.Vector3(40, 0, 22), new THREE.Vector3(40, 0, 45), new THREE.Vector3(40, 0, 62) ],
  // Right flank — around right ice cream sandwich
  [ new THREE.Vector3(65, 0, 20), new THREE.Vector3(70, 0, 40), new THREE.Vector3(60, 0, 58) ],
  // Mid roam between scoops
  [ new THREE.Vector3(28, 0, 30), new THREE.Vector3(52, 0, 30), new THREE.Vector3(52, 0, 50), new THREE.Vector3(28, 0, 50) ],
];

// Where friendly bot hides the player's code — tricky spots across the map
export const S2_FRIENDLY_HIDE_SPOTS = [
  // Between ice cream scoops
  new THREE.Vector3(28, 0, 38),
  new THREE.Vector3(52, 0, 38),
  new THREE.Vector3(40, 0, 42),
  // Behind left sandwich
  new THREE.Vector3(8,  0, 38),
  new THREE.Vector3(8,  0, 42),
  // Behind right sandwich
  new THREE.Vector3(72, 0, 38),
  new THREE.Vector3(72, 0, 42),
  // Enemy side
  new THREE.Vector3(28, 0, 58),
  new THREE.Vector3(52, 0, 58),
  new THREE.Vector3(40, 0, 65),
  new THREE.Vector3(20, 0, 50),
  new THREE.Vector3(60, 0, 50),
];

// Where enemy bot hides enemy code
export const S2_ENEMY_HIDE_SPOTS = [
  new THREE.Vector3(28, 0, 55),
  new THREE.Vector3(52, 0, 55),
  new THREE.Vector3(40, 0, 60),
  new THREE.Vector3(15, 0, 55),
  new THREE.Vector3(65, 0, 55),
  new THREE.Vector3(8,  0, 52),
  new THREE.Vector3(72, 0, 52),
  new THREE.Vector3(30, 0, 68),
  new THREE.Vector3(50, 0, 68),
];
