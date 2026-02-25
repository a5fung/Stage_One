import * as THREE from 'three';
import { Bot, STATE } from './Bot.js';
import { ENEMY_SPAWNS, FRIENDLY_SPAWNS, TEAM_BOMB_POS, ENEMY_BOMB_POS } from '../world/SpawnPoints.js';
import { ENEMY_PATROL, FRIENDLY_PATROL_ROUTES, FRIENDLY_HIDE_SPOTS, ENEMY_HIDE_SPOTS } from './Waypoints.js';
import { gameState } from '../GameState.js';
import * as C from '../Constants.js';

export class BotManager {
  constructor(scene, collisionMap) {
    this.scene = scene;
    this.cm    = collisionMap;

    this.enemyBots    = [];
    this.friendlyBots = [];
    this.allBots      = [];

    this._onFriendlyCodePlaced = null;
    this._onEnemyCodePlaced    = null;
    this._onEnemyBombDefused   = null;
    this._enemyCodePos         = null;

    // Kill tracking
    this.friendlyKillCount = 0; // killed by player / friendly bots
    this.enemyKillCount    = 0; // killed by enemy bots

    this._respawnQueue = [];
  }

  spawnAll() {
    this._spawnWithData(ENEMY_SPAWNS, FRIENDLY_SPAWNS, ENEMY_PATROL, FRIENDLY_PATROL_ROUTES);
  }

  // Stage-aware spawn: accepts any spawn/patrol data
  _spawnWithData(enemySpawns, friendlySpawns, enemyPatrol, friendlyRoutes) {
    this.enemyBots    = [];
    this.friendlyBots = [];
    this.allBots      = [];
    this.friendlyKillCount = 0;
    this.enemyKillCount    = 0;
    this._respawnQueue     = [];

    for (let i = 0; i < 5; i++) {
      const spawn = enemySpawns[i].clone();
      const bot   = new Bot(this.scene, spawn, 'enemy', enemyPatrol);
      bot.currentWaypoint = (i * 2) % enemyPatrol.length;
      this.enemyBots.push(bot);
      this.allBots.push(bot);
    }

    for (let i = 0; i < 4; i++) {
      const spawn = friendlySpawns[i].clone();
      const route = friendlyRoutes[i];
      const bot   = new Bot(this.scene, spawn, 'friendly', route);
      this.friendlyBots.push(bot);
      this.allBots.push(bot);
    }
  }

  // HIDE phase: friendly bot 0 hides YOUR code, friendly bot 1 hides the ENEMY code.
  // Enemy bots do not hide anything — they patrol.
  // friendlySpots = where friendly bot hides your code
  // enemySpots    = where friendly bot hides the enemy code (enemy runner fetches it in MAIN)
  startHidePhase(onFriendlyCodePlaced, onEnemyCodePlaced, friendlySpots, enemySpots) {
    this._onFriendlyCodePlaced = onFriendlyCodePlaced;
    this._onEnemyCodePlaced    = onEnemyCodePlaced;
    this._enemyCodePos         = null;

    // --- Bot 0: hides YOUR defuse code ---
    const fSpots = friendlySpots ? [...friendlySpots] : [...FRIENDLY_HIDE_SPOTS];
    _shuffle(fSpots);
    const friendlyRunner = this.friendlyBots[0];
    const friendlyCode   = String(1000 + Math.floor(Math.random() * 9000));
    friendlyRunner._assignedCode = friendlyCode;
    friendlyRunner.startHideCode(fSpots[0], (pos) => {
      if (this._onFriendlyCodePlaced) this._onFriendlyCodePlaced(pos, friendlyCode);
    });

    setTimeout(() => {
      if (friendlyRunner._onCodePlaced) {
        const pos = friendlyRunner.mesh.position.clone();
        friendlyRunner._onCodePlaced(pos);
        friendlyRunner._onCodePlaced = null;
        friendlyRunner._codePlaced = true;
      }
    }, 25000);

    // --- Bot 1: hides the ENEMY defuse code (enemy runner must fetch it in MAIN) ---
    const eSpots = enemySpots ? [...enemySpots] : [...ENEMY_HIDE_SPOTS];
    _shuffle(eSpots);
    const enemyCodeRunner = this.friendlyBots[1];
    const enemyCode       = String(1000 + Math.floor(Math.random() * 9000));
    enemyCodeRunner._assignedCode = enemyCode;
    enemyCodeRunner.startHideCode(eSpots[0], (pos) => {
      this._enemyCodePos = pos.clone();   // enemy runner needs this in MAIN phase
      if (this._onEnemyCodePlaced) this._onEnemyCodePlaced(pos, enemyCode);
    });

    setTimeout(() => {
      if (enemyCodeRunner._onCodePlaced) {
        const pos = enemyCodeRunner.mesh.position.clone();
        this._enemyCodePos = pos.clone();
        enemyCodeRunner._onCodePlaced(pos);
        enemyCodeRunner._onCodePlaced = null;
        enemyCodeRunner._codePlaced = true;
      }
    }, 25000);

    // All enemy bots patrol during HIDE (no combat, no hiding)
    for (const bot of this.enemyBots) {
      bot.state = STATE.PATROL;
    }
    // Remaining friendly bots patrol
    for (let i = 2; i < this.friendlyBots.length; i++) {
      this.friendlyBots[i].state = STATE.PATROL;
    }
  }

  // MAIN phase: enemy runner fetches the code (hidden by friendly bot 1) then defuses their bomb
  startMainPhase(onEnemyBombDefused, enemyBombPos) {
    this._onEnemyBombDefused = onEnemyBombDefused;
    const bombTarget = enemyBombPos || ENEMY_BOMB_POS;

    for (const bot of this.enemyBots) {
      if (!bot.dead && bot.state === STATE.HIDE_CODE) bot.state = STATE.PATROL;
    }
    for (const bot of this.friendlyBots) {
      if (!bot.dead && bot.state === STATE.HIDE_CODE) bot.state = STATE.PATROL;
    }

    // Enemy runner: go to where friendly bot hid the enemy code, then defuse bomb
    const runner = this.enemyBots.find(b => !b.dead);
    if (runner) {
      runner.startDefuseMission(this._enemyCodePos, bombTarget, () => {
        if (this._onEnemyBombDefused) this._onEnemyBombDefused();
      });
    }
  }

  getKillCounts() {
    return { friendly: this.friendlyKillCount, enemy: this.enemyKillCount };
  }

  // Called when player shoots and kills an enemy bot
  onPlayerKill(bot) {
    this.friendlyKillCount++;
    this._scheduleRespawn(bot);
  }

  _scheduleRespawn(bot) {
    this._respawnQueue.push({ bot, timer: C.BOT_RESPAWN_TIME });
  }

  update(delta, player, wallMeshes) {
    const playerPos = player.position.clone();
    playerPos.y = 1.7;

    // --- Update targeting for all teams ---
    for (const bot of this.friendlyBots) {
      if (bot.dead) continue;
      this._updateFriendlyTarget(bot, wallMeshes);
    }
    for (const bot of this.enemyBots) {
      if (bot.dead) continue;
      this._updateEnemyTarget(bot, playerPos);
    }

    // --- Update all bots ---
    for (const bot of this.allBots) {
      if (bot.dead) continue;
      bot.update(delta, playerPos, this.cm, wallMeshes);
    }

    // --- Resolve shots ---
    // Enemy bots shoot their nearest threat (player or friendly bot)
    for (const bot of this.enemyBots) {
      if (bot.dead || !bot._lastShot) continue;
      if (bot.chaseTargetBot && !bot.chaseTargetBot.dead) {
        const wasDead = bot.chaseTargetBot.dead;
        bot.consumeShot(bot.chaseTargetBot);
        if (!wasDead && bot.chaseTargetBot.dead) {
          this.enemyKillCount++;
          this._scheduleRespawn(bot.chaseTargetBot);
        }
      } else {
        bot.consumeShot(player);
      }
    }

    // Friendly bots shoot enemy bots
    for (const bot of this.friendlyBots) {
      if (bot.dead || !bot._lastShot) continue;
      const target = bot.chaseTargetBot;
      if (target && !target.dead) {
        const wasDead = target.dead;
        bot.consumeShot(target);
        if (!wasDead && target.dead) {
          this.friendlyKillCount++;
          this._scheduleRespawn(target);
        }
      } else {
        bot._lastShot = null;
      }
    }

    // --- Process respawn queue ---
    this._respawnQueue = this._respawnQueue.filter(entry => {
      entry.timer -= delta;
      if (entry.timer <= 0) {
        entry.bot.respawn();
        return false;
      }
      return true;
    });
  }

  _updateFriendlyTarget(bot, wallMeshes) {
    if (bot.chaseTargetBot && bot.chaseTargetBot.dead) {
      bot.chaseTargetBot = null;
      if (bot.state === STATE.CHASE || bot.state === STATE.ATTACK) {
        bot.state = STATE.PATROL;
      }
    }

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
        bot.chaseTargetBot = closest;
        if (bot.state === STATE.PATROL || bot.state === STATE.ALERT) {
          bot.state = STATE.CHASE;
          bot._stateTimer = 0;
        }
      }
    } else {
      bot.chaseTargetBot = null;
      if (bot.state === STATE.CHASE || bot.state === STATE.ATTACK) {
        bot.state = STATE.PATROL;
      }
    }
  }

  _updateEnemyTarget(bot, playerPos) {
    if (bot.state === STATE.DEFUSE || bot.state === STATE.HIDE_CODE) return;

    if (bot.chaseTargetBot && bot.chaseTargetBot.dead) {
      bot.chaseTargetBot = null;
    }

    let closestFriendly = null;
    let closestFriendlyDist = Infinity;
    for (const fb of this.friendlyBots) {
      if (fb.dead) continue;
      const d = bot._dist2D(bot.mesh.position, fb.mesh.position);
      if (d < closestFriendlyDist) {
        closestFriendlyDist = d;
        closestFriendly = fb;
      }
    }

    const playerDist = bot._dist2D(bot.mesh.position, playerPos);

    if (closestFriendly && closestFriendlyDist < playerDist) {
      bot.chaseTargetBot = closestFriendly;
    } else {
      bot.chaseTargetBot = null; // falls back to playerPos in bot.update()
    }
  }

  getEnemyMeshes() {
    return this.enemyBots.filter(b => !b.dead).map(b => b.mesh);
  }

  getBotFromMesh(mesh) {
    for (const bot of this.allBots) {
      if (bot.mesh === mesh) return bot;
      let found = false;
      bot.mesh.traverse(child => { if (child === mesh) found = true; });
      if (found) return bot;
    }
    return null;
  }

  reset() {
    for (const bot of this.allBots) {
      this.scene.remove(bot.mesh);
      bot.mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
    this.enemyBots    = [];
    this.friendlyBots = [];
    this.allBots      = [];
    this._respawnQueue = [];
    this.friendlyKillCount = 0;
    this.enemyKillCount    = 0;
    this._enemyCodePos     = null;
  }
}

function _shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
