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

// Patrol waypoints for friendly bots
export const FRIENDLY_PATROL = [
  new THREE.Vector3(30, 1.7, 12),
  new THREE.Vector3(20, 1.7, 20),
  new THREE.Vector3(10, 1.7, 30),
  new THREE.Vector3(15, 1.7, 40),
  new THREE.Vector3(30, 1.7, 38),
  new THREE.Vector3(45, 1.7, 40),
  new THREE.Vector3(50, 1.7, 30),
  new THREE.Vector3(40, 1.7, 20),
  new THREE.Vector3(30, 1.7, 25),
];

// Code note hiding spots — kept in the mid zone, reachable from both sides.
// Biased toward the player's half (lower Z) so they're easier to find.
export const CODE_HIDE_SPOTS = [
  new THREE.Vector3(12, 0, 28),
  new THREE.Vector3(22, 0, 25),
  new THREE.Vector3(30, 0, 32),
  new THREE.Vector3(38, 0, 27),
  new THREE.Vector3(48, 0, 30),
  new THREE.Vector3(15, 0, 38),
  new THREE.Vector3(45, 0, 38),
  new THREE.Vector3(30, 0, 42),
];
