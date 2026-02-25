import * as THREE from 'three';
import * as C from '../Constants.js';

// Builds all static map geometry and registers it with CollisionMap.
// Returns { scene meshes added, wallMeshes[] for LOS }

const GRAY  = new THREE.MeshLambertMaterial({ color: 0x888888 });
const FLOOR_MAT = new THREE.MeshLambertMaterial({ color: 0xdddddd });
const DARK  = new THREE.MeshLambertMaterial({ color: 0x555555 });

export class MapBuilder {
  constructor(scene, collisionMap) {
    this.scene = scene;
    this.cm = collisionMap;
    this.wallMeshes = [];
    this.nonWallMeshes = [];  // floor, ceiling — need cleanup on stage switch
  }

  build() {
    this.cm.setMapDimensions(C.MAP_WIDTH, C.MAP_DEPTH);
    this._buildFloor();
    this._buildOuterWalls();
    this._buildArcWall(30, 15, Math.PI, true);   // player-side arc (concave, opens toward Z+)
    this._buildArcWall(30, 65, 0,       true);   // enemy-side arc (concave, opens toward Z-)
    this._buildPillar();
    this._buildBoxObstacles();
    this._buildCorridors();
  }

  _addWall(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.cm.registerMesh(mesh);
    this.wallMeshes.push(mesh);
  }

  _buildFloor() {
    const geo = new THREE.PlaneGeometry(C.MAP_WIDTH, C.MAP_DEPTH);
    const mesh = new THREE.Mesh(geo, FLOOR_MAT);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(C.MAP_WIDTH / 2, 0, C.MAP_DEPTH / 2);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.nonWallMeshes.push(mesh);

    // Ceiling (same dims, flipped)
    const ceilGeo = new THREE.PlaneGeometry(C.MAP_WIDTH, C.MAP_DEPTH);
    const ceil = new THREE.Mesh(ceilGeo, new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.BackSide }));
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.set(C.MAP_WIDTH / 2, C.WALL_HEIGHT, C.MAP_DEPTH / 2);
    this.scene.add(ceil);
    this.nonWallMeshes.push(ceil);
  }

  _buildOuterWalls() {
    const W = C.MAP_WIDTH;
    const D = C.MAP_DEPTH;
    const H = C.WALL_HEIGHT;
    const T = 0.5; // thickness

    // South wall (Z=0)
    this._addWall(this._box(W, H, T, W/2, H/2, T/2));
    // North wall (Z=D)
    this._addWall(this._box(W, H, T, W/2, H/2, D - T/2));
    // West wall (X=0)
    this._addWall(this._box(T, H, D, T/2, H/2, D/2));
    // East wall (X=W)
    this._addWall(this._box(T, H, D, W - T/2, H/2, D/2));
  }

  // Build a semi-circular arc wall approximated by ARC_SEGMENTS flat segments.
  // centerX, centerZ = center of the full circle
  // startAngle = angle at which the arc begins (Math.PI = south-facing arc)
  _buildArcWall(centerX, centerZ, startAngle) {
    const seg = C.ARC_SEGMENTS;
    const r   = C.ARC_RADIUS;
    const H   = C.WALL_HEIGHT;
    const T   = 0.6;  // wall segment thickness

    const arcSpan = Math.PI; // half circle
    const dAngle  = arcSpan / seg;

    for (let i = 0; i < seg; i++) {
      const angle = startAngle + dAngle * (i + 0.5);
      const x = centerX + r * Math.cos(angle);
      const z = centerZ + r * Math.sin(angle);

      // Segment width = chord length between adjacent points
      const a1 = startAngle + dAngle * i;
      const a2 = startAngle + dAngle * (i + 1);
      const p1x = centerX + r * Math.cos(a1);
      const p1z = centerZ + r * Math.sin(a1);
      const p2x = centerX + r * Math.cos(a2);
      const p2z = centerZ + r * Math.sin(a2);
      const chordLen = Math.sqrt((p2x-p1x)**2 + (p2z-p1z)**2) + 0.05;

      const seg_mesh = this._box(chordLen, H, T, x, H/2, z);
      // Rotate to face tangent direction
      seg_mesh.rotation.y = -angle;
      this._addWall(seg_mesh);
    }
  }

  _buildPillar() {
    // Central cylinder pillar approximated by 8-sided prism
    const r = C.PILLAR_RADIUS;
    const H = C.WALL_HEIGHT;
    const cx = C.MAP_WIDTH / 2;
    const cz = C.MAP_DEPTH / 2;

    const sides = 8;
    const angle_step = (Math.PI * 2) / sides;
    for (let i = 0; i < sides; i++) {
      const angle = angle_step * (i + 0.5);
      const px = cx + r * Math.cos(angle);
      const pz = cz + r * Math.sin(angle);
      const a1 = angle_step * i;
      const a2 = angle_step * (i + 1);
      const p1x = cx + r * Math.cos(a1);
      const p1z = cz + r * Math.sin(a1);
      const p2x = cx + r * Math.cos(a2);
      const p2z = cz + r * Math.sin(a2);
      const chord = Math.sqrt((p2x-p1x)**2 + (p2z-p1z)**2) + 0.05;

      const seg = this._box(chord, H, 0.5, px, H/2, pz);
      seg.rotation.y = -angle;
      this._addWall(seg);
    }
  }

  _buildBoxObstacles() {
    // 8 box obstacles in mid zone
    const boxes = [
      { x: 12, z: 28, w: 4, d: 2 },
      { x: 48, z: 28, w: 4, d: 2 },
      { x: 20, z: 38, w: 2, d: 4 },
      { x: 40, z: 38, w: 2, d: 4 },
      { x: 15, z: 50, w: 4, d: 2 },
      { x: 45, z: 50, w: 4, d: 2 },
      { x: 24, z: 62, w: 3, d: 3 },
      { x: 36, z: 62, w: 3, d: 3 },
    ];

    for (const b of boxes) {
      const m = this._box(b.w, C.WALL_HEIGHT, b.d, b.x, C.WALL_HEIGHT/2, b.z);
      this._addWall(m);
    }
  }

  _buildCorridors() {
    // Left corridor: X=5-10, Z=15-65 — walls on left and right of corridor
    // Right corridor: X=50-55, Z=15-65
    const H = C.WALL_HEIGHT;
    const corrLen = 50;
    const corrZ = 40;
    const T = 0.5;

    // Left corridor walls
    this._addWall(this._box(T, H, corrLen, 5,  H/2, corrZ));
    this._addWall(this._box(T, H, corrLen, 10, H/2, corrZ));

    // Right corridor walls
    this._addWall(this._box(T, H, corrLen, 50, H/2, corrZ));
    this._addWall(this._box(T, H, corrLen, 55, H/2, corrZ));
  }

  // Helper: make a BoxGeometry mesh at position
  _box(w, h, d, x, y, z) {
    const geo  = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, GRAY.clone());
    mesh.position.set(x, y, z);
    return mesh;
  }
}
