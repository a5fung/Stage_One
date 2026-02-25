import * as THREE from 'three';
import { gameState } from './GameState.js';
import { InputManager } from './InputManager.js';
import { MapBuilder } from './world/MapBuilder.js';
import { Stage2MapBuilder } from './world/Stage2MapBuilder.js';
import { CollisionMap } from './world/CollisionMap.js';
import { Player } from './player/Player.js';
import { Gun } from './player/Gun.js';
import { BotManager } from './bots/BotManager.js';
import { ShootingSystem } from './systems/ShootingSystem.js';
import { CodeSystem } from './systems/CodeSystem.js';
import { BombSystem } from './systems/BombSystem.js';
import { HUD } from './systems/HUD.js';
import { HIDE_PHASE_DURATION } from './Constants.js';
import { PLAYER_SPAWN, TEAM_BOMB_POS, ENEMY_BOMB_POS,
         ENEMY_SPAWNS, FRIENDLY_SPAWNS,
         S2_PLAYER_SPAWN, S2_ENEMY_SPAWNS, S2_FRIENDLY_SPAWNS,
         S2_TEAM_BOMB_POS, S2_ENEMY_BOMB_POS } from './world/SpawnPoints.js';
import { ENEMY_PATROL, FRIENDLY_PATROL_ROUTES,
         FRIENDLY_HIDE_SPOTS, ENEMY_HIDE_SPOTS } from './bots/Waypoints.js';
import { S2_ENEMY_PATROL, S2_FRIENDLY_PATROL_ROUTES,
         S2_FRIENDLY_HIDE_SPOTS, S2_ENEMY_HIDE_SPOTS } from './bots/Stage2Waypoints.js';

// ========================
// RENDERER + SCENE
// ========================
const canvas = document.getElementById('gameCanvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);
scene.fog = new THREE.Fog(0xf0f0f0, 30, 85);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(20, 30, 20);
scene.add(sun);

// ========================
// SYSTEMS
// ========================
const input      = new InputManager();
const collMap    = new CollisionMap();
const player     = new Player(scene, camera, input, collMap);
const gun        = new Gun(renderer);
const codeSystem = new CodeSystem(scene);
const botManager = new BotManager(scene, collMap);
const bombSystem = new BombSystem(scene, codeSystem, botManager);
const shootSystem = new ShootingSystem(camera, scene);
const hud        = new HUD();

player._gun = gun;
bombSystem.setRefs(player, player.controls);

let currentStage   = 1;
let activeBuilder  = null;  // currently built MapBuilder
let hideTimer      = 0;

// ========================
// STAGE MANAGEMENT
// ========================
function buildStage(stageNum) {
  // Remove previous stage geometry
  if (activeBuilder) {
    for (const m of activeBuilder.wallMeshes) {
      scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    }
    activeBuilder.wallMeshes = [];
    for (const m of (activeBuilder.nonWallMeshes || [])) {
      scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    }
    activeBuilder.nonWallMeshes = [];
  }
  collMap.reset();

  currentStage = stageNum;

  if (stageNum === 2) {
    activeBuilder = new Stage2MapBuilder(scene, collMap);
  } else {
    activeBuilder = new MapBuilder(scene, collMap);
  }
  activeBuilder.build();
}

// ========================
// GAME STATE TRANSITIONS
// ========================
function startGame(stageNum) {
  currentStage = stageNum || currentStage;

  player.reset();
  gun.reset();
  botManager.reset();
  codeSystem.reset();
  bombSystem.reset();
  hud.resetTimerDisplay();
  window._endReason  = null;
  window._killCounts = null;

  // Rebuild map geometry for chosen stage
  buildStage(currentStage);

  // Place player at correct spawn
  const playerSpawn = currentStage === 2 ? S2_PLAYER_SPAWN : PLAYER_SPAWN;
  player.camera.position.copy(playerSpawn);

  // Spawn bots with stage-appropriate data
  _spawnBots(currentStage);

  gameState.transition('HIDE');
  hideTimer = HIDE_PHASE_DURATION;

  hud.showGame();
  hud.showBanner(`STAGE ${currentStage} — HIDE PHASE`, 3000);

  const friendlyHideSpots = currentStage === 2 ? S2_FRIENDLY_HIDE_SPOTS : FRIENDLY_HIDE_SPOTS;
  const enemyHideSpots    = currentStage === 2 ? S2_ENEMY_HIDE_SPOTS    : ENEMY_HIDE_SPOTS;

  botManager.startHidePhase(
    (pos, code) => codeSystem.placeNote(pos, code, 'friendly'),
    (pos, code) => codeSystem.placeNote(pos, code, 'enemy'),
    friendlyHideSpots,
    enemyHideSpots
  );
}

function _spawnBots(stageNum) {
  // Patch BotManager's spawn data based on stage
  const enemySpawns    = stageNum === 2 ? S2_ENEMY_SPAWNS    : ENEMY_SPAWNS;
  const friendlySpawns = stageNum === 2 ? S2_FRIENDLY_SPAWNS : FRIENDLY_SPAWNS;
  const enemyPatrol    = stageNum === 2 ? S2_ENEMY_PATROL    : ENEMY_PATROL;
  const friendlyRoutes = stageNum === 2 ? S2_FRIENDLY_PATROL_ROUTES : FRIENDLY_PATROL_ROUTES;

  // Temporarily override the imported arrays via direct spawn
  botManager._spawnWithData(enemySpawns, friendlySpawns, enemyPatrol, friendlyRoutes);
}

function startMainPhase() {
  gameState.transition('MAIN');
  bombSystem.start();
  hud.showBanner('ROUND START', 3000);
  hud.hidePhaseTimer();

  // Bomb positions for the chosen stage
  if (currentStage === 2) {
    bombSystem.setBombPositions(S2_TEAM_BOMB_POS, S2_ENEMY_BOMB_POS);
  } else {
    bombSystem.setBombPositions(TEAM_BOMB_POS, ENEMY_BOMB_POS);
  }

  const enemyBombTarget = currentStage === 2 ? S2_ENEMY_BOMB_POS : ENEMY_BOMB_POS;
  botManager.startMainPhase(() => {
    bombSystem.triggerEnemyBombDefused();
  }, enemyBombTarget);
}

gameState.on('END', () => {
  const reason = window._endReason || 'LOSE_DEAD';
  hud.showEnd(reason);
});

// ========================
// BUTTON HANDLERS
// ========================
function onStartClick(stageNum) {
  startGame(stageNum);
  if (!input._isMobile) {
    try { player.requestLock(); } catch(e) {}
  }
}

document.getElementById('stage1Btn').addEventListener('click', () => onStartClick(1));
document.getElementById('stage2Btn').addEventListener('click', () => onStartClick(2));

document.getElementById('helpBtn').addEventListener('click', () => {
  document.getElementById('helpScreen').classList.remove('hidden');
});
document.getElementById('helpCloseBtn').addEventListener('click', () => {
  document.getElementById('helpScreen').classList.add('hidden');
});

document.getElementById('playAgainBtn').addEventListener('click', () => {
  document.getElementById('endScreen').classList.add('hidden');
  startGame(currentStage);
  if (!input._isMobile) {
    try { player.requestLock(); } catch(e) {}
  }
});

document.getElementById('mainMenuBtn').addEventListener('click', () => {
  document.getElementById('endScreen').classList.add('hidden');
  gameState.transition('MENU');
  hud.showMenu();
  player.unlock();
});

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

    botManager.update(delta, player, activeBuilder ? activeBuilder.wallMeshes : []);

    if (gameState.is('MAIN')) {
      bombSystem.update(delta, player.position, input);
      codeSystem.update(delta, player.position, input);
      codeSystem.updateCompassAngle(camera.rotation.y);
    }

    hud.update(delta, player, bombSystem, botManager);

    if (input.leftClickFired && !player.isInCodePanel && gameState.is('MAIN')) {
      if (gun.fire()) {
        shootSystem.shoot(botManager.getEnemyMeshes(), activeBuilder ? activeBuilder.wallMeshes : [], botManager);
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
// READY
// ========================
hud.showMenu();
document.getElementById('loadingMsg').style.display = 'none';
document.getElementById('stage1Btn').style.display = '';
document.getElementById('stage2Btn').style.display = '';
document.getElementById('helpBtn').style.display   = '';

animate();
