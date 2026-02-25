import * as THREE from 'three';

// Stage 2 — Food theme: 80×80 map
// Ice cream sandwich obstacles as main cover (left and right flanks)
// Ice cream scoop obstacles in the mid zone
// Pie bombs (built by BombSystem but we add decorative pie mesh here)

const MAP_W = 80;
const MAP_D = 80;
const WALL_H = 3.5;

const FLOOR_MAT  = new THREE.MeshLambertMaterial({ color: 0xe8f4e8 }); // light green floor
const OUTER_MAT  = new THREE.MeshLambertMaterial({ color: 0xdddddd });
const COOKIE_MAT = new THREE.MeshLambertMaterial({ color: 0x6b3a1f }); // dark chocolate cookie
const CREAM_MAT  = new THREE.MeshLambertMaterial({ color: 0xfff0e0 }); // vanilla cream

export class Stage2MapBuilder {
  constructor(scene, collisionMap) {
    this.scene = scene;
    this.cm    = collisionMap;
    this.wallMeshes = [];
    this.nonWallMeshes = [];  // floor, ceiling, chips — need cleanup on stage switch
  }

  build() {
    this.cm.setMapDimensions(MAP_W, MAP_D);
    this._buildFloor();
    this._buildOuterWalls();
    this._buildIceCreamSandwiches();
    this._buildIceCreamScoops();
    this._buildCentreBoxes();
  }

  _addWall(mesh) {
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.cm.registerMesh(mesh);
    this.wallMeshes.push(mesh);
  }

  _buildFloor() {
    const geo  = new THREE.PlaneGeometry(MAP_W, MAP_D);
    const mesh = new THREE.Mesh(geo, FLOOR_MAT);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(MAP_W / 2, 0, MAP_D / 2);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.nonWallMeshes.push(mesh);

    // Ceiling
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W, MAP_D),
      new THREE.MeshLambertMaterial({ color: 0xeef8ee, side: THREE.BackSide })
    );
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.set(MAP_W / 2, WALL_H, MAP_D / 2);
    this.scene.add(ceil);
    this.nonWallMeshes.push(ceil);
  }

  _buildOuterWalls() {
    const W = MAP_W, D = MAP_D, H = WALL_H, T = 0.5;
    this._addWall(this._box(W, H, T, W/2, H/2, T/2,      OUTER_MAT));
    this._addWall(this._box(W, H, T, W/2, H/2, D - T/2,  OUTER_MAT));
    this._addWall(this._box(T, H, D, T/2, H/2, D/2,      OUTER_MAT));
    this._addWall(this._box(T, H, D, W - T/2, H/2, D/2,  OUTER_MAT));
  }

  // Two large ice cream sandwiches — left (X≈12) and right (X≈68), spanning mid zone
  // Each sandwich: bottom cookie + cream filling + top cookie
  _buildIceCreamSandwiches() {
    const centers = [ { x: 12, z: 40 }, { x: 68, z: 40 } ];
    const sandW = 5;   // width in X (thickness of the wall)
    const sandD = 28;  // depth in Z (length of the obstacle)

    for (const c of centers) {
      // Bottom cookie
      const btm = this._box(sandW, 0.8, sandD, c.x, 0.4,  c.z, COOKIE_MAT.clone());
      this._addWall(btm);

      // Cream filling (slightly narrower)
      const fill = this._box(sandW - 0.4, 1.8, sandD - 0.4, c.x, 1.7, c.z, CREAM_MAT.clone());
      this._addWall(fill);

      // Top cookie
      const top = this._box(sandW, 0.8, sandD, c.x, 2.8, c.z, COOKIE_MAT.clone());
      this._addWall(top);

      // Chocolate chip dots on top cookie (decorative, no collision)
      for (let dz = -10; dz <= 10; dz += 4) {
        for (let dx = -1; dx <= 1; dx += 2) {
          const chip = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 6, 6),
            new THREE.MeshLambertMaterial({ color: 0x2a1005 })
          );
          chip.position.set(c.x + dx * 0.8, 3.25, c.z + dz);
          this.scene.add(chip);
          this.nonWallMeshes.push(chip);
        }
      }
    }
  }

  // Ice cream scoop obstacles — cheerful pastel blobs in the mid zone
  _buildIceCreamScoops() {
    const scoops = [
      { x: 30, z: 28, color: 0xff9ec4 },  // strawberry
      { x: 50, z: 28, color: 0x98e0b4 },  // mint
      { x: 25, z: 52, color: 0xffe0a0 },  // vanilla/caramel
      { x: 55, z: 52, color: 0xc4a0e8 },  // lavender
      { x: 40, z: 40, color: 0xffb37a },  // peach (center)
    ];

    for (const s of scoops) {
      this._buildScoop(s.x, s.z, s.color);
    }
  }

  _buildScoop(cx, cz, color) {
    const mat = new THREE.MeshLambertMaterial({ color });

    // Wafer cone base (dark tan cylinder)
    const coneH = 1.2;
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.5, coneH, 8),
      new THREE.MeshLambertMaterial({ color: 0xd4a84b })
    );
    cone.position.set(cx, coneH / 2, cz);
    this._addWall(cone);

    // Main scoop (sphere)
    const scoop1 = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), mat);
    scoop1.position.set(cx, coneH + 1.0, cz);
    this._addWall(scoop1);

    // Second smaller scoop on top
    const scoop2 = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshLambertMaterial({ color: this._lighten(color) }));
    scoop2.position.set(cx + 0.1, coneH + 2.4, cz - 0.1);
    this._addWall(scoop2);
  }

  _lighten(hex) {
    const r = Math.min(255, ((hex >> 16) & 0xff) + 40);
    const g = Math.min(255, ((hex >> 8)  & 0xff) + 40);
    const b = Math.min(255, ( hex        & 0xff) + 40);
    return (r << 16) | (g << 8) | b;
  }

  // A few extra boxes near base areas for cover
  _buildCentreBoxes() {
    const boxes = [
      { x: 40, z: 20, w: 3, d: 3, color: 0xffdd88 },
      { x: 40, z: 60, w: 3, d: 3, color: 0xffdd88 },
      { x: 22, z: 38, w: 2, d: 2, color: 0xffaa88 },
      { x: 58, z: 38, w: 2, d: 2, color: 0xffaa88 },
      { x: 22, z: 42, w: 2, d: 2, color: 0xffaa88 },
      { x: 58, z: 42, w: 2, d: 2, color: 0xffaa88 },
    ];
    for (const b of boxes) {
      const mat = new THREE.MeshLambertMaterial({ color: b.color });
      this._addWall(this._box(b.w, WALL_H, b.d, b.x, WALL_H / 2, b.z, mat));
    }
  }

  _box(w, h, d, x, y, z, mat) {
    const geo  = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat || OUTER_MAT.clone());
    mesh.position.set(x, y, z);
    return mesh;
  }
}
