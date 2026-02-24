import * as THREE from 'three';
import { gameState } from '../GameState.js';
import { BULLET_DAMAGE } from '../Constants.js';

const HIT_MARKER_DURATION = 0.15;

export class ShootingSystem {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene  = scene;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 80;

    this._hitMarkerTimer = 0;
    this._hitMarkerEl = document.getElementById('hitMarker');

    this._impactPool = [];
  }

  // Returns true if a bot was hit
  shoot(botMeshes, wallMeshes, botManager) {
    if (!gameState.is('MAIN')) return false;

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    // Collect all bot mesh descendants for hit testing
    const testTargets = [];
    for (const mesh of botMeshes) {
      testTargets.push(mesh);
      mesh.traverse(c => { if (c !== mesh) testTargets.push(c); });
    }

    const botHits = this.raycaster.intersectObjects(testTargets, false);
    if (botHits.length > 0) {
      const hit = botHits[0];
      // Walk up to find the bot group
      let obj = hit.object;
      let bot = botManager.getBotFromMesh(obj);
      // Try ancestors
      while (!bot && obj.parent) {
        obj = obj.parent;
        bot = botManager.getBotFromMesh(obj);
      }
      if (bot && !bot.dead) {
        bot.takeDamage(BULLET_DAMAGE);
        this._flashHitMarker();
        this._spawnImpact(hit.point);
        return true;
      }
    }

    // Check walls for impact sparks
    const wallHits = this.raycaster.intersectObjects(wallMeshes, false);
    if (wallHits.length > 0) {
      this._spawnImpact(wallHits[0].point);
    }

    return false;
  }

  _flashHitMarker() {
    this._hitMarkerTimer = HIT_MARKER_DURATION;
    if (this._hitMarkerEl) this._hitMarkerEl.classList.remove('hidden');
  }

  _spawnImpact(point) {
    const geo = new THREE.SphereGeometry(0.04, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);
    this._impactPool.push(mesh);

    setTimeout(() => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }, 400);

    // Limit pool size
    if (this._impactPool.length > 20) {
      const old = this._impactPool.shift();
      this.scene.remove(old);
    }
  }

  update(delta) {
    if (this._hitMarkerTimer > 0) {
      this._hitMarkerTimer -= delta;
      if (this._hitMarkerTimer <= 0) {
        if (this._hitMarkerEl) this._hitMarkerEl.classList.add('hidden');
      }
    }
  }
}
