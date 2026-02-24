import * as THREE from 'three';
import { gameState } from './GameState.js';
import { InputManager } from './InputManager.js';
import { MapBuilder } from './world/MapBuilder.js';
import { CollisionMap } from './world/CollisionMap.js';
import { Player } from './player/Player.js';
import { Gun } from './player/Gun.js';
import { BotManager } from './bots/BotManager.js';
import { ShootingSystem } from './systems/ShootingSystem.js';
import { CodeSystem } from './systems/CodeSystem.js';
import { BombSystem } from './systems/BombSystem.js';
import { HUD } from './systems/HUD.js';
import { HIDE_PHASE_DURATION } from './Constants.js';

// ========================
// RENDERER + SCENE SETUP
// ========================
const canvas = document.getElementById('gameCanvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false; // manual clear for two-camera technique

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);
scene.fog = new THREE.Fog(0xf0f0f0, 30, 75);

// Main camera
const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 100
);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
sunLight.position.set(20, 30, 20);
scene.add(sunLight);

// ========================
// SYSTEMS INSTANTIATION
// ========================
const input       = new InputManager();
const collMap     = new CollisionMap();
const mapBuilder  = new MapBuilder(scene, collMap);
const player      = new Player(scene, camera, input, collMap);
const gun         = new Gun(renderer);
const codeSystem  = new CodeSystem(scene);
const bombSystem  = new BombSystem(scene, codeSystem);
const botManager  = new BotManager(scene, collMap);
const shootSystem = new ShootingSystem(camera, scene);
const hud         = new HUD();

// Wire gun to player
player._gun = gun;

// Wire bomb refs
bombSystem.setRefs(player, player.controls);

// ========================
// BUILD WORLD
// ========================
mapBuilder.build();

// ========================
// GAME STATE TRANSITIONS
// ========================

let hideTimer = 0;

function startGame() {
  // Reset everything
  player.reset();
  gun.reset();
  botManager.reset();
  codeSystem.reset();
  bombSystem.reset();
  hud.resetTimerDisplay();
  window._endReason = null;

  // Spawn bots
  botManager.spawnAll();

  // Transition to HIDE phase
  gameState.transition('HIDE');
  hideTimer = HIDE_PHASE_DURATION;

  hud.showGame();
  hud.showBanner('HIDE PHASE', 3000);

  // Start hide code mission for enemy bots
  botManager.startHidePhase((pos, code) => {
    codeSystem.placeNote(pos, code);
  });
}

function startMainPhase() {
  gameState.transition('MAIN');
  bombSystem.start();

  hud.showBanner('ROUND START', 3000);
  hud.hidePhaseTimer();

  botManager.startMainPhase(() => {
    bombSystem.triggerTeamBombDefused();
  });
}

gameState.on('END', (prev) => {
  const reason = window._endReason || 'LOSE_DEAD';
  hud.showEnd(reason);
});

// ========================
// MENU BUTTON
// ========================
document.getElementById('startBtn').addEventListener('click', () => {
  startGame();
  // On desktop, request pointer lock
  if (!player.input._isMobile) {
    player.requestLock();
  }
});

document.getElementById('playAgainBtn').addEventListener('click', () => {
  document.getElementById('endScreen').classList.add('hidden');
  startGame();
  if (!player.input._isMobile) {
    player.requestLock();
  }
});

// Click on canvas to lock pointer (desktop)
canvas.addEventListener('click', () => {
  if (gameState.is('MAIN') || gameState.is('HIDE')) {
    if (!player.input._isMobile && !player.isInCodePanel) {
      player.requestLock();
    }
  }
});

// ========================
// GAME LOOP
// ========================
let prevTime = performance.now();
let gameTime = 0;

function animate() {
  requestAnimationFrame(animate);

  const now   = performance.now();
  const delta = Math.min((now - prevTime) / 1000, 0.1); // cap at 100ms
  prevTime    = now;

  if (!gameState.is('MENU')) gameTime += delta;

  // Flush input deltas
  input.flush();

  // ---- HIDE PHASE COUNTDOWN ----
  if (gameState.is('HIDE')) {
    hideTimer -= delta;
    hud.showHideTimer(hideTimer);
    if (hideTimer <= 0) {
      startMainPhase();
    }
  }

  // ---- UPDATE ----
  if (gameState.is('HIDE') || gameState.is('MAIN')) {
    player.update(delta);
    gun.update(delta, player.isMoving, gameTime);

    if (gameState.is('MAIN')) {
      botManager.update(delta, player, mapBuilder.wallMeshes);
      bombSystem.update(delta, player.position, input);
      codeSystem.update(delta, player.position, input);
    } else {
      // HIDE phase — bots still walk to hide spots
      botManager.update(delta, player, mapBuilder.wallMeshes);
    }

    hud.update(delta, player, bombSystem);

    // Shooting
    if (input.leftClickFired && !player.isInCodePanel && gameState.is('MAIN')) {
      if (gun.fire()) {
        shootSystem.shoot(
          botManager.getEnemyMeshes(),
          collMap.wallMeshes,
          botManager
        );
      }
    }

    // Reload
    if (input.isReload()) {
      gun.startReload();
    }

    shootSystem.update(delta);
  }

  // Clear single-shot flags AFTER all systems have had a chance to read them
  input.clearSingleShot();

  // ---- RENDER ----
  renderer.clear();
  renderer.render(scene, camera);
  gun.render(); // second pass: clearDepth + render gunScene

  // Make HP bars billboard-face camera
  if (gameState.is('HIDE') || gameState.is('MAIN')) {
    for (const bot of botManager.allBots) {
      if (!bot.dead && bot.hpBar) {
        bot.hpBar.lookAt(camera.position);
      }
    }
  }
}

// ========================
// RESIZE
// ========================
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// ========================
// START LOOP
// ========================
hud.showMenu();
animate();
