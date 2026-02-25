import * as THREE from 'three';

// AABB-based collision. All static geometry registers Box3 objects here.
// resolve() pushes a sphere (player/bot) out of all registered boxes.

export class CollisionMap {
  constructor() {
    this.boxes = [];        // Array<THREE.Box3>
    this.wallMeshes = [];   // Array<THREE.Mesh> — used by LOS raycaster
    this._mapW = 60;
    this._mapD = 80;
  }

  setMapDimensions(w, d) {
    this._mapW = w;
    this._mapD = d;
  }

  reset() {
    this.boxes = [];
    this.wallMeshes = [];
  }

  addBox(box3) {
    this.boxes.push(box3);
  }

  addMesh(mesh) {
    this.wallMeshes.push(mesh);
  }

  // Build a Box3 from a mesh and register both
  registerMesh(mesh) {
    // Force matrix update so rotated meshes (arc segments) compute correctly
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.boxes.push(box);
    this.wallMeshes.push(mesh);
  }

  // Push a sphere (center, radius) out of all boxes.
  // Modifies position in-place. Returns position.
  resolve(position, radius) {
    const sphere = new THREE.Sphere(position.clone(), radius);

    for (const box of this.boxes) {
      // Find closest point on box to sphere center
      const closest = new THREE.Vector3();
      closest.copy(sphere.center).clamp(box.min, box.max);

      const dist = sphere.center.distanceTo(closest);
      if (dist < sphere.radius) {
        // Push direction
        const push = new THREE.Vector3().subVectors(sphere.center, closest);
        if (push.lengthSq() < 0.00001) {
          // Center is inside box — push in X or Z whichever is shorter
          const cx = Math.min(
            Math.abs(sphere.center.x - box.min.x),
            Math.abs(sphere.center.x - box.max.x)
          );
          const cz = Math.min(
            Math.abs(sphere.center.z - box.min.z),
            Math.abs(sphere.center.z - box.max.z)
          );
          if (cx < cz) {
            push.set(sphere.center.x < (box.min.x + box.max.x) * 0.5 ? -1 : 1, 0, 0);
          } else {
            push.set(0, 0, sphere.center.z < (box.min.z + box.max.z) * 0.5 ? -1 : 1);
          }
          push.normalize().multiplyScalar(sphere.radius + 0.01);
        } else {
          push.normalize().multiplyScalar(sphere.radius - dist + 0.01);
          push.y = 0; // keep on ground
        }
        sphere.center.add(push);
      }
    }

    position.x = sphere.center.x;
    position.z = sphere.center.z;
    return position;
  }

  // Keep position within map bounds (uses stored dimensions if none passed)
  clampToMap(position, mapW, mapD, margin = 0.5) {
    const w = mapW !== undefined ? mapW : this._mapW;
    const d = mapD !== undefined ? mapD : this._mapD;
    position.x = Math.max(margin, Math.min(w - margin, position.x));
    position.z = Math.max(margin, Math.min(d - margin, position.z));
  }
}
