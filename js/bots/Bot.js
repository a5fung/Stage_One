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

const DEAD_COLOR  = 0x555555;
const SKIN_COLOR  = 0xffcc88;
const DARK_COLOR  = 0x111111;

export class Bot {
  constructor(scene, position, team, patrolWaypoints) {
    this.scene    = scene;
    this.team     = team;   // 'enemy' | 'friendly'
    this.hp       = C.BOT_HP;
    this.dead     = false;
    this.state    = STATE.PATROL;

    this.patrolWaypoints = patrolWaypoints || [];
    this.currentWaypoint = 0;

    this._losTimer    = Math.random() * C.BOT_LOS_INTERVAL;
    this._fireTimer   = 0;
    this._stateTimer  = 0;

    this.chaseTargetBot = null;
    this.lastKnownPos   = null;

    this._hideSpot       = null;
    this._onCodePlaced   = null;
    this._codePlaced     = false;

    this._defuseSpot     = null;
    this._defuseCallback = null;
    this._defuseTimer    = 0;

    this._lastShot = null;

    this._buildMesh(position);
  }

  // Unified position interface — chest height, works with consumeShot and BotManager
  get position() {
    return new THREE.Vector3(
      this.mesh.position.x,
      this.mesh.position.y + 1.3,
      this.mesh.position.z
    );
  }

  _buildMesh(position) {
    const teamColor  = this.team === 'enemy' ? 0xff3333 : 0x3399ff;
    const bodyAccent = this.team === 'enemy' ? 0xcc1111 : 0x1166cc;
    this._teamColor  = teamColor;
    this._bodyAccent = bodyAccent;
    this._spawnPos   = new THREE.Vector3(position.x, 0, position.z);

    const mat = c => new THREE.MeshLambertMaterial({ color: c });

    // --- Legs ---
    this.leftLeg  = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.62, 0.25), mat(teamColor));
    this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.62, 0.25), mat(teamColor));
    this.leftLeg.position.set(-0.14, 0.31, 0);
    this.rightLeg.position.set( 0.14, 0.31, 0);

    // --- Body / torso ---
    this.bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), mat(bodyAccent));
    this.bodyMesh.position.set(0, 0.93, 0);

    // --- Arms ---
    this.leftArm  = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), mat(teamColor));
    this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), mat(teamColor));
    this.leftArm.position.set(-0.39, 0.93, 0);
    this.rightArm.position.set( 0.39, 0.93, 0);

    // --- Head (big Minecraft-style square) ---
    this.headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), mat(SKIN_COLOR));
    this.headMesh.position.set(0, 1.62, 0);

    // --- Eyes on the +Z face (forward direction) ---
    const leftEye  = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.05), mat(DARK_COLOR));
    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.05), mat(DARK_COLOR));
    leftEye.position.set(-0.15, 1.65, 0.33);
    rightEye.position.set( 0.15, 1.65, 0.33);

    // --- Gun stub on right arm, barrel pointing +Z (forward) ---
    this.gunStub = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.36), mat(0x333333));
    this.gunStub.position.set(0.39, 0.93, 0.26);
    this.gunStub.material.emissive = new THREE.Color(0x000000);

    this.mesh = new THREE.Group();
    this.mesh.add(
      this.leftLeg, this.rightLeg,
      this.bodyMesh,
      this.leftArm, this.rightArm,
      this.headMesh, leftEye, rightEye,
      this.gunStub
    );
    this.mesh.position.copy(position);
    this.mesh.position.y = 0;

    this.scene.add(this.mesh);

    // Track colored parts for death / respawn resets
    this._teamColorParts = [this.leftLeg, this.rightLeg, this.leftArm, this.rightArm];

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
    this.hpBar.position.y = 2.15;
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

  // Returns true if the bot died from this hit
  takeDamage(amount) {
    if (this.dead) return false;
    this.hp -= amount;
    this._updateHealthBar();
    if (this.hp <= 0) {
      this._die();
      return true;
    }
    if (this.state === STATE.PATROL || this.state === STATE.ALERT) {
      this.state = STATE.CHASE;
      this._stateTimer = 0;
    }
    return false;
  }

  _die() {
    this.dead = true;
    this.state = STATE.DEAD;
    // Fall sideways
    this.mesh.rotation.z = Math.PI / 2;
    this._teamColorParts.forEach(m => m.material.color.setHex(DEAD_COLOR));
    this.bodyMesh.material.color.setHex(DEAD_COLOR);
    this.headMesh.material.color.setHex(DEAD_COLOR);
    this.hpBar.visible = false;
  }

  // Reset bot to alive state at its original spawn position
  respawn() {
    this.hp          = C.BOT_HP;
    this.dead        = false;
    this.state       = STATE.PATROL;
    this._stateTimer = 0;
    this._fireTimer  = 0;
    this._lastShot   = null;
    this.chaseTargetBot = null;
    this.lastKnownPos   = null;

    // Restore colours
    this._teamColorParts.forEach(m => m.material.color.setHex(this._teamColor));
    this.bodyMesh.material.color.setHex(this._bodyAccent);
    this.headMesh.material.color.setHex(SKIN_COLOR);

    // Restore pose and position
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.position.copy(this._spawnPos);
    this.hpBar.visible = true;
    this._updateHealthBar();
  }

  startHideCode(spot, onPlaced) {
    this.state        = STATE.HIDE_CODE;
    this._hideSpot    = spot.clone();
    this._onCodePlaced= onPlaced;
    this._codePlaced  = false;
  }

  startDefuseMission(bombPos, onDefuse) {
    this.state           = STATE.DEFUSE;
    this._defuseSpot     = bombPos.clone();
    this._defuseCallback = onDefuse;
    this._defuseTimer    = 0;
  }

  update(delta, chasePos, collisionMap, wallMeshes) {
    if (this.dead) return;

    this._losTimer   += delta;
    this._fireTimer  += delta;
    this._stateTimer += delta;

    // Determine effective chase target
    let effectiveTarget = chasePos;
    if (this.chaseTargetBot && !this.chaseTargetBot.dead) {
      effectiveTarget = this.chaseTargetBot.mesh.position.clone();
      effectiveTarget.y = 1.7;
    }

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
    }
  }

  _updatePatrol(delta, chasePos, cm, wallMeshes) {
    if (this.patrolWaypoints.length === 0) return;
    const wp = this.patrolWaypoints[this.currentWaypoint];
    if (this._walkTo(wp, C.BOT_WALK_SPEED, delta, cm)) {
      this.currentWaypoint = (this.currentWaypoint + 1) % this.patrolWaypoints.length;
    }

    // No combat engagement during HIDE phase
    if (gameState.is('HIDE')) return;

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
    if (gameState.is('HIDE')) { this.state = STATE.PATROL; return; }

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
    if (gameState.is('HIDE')) { this.state = STATE.PATROL; return; }

    this.lastKnownPos = chasePos.clone();
    this._walkTo(chasePos, C.BOT_RUN_SPEED, delta, cm);

    if (this._losTimer >= C.BOT_LOS_INTERVAL) {
      this._losTimer = 0;
      const dist = this._dist2D(this.mesh.position, chasePos);
      const canSee = this._canSeePosition(chasePos, wallMeshes);

      if (!canSee) {
        if (this.team === 'enemy') {
          this.state = STATE.ALERT;
          this._stateTimer = 0;
        }
        return;
      }
      if (dist <= C.BOT_ATTACK_RANGE) {
        this.state = STATE.ATTACK;
        this._stateTimer = 0;
      }
    }
  }

  _updateAttack(delta, chasePos, wallMeshes) {
    if (gameState.is('HIDE')) { this.state = STATE.PATROL; return; }

    this._faceToward(chasePos);

    if (this._losTimer >= C.BOT_LOS_INTERVAL) {
      this._losTimer = 0;
      const dist = this._dist2D(this.mesh.position, chasePos);

      if (!this._canSeePosition(chasePos, wallMeshes, C.BOT_ATTACK_RANGE + 5) || dist > C.BOT_ATTACK_RANGE + 3) {
        this.state = STATE.CHASE;
        this._stateTimer = 0;
        return;
      }
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
    cm.clampToMap(pos);  // uses stored dimensions

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

  _canSeePosition(pos, wallMeshes, maxDist) {
    const origin = this.mesh.position.clone();
    origin.y = 1.4;
    const target = pos.clone();
    target.y = 1.4;
    const dir = new THREE.Vector3().subVectors(target, origin);
    const dist = dir.length();
    const limit = maxDist !== undefined ? maxDist : C.BOT_DETECTION_RADIUS;
    if (dist > limit) return false;
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

    // Muzzle flash
    const mat = this.gunStub.material;
    mat.emissive.setHex(0xffaa00);
    setTimeout(() => {
      if (!this.dead && this.gunStub) mat.emissive.setHex(0x000000);
    }, 90);
  }

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
