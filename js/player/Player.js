import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as C from '../Constants.js';
import { gameState } from '../GameState.js';

// In Three.js r155+, PointerLockControls no longer uses a wrapper yaw object.
// The camera is controlled directly. We use camera.rotation with order 'YXZ'
// (yaw applied first, then pitch) for correct FPS look.

const MOUSE_SENSITIVITY  = 0.002;
const TOUCH_SENSITIVITY  = 0.005;
const FRICTION_EXP       = 0.001;

export class Player {
  constructor(scene, camera, inputManager, collisionMap) {
    this.scene  = scene;
    this.camera = camera;
    this.input  = inputManager;
    this.cm     = collisionMap;

    this.hp     = C.PLAYER_HP;
    this.maxHp  = C.PLAYER_HP;
    this.dead   = false;

    this.velocity = new THREE.Vector3();
    this.isMoving = false;

    this._yaw   = 0;
    this._pitch = 0;

    // YXZ order: yaw (Y) applied before pitch (X) — standard FPS rotation
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(30, C.PLAYER_EYE_HEIGHT, 8);

    // PointerLockControls — used only for pointer lock/unlock on desktop.
    // In r160 it directly rotates the camera; we read back yaw/pitch from it.
    this.controls = new PointerLockControls(camera, document.body);

    this._locked = false;
    document.addEventListener('pointerlockchange', () => {
      this._locked = !!document.pointerLockElement;
    });

    this.isInCodePanel = false;
    this.time = 0;
  }

  // Player world position
  get position() { return this.camera.position; }

  requestLock() { this.controls.lock(); }
  unlock()      { this.controls.unlock(); }
  get locked()  { return this._locked; }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.dead = true;
      window._endReason = 'LOSE_DEAD';
      gameState.transition('END');
    }
    const v = document.getElementById('damageVignette');
    if (v) {
      v.classList.add('flash');
      setTimeout(() => v.classList.remove('flash'), 200);
    }
  }

  reset() {
    this.hp   = this.maxHp;
    this.dead = false;
    this.velocity.set(0, 0, 0);
    this.camera.position.set(30, C.PLAYER_EYE_HEIGHT, 8);
    this._yaw   = 0;
    this._pitch = 0;
    this.camera.rotation.set(0, 0, 0);
    this.isInCodePanel = false;
  }

  update(delta) {
    if (this.dead) return;
    if (!gameState.is('MAIN') && !gameState.is('HIDE')) return;

    this.time += delta;

    // ---- Look: desktop (PointerLock handles mouse, we just read it back) ----
    if (this._locked && !this.isInCodePanel) {
      // Controls already rotated the camera via mousemove; sync our yaw/pitch
      this._yaw   = this.camera.rotation.y;
      this._pitch = this.camera.rotation.x;
    }

    // ---- Look: mobile (touch swipe) ----
    if (!this._locked) {
      const dx = this.input.lookDelta.x;
      const dy = this.input.lookDelta.y;
      if ((Math.abs(dx) > 0 || Math.abs(dy) > 0) && !this.isInCodePanel) {
        this._yaw   -= dx * TOUCH_SENSITIVITY;
        this._pitch -= dy * TOUCH_SENSITIVITY;
        this._pitch  = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this._pitch));
        this.camera.rotation.y = this._yaw;
        this.camera.rotation.x = this._pitch;
      }
    }

    if (this.isInCodePanel) return;

    // ---- Movement ----
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

    const move = new THREE.Vector3();
    if (this.input.isForward())  move.addScaledVector(forward,  1);
    if (this.input.isBackward()) move.addScaledVector(forward, -1);
    if (this.input.isLeft())     move.addScaledVector(right,   -1);
    if (this.input.isRight())    move.addScaledVector(right,    1);

    const joyMag = Math.min(1, Math.hypot(this.input.joystick.x, this.input.joystick.y));
    const speedScale = this.input._isMobile ? (joyMag || 1) : 1;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(C.PLAYER_SPEED * speedScale);
      this.velocity.x = move.x;
      this.velocity.z = move.z;
      this.isMoving = true;
    } else {
      this.isMoving = false;
    }

    // Friction
    const friction = Math.pow(FRICTION_EXP, delta);
    this.velocity.x *= friction;
    this.velocity.z *= friction;

    // Integrate position
    const pos = this.camera.position;
    pos.x += this.velocity.x * delta;
    pos.z += this.velocity.z * delta;
    pos.y  = C.PLAYER_EYE_HEIGHT;

    // Collision
    this.cm.resolve(pos, C.PLAYER_RADIUS);
    this.cm.clampToMap(pos);
  }
}
