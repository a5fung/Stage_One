import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as C from '../Constants.js';
import { gameState } from '../GameState.js';

const MOUSE_SENSITIVITY   = 0.002;
const TOUCH_SENSITIVITY   = 0.005;
const FRICTION_EXP        = 0.001;   // velocity multiplier per second via pow(FRICTION, delta)

export class Player {
  constructor(scene, camera, inputManager, collisionMap) {
    this.scene    = scene;
    this.camera   = camera;
    this.input    = inputManager;
    this.cm       = collisionMap;

    this.hp       = C.PLAYER_HP;
    this.maxHp    = C.PLAYER_HP;
    this.dead     = false;

    this.velocity = new THREE.Vector3();
    this.isMoving = false;

    // Separate yaw/pitch for mobile (no pointer lock)
    this._yaw   = 0;
    this._pitch = 0;

    // Set up PointerLockControls (desktop)
    this.controls = new PointerLockControls(camera, document.body);
    scene.add(this.controls.object);

    // Sync yaw/pitch from controls on mouse move
    this.controls.addEventListener('change', () => {
      this._syncYawPitch();
    });

    // Pointer lock events
    this._locked = false;
    document.addEventListener('pointerlockchange', () => {
      this._locked = !!document.pointerLockElement;
    });

    // Position camera at player spawn
    const spawn = new THREE.Vector3(30, C.PLAYER_EYE_HEIGHT, 8);
    this.controls.object.position.copy(spawn);

    this.isInCodePanel = false;
    this.time = 0;
  }

  get position() { return this.controls.object.position; }

  requestLock() { this.controls.lock(); }
  unlock()      { this.controls.unlock(); }
  get locked()  { return this._locked; }

  _syncYawPitch() {
    // Extract euler from camera quaternion
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this._yaw   = euler.y;
    this._pitch = euler.x;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.dead = true;
      gameState.transition('END');
    }
    // Flash vignette
    const v = document.getElementById('damageVignette');
    if (v) {
      v.classList.add('flash');
      setTimeout(() => v.classList.remove('flash'), 200);
    }
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  reset() {
    this.hp = this.maxHp;
    this.dead = false;
    this.velocity.set(0, 0, 0);
    this.controls.object.position.set(30, C.PLAYER_EYE_HEIGHT, 8);
    this._yaw = 0;
    this._pitch = 0;
    this.camera.quaternion.set(0, 0, 0, 1);
    this.isInCodePanel = false;
  }

  update(delta) {
    if (this.dead) return;
    if (!gameState.is('MAIN') && !gameState.is('HIDE')) return;

    this.time += delta;

    const inp = this.input;

    // ---- Look (mouse, desktop) ----
    if (this._locked && !this.isInCodePanel) {
      // PointerLockControls handles mouse rotation internally.
      // We just sync yaw/pitch for the touch path below.
      this._syncYawPitch();
    }

    // ---- Look (touch, mobile) ----
    // PointerLockControls nests camera inside a yaw object.
    // On mobile we rotate yaw object for horizontal, camera for vertical.
    if (!this._locked) {
      if (Math.abs(inp.lookDelta.x) > 0 || Math.abs(inp.lookDelta.y) > 0) {
        this._yaw   -= inp.lookDelta.x * TOUCH_SENSITIVITY;
        this._pitch -= inp.lookDelta.y * TOUCH_SENSITIVITY;
        this._pitch  = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this._pitch));
        // Yaw → the outer controls.object
        this.controls.object.rotation.y = this._yaw;
        // Pitch → the camera's local rotation (it's a child of controls.object)
        this.camera.rotation.x = this._pitch;
      }
    }

    if (this.isInCodePanel) return;

    // ---- Movement ----
    const speed = C.PLAYER_SPEED;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

    const move = new THREE.Vector3();

    if (inp.isForward())  move.addScaledVector(forward,  1);
    if (inp.isBackward()) move.addScaledVector(forward, -1);
    if (inp.isLeft())     move.addScaledVector(right,   -1);
    if (inp.isRight())    move.addScaledVector(right,    1);

    // Joystick magnitude for speed scaling
    const joyMag = Math.min(1, Math.sqrt(inp.joystick.x**2 + inp.joystick.y**2));
    const speedScale = this.input._isMobile ? (joyMag || 1) : 1;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * speedScale);
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

    // Move
    const pos = this.controls.object.position;
    pos.x += this.velocity.x * delta;
    pos.z += this.velocity.z * delta;

    // Lock Y
    pos.y = C.PLAYER_EYE_HEIGHT;

    // Collision
    this.cm.resolve(pos, C.PLAYER_RADIUS);
    this.cm.clampToMap(pos, 60, 80);
  }

  // Returns forward direction (horizontal) for shooting
  getForwardDir() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }
}
