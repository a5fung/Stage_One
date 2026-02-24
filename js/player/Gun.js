import * as THREE from 'three';
import * as C from '../Constants.js';

// Gun view model — rendered in its own scene with a second camera.
// This prevents the gun from clipping through world geometry.

export class Gun {
  constructor(renderer) {
    this.renderer = renderer;

    this.ammo    = C.MAG_SIZE;
    this.maxAmmo = C.MAG_SIZE;
    this.reloading    = false;
    this.reloadTimer  = 0;
    this.muzzleTimer  = 0;

    // Second scene and camera for gun
    this.gunScene  = new THREE.Scene();
    this.gunCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 10);

    this._buildGunModel();

    // Muzzle flash light
    this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 1.5);
    this.muzzleLight.position.set(0.3, 1.5, -0.9);
    this.gunScene.add(this.muzzleLight);

    window.addEventListener('resize', () => {
      this.gunCamera.aspect = window.innerWidth / window.innerHeight;
      this.gunCamera.updateProjectionMatrix();
    });
  }

  _buildGunModel() {
    const metalMat  = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const darkMat   = new THREE.MeshLambertMaterial({ color: 0x222222 });

    // Gun positioned bottom-right of view
    // Receiver body
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 0.40), metalMat);
    receiver.position.set(0.26, 1.46, -0.55);

    // Barrel
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.30), darkMat);
    barrel.position.set(0.26, 1.50, -0.80);

    // Handle / grip
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.10), metalMat);
    handle.position.set(0.26, 1.32, -0.50);

    // Slide (top)
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.34), darkMat);
    slide.position.set(0.26, 1.54, -0.55);

    // Muzzle flash (initially invisible)
    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffdd88 })
    );
    this.muzzleFlash.position.set(0.26, 1.50, -0.97);
    this.muzzleFlash.visible = false;

    this.gunGroup = new THREE.Group();
    this.gunGroup.add(receiver, barrel, handle, slide, this.muzzleFlash);
    this.gunScene.add(this.gunGroup);

    // Ambient light for gun scene
    this.gunScene.add(new THREE.AmbientLight(0xffffff, 1.0));
  }

  fire() {
    if (this.reloading || this.ammo <= 0) return false;
    this.ammo--;
    this.muzzleTimer = 0.08;
    return true;
  }

  startReload() {
    if (this.reloading || this.ammo === this.maxAmmo) return;
    this.reloading   = true;
    this.reloadTimer = C.RELOAD_TIME;
  }

  update(delta, isMoving, time) {
    // Reload countdown
    if (this.reloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.ammo = this.maxAmmo;
        this.reloading = false;
      }
    }

    // Muzzle flash
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= delta;
      this.muzzleFlash.visible = true;
      this.muzzleLight.intensity = 2.0;
    } else {
      this.muzzleFlash.visible = false;
      this.muzzleLight.intensity = 0;
    }

    // Weapon bob while moving
    const bobY = isMoving ? Math.sin(time * 9.0) * 0.012 : 0;
    const bobX = isMoving ? Math.cos(time * 4.5) * 0.006 : 0;
    this.gunGroup.position.set(bobX, bobY, 0);

    // Sway gun down while reloading
    if (this.reloading) {
      const progress = 1 - (this.reloadTimer / C.RELOAD_TIME);
      const swayDown = Math.sin(progress * Math.PI) * 0.08;
      this.gunGroup.position.y -= swayDown;
    }
  }

  render() {
    this.renderer.clearDepth();
    this.renderer.render(this.gunScene, this.gunCamera);
  }

  reset() {
    this.ammo = this.maxAmmo;
    this.reloading = false;
    this.reloadTimer = 0;
    this.muzzleTimer = 0;
    this.muzzleFlash.visible = false;
    this.muzzleLight.intensity = 0;
  }
}
