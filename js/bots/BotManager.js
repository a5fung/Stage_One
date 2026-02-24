import * as THREE from 'three';
import { Bot, STATE } from './Bot.js';
import { ENEMY_SPAWNS, FRIENDLY_SPAWNS, TEAM_BOMB_POS } from '../world/SpawnPoints.js';
import { ENEMY_PATROL, FRIENDLY_PATROL_ROUTES, CODE_HIDE_SPOTS } from './Waypoints.js';
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

    // 4 friendly bots — each gets its own lane patrol route
    for (let i = 0; i < 4; i++) {
      const spawn = FRIENDLY_SPAWNS[i].clone();
      const route = FRIENDLY_PATROL_ROUTES[i];
      const bot   = new Bot(this.scene, spawn, 'friendly', route);
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

    // Only one enemy bot hides the code
    const runner = this.enemyBots[0];
    const spot   = spots[0];
    const code   = String(1000 + Math.floor(Math.random() * 9000));
    runner._assignedCode = code;
    runner.startHideCode(spot, (pos) => {
      if (this._onCodePlaced) this._onCodePlaced(pos, code);
    });

    // Fallback: drop note at current position after 25s if bot gets stuck
    setTimeout(() => {
      if (runner._onCodePlaced) {
        const pos = runner.mesh.position.clone();
        runner._onCodePlaced(pos);
        runner._onCodePlaced = null;
        runner._codePlaced = true;
      }
    }, 25000);

    // Remaining enemy bots just patrol during HIDE phase
    for (let i = 1; i < this.enemyBots.length; i++) {
      this.enemyBots[i].state = 'PATROL';
    }
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
    // Drop dead targets
    if (bot.chaseTargetBot && bot.chaseTargetBot.dead) {
      bot.chaseTargetBot = null;
      if (bot.state === STATE.CHASE || bot.state === STATE.ATTACK) {
        bot.state = STATE.PATROL;
      }
    }

    // Always find the closest living enemy — no distance cap.
    // Re-evaluate every frame so bots switch to a nearer target if one appears.
    let closest = null;
    let closestDist = Infinity;
    for (const enemy of this.enemyBots) {
      if (enemy.dead) continue;
      const dist = bot._dist2D(bot.mesh.position, enemy.mesh.position);
      if (dist < closestDist) {
        closestDist = dist;
        closest = enemy;
      }
    }

    if (closest) {
      if (bot.chaseTargetBot !== closest) {
        // Switched to a closer target
        bot.chaseTargetBot = closest;
        if (bot.state === STATE.PATROL || bot.state === STATE.ALERT) {
          bot.state = STATE.CHASE;
          bot._stateTimer = 0;
        }
      }
    } else {
      // All enemies dead — go back to patrol
      bot.chaseTargetBot = null;
      if (bot.state === STATE.CHASE || bot.state === STATE.ATTACK) {
        bot.state = STATE.PATROL;
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
