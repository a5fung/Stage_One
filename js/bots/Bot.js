import * as THREE from 'three';
import * as C from '../Constants.js';
import { gameState } from '../GameState.js';

// Bot AI states
export const STATE = {
  HIDE_CODE : 'HIDE_CODE',
  PATROL    : 'PATROL',
  ALERT     : 'ALERT',
  CHASE     : 'CHASE',
  ATTACK    : 'ATTACK',
  DEFUSE    : 'DEFUSE',
  DEAD      : 'DEAD',
};

const ENEMY_COLOR    = 0xcc3333;
const FRIENDLY_COLOR = 0x3388cc;
const DEAD_COLOR     = 0x555555;

export class Bot {
  constructor(scene, position, team, patrolWaypoints) {
    this.scene    = scene;
    this.team     = team;   // 'enemy' | 'friendly'
    this.hp       = C.BOT_HP;
    this.dead     = false;
    this.state    = STATE.PATROL;

    this.patrolWaypoints = patrolWaypoints || [];
    this.currentWaypoint = 0;

    this._losTimer    = Math.random() * C.BOT_LOS_INTERVAL; // stagger LOS checks
    this._fireTimer   = 0;
    this._stateTimer  = 0;

    // Who this bot is currently chasing/attacking
    // BotManager sets this; it's a Bot reference (for friendly bots targeting enemies)
    this.chaseTargetBot = null;
    this.lastKnownPos   = null; // THREE.Vector3

    // HIDE_CODE data
    this._hideSpot       = null;
    this._onCodePlaced   = null;
    this._codePlaced     = false;

    // DEFUSE data
    this._defuseSpot     = null;
    this._defuseCallback = null;
    this._defuseTimer    = 0;

    this._lastShot = null;

    this._buildMesh(position);
  }

  _buildMesh(position) {
    const color = this.team === 'enemy' ? ENEMY_COLOR : FRIENDLY_COLOR;
    const mat   = () => new THREE.MeshLambertMaterial({ color });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

    // Body
    this.bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.4), mat());
    // Head
    this.headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat());
    this.headMesh.position.y = 0.75;
    // Gun stub
    this.gunStub  = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.30), darkMat);
    this.gunStub.position.set(0.25, 0.1, -0.25);

    this.mesh = new THREE.Group();
    this.mesh.add(this.bodyMesh, this.headMesh, this.gunStub);
    this.mesh.position.copy(position);
    this.mesh.position.y = 0.7;

    this.scene.add(this.mesh);
    this._buildHealthBar();
  }

  _buildHealthBar() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 8;
    this._hpCtx     = canvas.getContext('2d');
    this._hpCanvas  = canvas;
    this._hpTexture = new THREE.CanvasTexture(canvas);

    const mat = new THREE.MeshBasicMaterial({
      map: this._hpTexture, transparent: true, depthTest: false
    });
    this.hpBar = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.1), mat);
    this.hpBar.position.y = 1.65;
    this.mesh.add(this.hpBar);
    this._updateHealthBar();
  }

  _updateHealthBar() {
    const ctx = this._hpCtx, c = this._hpCanvas;
    ctx.clearRect(0, 0, c.width, c.height);
    const pct = Math.max(0, this.hp / C.BOT_HP);
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = pct > 0.5 ? '#4af' : pct > 0.25 ? '#fa4' : '#f44';
    ctx.fillRect(0, 0, c.width * pct, c.height);
    this._hpTexture.needsUpdate = true;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    this._updateHealthBar();
    if (this.hp <= 0) {
      this._die();
    } else if (this.state === STATE.PATROL || this.state === STATE.ALERT) {
      this.state = STATE.CHASE;
      this._stateTimer = 0;
    }
  }

  _die() {
    this.dead = true;
    this.state = STATE.DEAD;
    this.bodyMesh.material.color.setHex(DEAD_COLOR);
    this.headMesh.material.color.setHex(DEAD_COLOR);
    this.mesh.position.y = 0.15;
    this.hpBar.visible = false;
  }

  // Start HIDE_CODE phase: walk to spot, then fire callback
  startHideCode(spot, onPlaced) {
    this.state        = STATE.HIDE_CODE;
    this._hideSpot    = spot.clone();
    this._onCodePlaced= onPlaced;
    this._codePlaced  = false;
  }

  // Start defuse mission: walk to bomb pos, wait, then fire callback
  startDefuseMission(bombPos, onDefuse) {
    this.state           = STATE.DEFUSE;
    this._defuseSpot     = bombPos.clone();
    this._defuseCallback = onDefuse;
    this._defuseTimer    = 0;
  }

  // Main update — chasePos is the default target (player pos for enemy bots)
  update(delta, chasePos, collisionMap, wallMeshes) {
    if (this.dead) return;

    this._losTimer   += delta;
    this._fireTimer  += delta;
    this._stateTimer += delta;

    // Determine effective chase target
    // Friendly bots use chaseTargetBot.mesh.position if available
    let effectiveTarget = chasePos;
    if (this.chaseTargetBot && !this.chaseTargetBot.dead) {
      effectiveTarget = this.chaseTargetBot.mesh.position.clone();
      effectiveTarget.y = 1.7;
    }

    // Billboard HP bar toward camera — done externally in main.js
    switch (this.state) {
      case STATE.HIDE_CODE: this._updateHideCode(delta, collisionMap); break;
      case STATE.PATROL:    this._updatePatrol(delta, effectiveTarget, collisionMap, wallMeshes); break;
      case STATE.ALERT:     this._updateAlert(delta, effectiveTarget, wallMeshes); break;
      case STATE.CHASE:     this._updateChase(delta, effectiveTarget, collisionMap, wallMeshes); break;
      case STATE.ATTACK:    this._updateAttack(delta, effectiveTarget, wallMeshes); break;
      case STATE.DEFUSE:    this._updateDefuse(delta, collisionMap); break;
    }
  }

  _updateHideCode(delta, cm) {
    if (!this._hideSpot || this._codePlaced) return;
    const arrived = this._walkTo(this._hideSpot, C.BOT_WALK_SPEED, delta, cm);
    if (arrived) {
      this._codePlaced = true;
      if (this._onCodePlaced) {
        this._onCodePlaced(this.mesh.position.clone());
        this._onCodePlaced = null;
      }
      // Stay idle until MAIN phase starts (BotManager will switch state)
    }
  }

  _updatePatrol(delta, chasePos, cm, wallMeshes) {
    if (this.patrolWaypoints.length === 0) return;
    const wp = this.patrolWaypoints[this.currentWaypoint];
    if (this._walkTo(wp, C.BOT_WALK_SPEED, delta, cm)) {
      this.currentWaypoint = (this.currentWaypoint + 1) % this.patrolWaypoints.length;
    }

    // Check LOS to chase target periodically
    if (this._losTimer >= C.BOT_LOS_INTERVAL) {
      this._losTimer = 0;
      if (this._canSeePosition(chasePos, wallMeshes)) {
        this.lastKnownPos = chasePos.clone();
        this.state = STATE.CHASE;
        this._stateTimer = 0;
      }
    }
  }

  _updateAlert(delta, chasePos, wallMeshes) {
    if (this.lastKnownPos) this._faceToward(this.lastKnownPos);

    if (this._losTimer >= C.BOT_LOS_INTERVAL) {
      this._losTimer = 0;
      if (this._canSeePosition(chasePos, wallMeshes)) {
        this.lastKnownPos = chasePos.clone();
        this.state = STATE.CHASE;
        this._stateTimer = 0;
      }
    }
    if (this._stateTimer > 5) {
      this.state = STATE.PATROL;
    }
  }

  _updateChase(delta, chasePos, cm, wallMeshes) {
    this.lastKnownPos = chasePos.clone();
    this._walkTo(chasePos, C.BOT_RUN_SPEED, delta, cm);

    if (this._losTimer >= C.BOT_LOS_INTERVAL) {
      this._losTimer = 0;
      const dist = this._dist2D(this.mesh.position, chasePos);

      if (!this._canSeePosition(chasePos, wallMeshes)) {
        this.state = STATE.ALERT;
        this._stateTimer = 0;
        return;
      }
      if (dist <= C.BOT_ATTACK_RANGE) {
        this.state = STATE.ATTACK;
        this._stateTimer = 0;
      }
    }
  }

  _updateAttack(delta, chasePos, wallMeshes) {
    this._faceToward(chasePos);

    if (this._losTimer >= C.BOT_LOS_INTERVAL) {
      this._losTimer = 0;
      const dist = this._dist2D(this.mesh.position, chasePos);

      if (!this._canSeePosition(chasePos, wallMeshes) || dist > C.BOT_ATTACK_RANGE + 3) {
        this.state = STATE.CHASE;
        this._stateTimer = 0;
        return;
      }

      // Slight lateral movement while attacking
      this._lateralMove(delta, chasePos);
    }

    if (this._fireTimer >= C.BOT_FIRE_INTERVAL) {
      this._fireTimer = 0;
      this._shoot(chasePos);
    }
  }

  _updateDefuse(delta, cm) {
    if (!this._defuseSpot) return;
    const dist = this._dist2D(this.mesh.position, this._defuseSpot);
    if (dist > 1.2) {
      this._walkTo(this._defuseSpot, C.BOT_RUN_SPEED, delta, cm);
      this._defuseTimer = 0;
    } else {
      this._defuseTimer += delta;
      if (this._defuseTimer >= C.BOMB_DEFUSE_TIME && this._defuseCallback) {
        this._defuseCallback();
        this._defuseCallback = null;
      }
    }
  }

  // Returns true when arrived at target
  _walkTo(target, speed, delta, cm) {
    const pos = this.mesh.position;
    const dx  = target.x - pos.x;
    const dz  = target.z - pos.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < 0.3) return true;

    const step = Math.min(speed * delta, dist);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;

    cm.resolve(pos, 0.35);
    cm.clampToMap(pos, 60, 80);

    this.mesh.rotation.y = Math.atan2(dx, dz);
    return false;
  }

  _lateralMove(delta, target) {
    const dx = target.x - this.mesh.position.x;
    const dz = target.z - this.mesh.position.z;
    const perp = new THREE.Vector3(-dz, 0, dx).normalize();
    const dir  = (Math.floor(this._stateTimer / 1.2) % 2 === 0) ? 1 : -1;
    this.mesh.position.x += perp.x * dir * C.BOT_WALK_SPEED * 0.4 * delta;
    this.mesh.position.z += perp.z * dir * C.BOT_WALK_SPEED * 0.4 * delta;
  }

  _faceToward(pos) {
    const dx = pos.x - this.mesh.position.x;
    const dz = pos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  _canSeePosition(pos, wallMeshes) {
    const origin = this.mesh.position.clone();
    origin.y = 1.4;
    const target = pos.clone();
    target.y = 1.4;
    const dir = new THREE.Vector3().subVectors(target, origin);
    const dist = dir.length();
    if (dist > C.BOT_DETECTION_RADIUS) return false;
    dir.normalize();

    const ray = new THREE.Raycaster(origin, dir, 0.1, dist);
    const hits = ray.intersectObjects(wallMeshes, false);
    return hits.length === 0;
  }

  _shoot(targetPos) {
    const spread = 0.07;
    const origin = new THREE.Vector3(
      this.mesh.position.x,
      this.mesh.position.y + 1.4,
      this.mesh.position.z
    );
    const dx = targetPos.x - origin.x + (Math.random() - 0.5) * spread * 2;
    const dz = targetPos.z - origin.z + (Math.random() - 0.5) * spread * 2;
    const dy = (targetPos.y || 1.7) - origin.y + (Math.random() - 0.5) * spread;

    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const ray = new THREE.Raycaster(origin, dir, 0, C.BOT_ATTACK_RANGE + 3);
    this._lastShot = { ray, damage: C.BOT_DAMAGE };
  }

  // Called by BotManager to apply the queued shot to a target
  consumeShot(target) {
    if (!this._lastShot) return false;
    const { ray, damage } = this._lastShot;
    this._lastShot = null;

    const targetPos = target.position || (target.mesh && target.mesh.position);
    if (!targetPos) return false;

    const nearest = new THREE.Vector3();
    ray.ray.closestPointToPoint(targetPos, nearest);
    if (nearest.distanceTo(targetPos) < 0.65) {
      if (target.takeDamage) target.takeDamage(damage);
      else if (target.hp !== undefined) target.hp -= damage;
      return true;
    }
    return false;
  }

  _dist2D(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx*dx + dz*dz);
  }
}
