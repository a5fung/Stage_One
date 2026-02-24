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
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);
scene.fog = new THREE.Fog(0xf0f0f0, 30, 75);

const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 100
);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(20, 30, 20);
scene.add(sun);

// ========================
// SYSTEMS
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

player._gun = gun;
bombSystem.setRefs(player, player.controls);

mapBuilder.build();

// ========================
// GAME STATE TRANSITIONS
// ========================
let hideTimer = 0;

function startGame() {
  player.reset();
  gun.reset();
  botManager.reset();
  codeSystem.reset();
  bombSystem.reset();
  hud.resetTimerDisplay();
  window._endReason = null;

  botManager.spawnAll();
  gameState.transition('HIDE');
  hideTimer = HIDE_PHASE_DURATION;

  hud.showGame();
  hud.showBanner('HIDE PHASE', 3000);

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

gameState.on('END', () => {
  const reason = window._endReason || 'LOSE_DEAD';
  hud.showEnd(reason);
});

// ========================
// BUTTON HANDLERS
// ========================
function onStartClick() {
  startGame();
  // Request pointer lock on desktop (must be inside click handler)
  if (!input._isMobile) {
    try { player.requestLock(); } catch(e) { /* ignore — user can click canvas later */ }
  }
}

document.getElementById('startBtn').addEventListener('click', onStartClick);

document.getElementById('playAgainBtn').addEventListener('click', () => {
  document.getElementById('endScreen').classList.add('hidden');
  startGame();
  if (!input._isMobile) {
    try { player.requestLock(); } catch(e) {}
  }
});

// Also lock on canvas click (for desktop users who dismissed the menu)
canvas.addEventListener('click', () => {
  if ((gameState.is('MAIN') || gameState.is('HIDE')) && !player.isInCodePanel && !input._isMobile) {
    try { player.requestLock(); } catch(e) {}
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
  const delta = Math.min((now - prevTime) / 1000, 0.1);
  prevTime    = now;

  if (!gameState.is('MENU')) gameTime += delta;

  input.flush();

  if (gameState.is('HIDE')) {
    hideTimer -= delta;
    hud.showHideTimer(hideTimer);
    if (hideTimer <= 0) startMainPhase();
  }

  if (gameState.is('HIDE') || gameState.is('MAIN')) {
    player.update(delta);
    gun.update(delta, player.isMoving, gameTime);

    botManager.update(delta, player, mapBuilder.wallMeshes);

    if (gameState.is('MAIN')) {
      bombSystem.update(delta, player.position, input);
      codeSystem.update(delta, player.position, input);
    }

    hud.update(delta, player, bombSystem);

    if (input.leftClickFired && !player.isInCodePanel && gameState.is('MAIN')) {
      if (gun.fire()) {
        shootSystem.shoot(botManager.getEnemyMeshes(), collMap.wallMeshes, botManager);
      }
    }

    if (input.isReload()) gun.startReload();

    shootSystem.update(delta);
  }

  input.clearSingleShot();

  renderer.clear();
  renderer.render(scene, camera);
  gun.render();

  // Billboard HP bars
  if (gameState.is('HIDE') || gameState.is('MAIN')) {
    for (const bot of botManager.allBots) {
      if (!bot.dead && bot.hpBar) bot.hpBar.lookAt(camera.position);
    }
  }
}

// ========================
// RESIZE
// ========================
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// ========================
// READY — show the button
// ========================
hud.showMenu();
document.getElementById('loadingMsg').style.display = 'none';
document.getElementById('startBtn').style.display = '';

animate();
