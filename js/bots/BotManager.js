import * as THREE from 'three';
import { Bot, STATE } from './Bot.js';
import { ENEMY_SPAWNS, FRIENDLY_SPAWNS, TEAM_BOMB_POS } from '../world/SpawnPoints.js';
import { ENEMY_PATROL, FRIENDLY_PATROL, CODE_HIDE_SPOTS } from './Waypoints.js';
import { gameState } from '../GameState.js';

export class BotManager {
  constructor(scene, collisionMap) {
    this.scene = scene;
    this.cm    = collisionMap;

    this.enemyBots    = [];
    this.friendlyBots = [];
    this.allBots      = [];

    this._onCodePlaced       = null;
    this._onTeamBombDefused  = null;
  }

  spawnAll() {
    this.enemyBots    = [];
    this.friendlyBots = [];
    this.allBots      = [];

    // 5 enemy bots — stagger waypoint starting index
    for (let i = 0; i < 5; i++) {
      const spawn = ENEMY_SPAWNS[i].clone();
      const bot   = new Bot(this.scene, spawn, 'enemy', ENEMY_PATROL);
      bot.currentWaypoint = (i * 2) % ENEMY_PATROL.length;
      this.enemyBots.push(bot);
      this.allBots.push(bot);
    }

    // 4 friendly bots
    for (let i = 0; i < 4; i++) {
      const spawn = FRIENDLY_SPAWNS[i].clone();
      const bot   = new Bot(this.scene, spawn, 'friendly', FRIENDLY_PATROL);
      bot.currentWaypoint = (i * 2) % FRIENDLY_PATROL.length;
      this.friendlyBots.push(bot);
      this.allBots.push(bot);
    }
  }

  // HIDE phase: assign code-hiding tasks to enemy bots
  startHidePhase(onCodePlaced) {
    this._onCodePlaced = onCodePlaced;

    // Shuffle spots
    const spots = [...CODE_HIDE_SPOTS];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }

    this.enemyBots.forEach((bot, i) => {
      const spot = spots[i % spots.length];
      const code = String(1000 + Math.floor(Math.random() * 9000));
      bot._assignedCode = code;
      bot.startHideCode(spot, (pos) => {
        if (this._onCodePlaced) this._onCodePlaced(pos, code);
      });

      // Fallback: if bot is still walking after 25s, drop the note where it stands
      setTimeout(() => {
        if (bot._onCodePlaced) {
          const pos = bot.mesh.position.clone();
          bot._onCodePlaced(pos);
          bot._onCodePlaced = null;
          bot._codePlaced = true;
        }
      }, 25000);
    });
  }

  // MAIN phase: switch bots to patrol/combat; designate one enemy as bomb-runner
  startMainPhase(onTeamBombDefused) {
    this._onTeamBombDefused = onTeamBombDefused;

    for (const bot of this.enemyBots) {
      if (!bot.dead && (bot.state === STATE.HIDE_CODE)) {
        bot.state = STATE.PATROL;
      }
    }
    for (const bot of this.friendlyBots) {
      if (!bot.dead) bot.state = STATE.PATROL;
    }

    // One living enemy bot becomes the defuse runner
    const runner = this.enemyBots.find(b => !b.dead);
    if (runner) {
      runner.startDefuseMission(TEAM_BOMB_POS, () => {
        if (this._onTeamBombDefused) this._onTeamBombDefused();
      });
    }
  }

  update(delta, player, wallMeshes) {
    const playerPos = player.position.clone();
    playerPos.y = 1.7;

    // --- Update friendly bot targeting BEFORE updating bots ---
    for (const bot of this.friendlyBots) {
      if (bot.dead) continue;
      this._updateFriendlyTarget(bot, wallMeshes);
    }

    // --- Update all bots ---
    for (const bot of this.allBots) {
      if (bot.dead) continue;
      bot.update(delta, playerPos, this.cm, wallMeshes);
    }

    // --- Resolve shots ---
    // Enemy bots shoot the player
    for (const bot of this.enemyBots) {
      if (bot.dead || !bot._lastShot) continue;
      bot.consumeShot(player);
    }

    // Friendly bots shoot enemy bots
    for (const bot of this.friendlyBots) {
      if (bot.dead || !bot._lastShot) continue;
      const target = bot.chaseTargetBot;
      if (target && !target.dead) {
        bot.consumeShot(target);
      } else {
        bot._lastShot = null;
      }
    }
  }

  _updateFriendlyTarget(bot, wallMeshes) {
    // Clear dead target
    if (bot.chaseTargetBot && bot.chaseTargetBot.dead) {
      bot.chaseTargetBot = null;
      if (bot.state === STATE.CHASE || bot.state === STATE.ATTACK) {
        bot.state = STATE.PATROL;
      }
    }

    // Find closest visible enemy bot if not already targeting
    if (!bot.chaseTargetBot) {
      let closest = null;
      let closestDist = Infinity;
      for (const enemy of this.enemyBots) {
        if (enemy.dead) continue;
        const dist = bot._dist2D(bot.mesh.position, enemy.mesh.position);
        if (dist < 22 && dist < closestDist) {
          closestDist = dist;
          closest = enemy;
        }
      }
      if (closest) {
        bot.chaseTargetBot = closest;
        bot.state = STATE.CHASE;
        bot._stateTimer = 0;
      }
    }
  }

  // Get all living enemy bot meshes for hit-test raycasting
  getEnemyMeshes() {
    return this.enemyBots.filter(b => !b.dead).map(b => b.mesh);
  }

  // Resolve shot → which bot was hit? Walk up mesh hierarchy.
  getBotFromMesh(mesh) {
    for (const bot of this.allBots) {
      if (bot.mesh === mesh) return bot;
      // Check children
      let found = false;
      bot.mesh.traverse(child => { if (child === mesh) found = true; });
      if (found) return bot;
    }
    return null;
  }

  // Remove all bots from scene
  reset() {
    for (const bot of this.allBots) {
      this.scene.remove(bot.mesh);
      // Dispose geometries/materials
      bot.mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
    this.enemyBots    = [];
    this.friendlyBots = [];
    this.allBots      = [];
  }
}
