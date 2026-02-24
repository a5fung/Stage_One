import * as THREE from 'three';
import { INTERACT_RANGE, CODE_NOTE_BOB_SPEED, CODE_NOTE_BOB_AMP } from '../Constants.js';
import { gameState } from '../GameState.js';

class CodeNote {
  constructor(scene, position, code) {
    this.scene     = scene;
    this.code      = code;
    this.collected = false;
    this._time     = Math.random() * Math.PI * 2;

    // Large, bright card — visible from a distance
    const geo  = new THREE.PlaneGeometry(0.55, 0.38);
    const mat  = new THREE.MeshLambertMaterial({
      color: 0xffee44,
      emissive: 0xffcc00,
      emissiveIntensity: 1.2,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.mesh.position.y = 1.3;
    scene.add(this.mesh);

    // Vertical beacon column so it's visible from across the map
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 4.0, 6);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffdd00,
      transparent: true,
      opacity: 0.35,
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.position.copy(position);
    this.beam.position.y = 2.5;
    scene.add(this.beam);

    // Bright glow light — visible from further away
    this.light = new THREE.PointLight(0xffcc00, 1.8, 8);
    this.light.position.copy(this.mesh.position);
    scene.add(this.light);
  }

  update(delta) {
    this._time += delta * CODE_NOTE_BOB_SPEED;
    const y = 1.3 + Math.sin(this._time) * CODE_NOTE_BOB_AMP;
    this.mesh.position.y = y;
    this.mesh.rotation.y += delta * 1.2;
    this.light.position.copy(this.mesh.position);

    // Pulse the beam opacity
    this.beam.material.opacity = 0.2 + Math.abs(Math.sin(this._time * 0.8)) * 0.3;
  }

  collect() {
    this.collected = true;
    this.scene.remove(this.mesh);
    this.scene.remove(this.beam);
    this.scene.remove(this.light);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.beam.geometry.dispose();
    this.beam.material.dispose();
  }

  distanceTo(pos) {
    const dx = this.mesh.position.x - pos.x;
    const dz = this.mesh.position.z - pos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}

export class CodeSystem {
  constructor(scene) {
    this.scene = scene;
    this.notes = [];
    this.collectedCodes = [];
    this._compassEl = null; // set in init
  }

  placeNote(position, code) {
    if (!gameState.is('HIDE') && !gameState.is('MAIN')) return;
    const note = new CodeNote(this.scene, position, code);
    this.notes.push(note);
  }

  update(delta, playerPos, inputManager) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const note of this.notes) {
      if (note.collected) continue;
      note.update(delta);
      const d = note.distanceTo(playerPos);
      if (d < nearestDist) { nearestDist = d; nearest = note; }
    }

    // Interact prompt
    const prompt = document.getElementById('interactPrompt');
    const uncollected = this.notes.filter(n => !n.collected);

    if (nearest && nearestDist < INTERACT_RANGE) {
      if (prompt) {
        prompt.classList.remove('hidden');
        prompt._bombPrompt = false;
        prompt.textContent = '[E] Pick up code note';
      }
      if (inputManager.isInteract()) {
        this._collectNote(nearest);
      }
    } else {
      if (prompt && !prompt._bombPrompt) prompt.classList.add('hidden');
    }

    // Compass arrow pointing to nearest uncollected note
    this._updateCompass(nearest, nearestDist, playerPos);
  }

  _updateCompass(nearest, nearestDist, playerPos) {
    if (!this._compassEl) {
      this._compassEl = document.getElementById('noteCompass');
    }
    const el = this._compassEl;
    if (!el) return;

    if (!nearest) {
      el.classList.add('hidden');
      return;
    }

    // Always show compass when there are uncollected notes
    el.classList.remove('hidden');

    const dx = nearest.mesh.position.x - playerPos.x;
    const dz = nearest.mesh.position.z - playerPos.z;
    const dist = Math.round(nearestDist);

    // We store the world-space angle; rotation applied in Player update via camera yaw
    // Here we just store dx/dz for main.js to compute screen angle
    this._nearestDx = dx;
    this._nearestDz = dz;
    this._nearestDist = dist;
  }

  // Called from main.js each frame with player camera yaw
  updateCompassAngle(cameraYaw) {
    const el = this._compassEl || document.getElementById('noteCompass');
    if (!el || !this._nearestDx) return;

    // World angle to note
    const worldAngle = Math.atan2(this._nearestDx, this._nearestDz);
    // Relative to camera yaw
    const relAngle = worldAngle - cameraYaw;
    el.style.transform = `translateX(-50%) rotate(${relAngle}rad)`;

    const distEl = document.getElementById('noteCompassDist');
    if (distEl) distEl.textContent = this._nearestDist + 'm';
  }

  _collectNote(note) {
    note.collect();
    this.collectedCodes.push(note.code);
    this._showCodePopup(note.code);
    this._updateCodesPanel();
  }

  _showCodePopup(code) {
    const notif = document.getElementById('notification');
    if (!notif) return;
    notif.innerHTML = `CODE FOUND: <strong style="letter-spacing:6px;font-size:20px;">${code}</strong><br><span style="font-size:11px;color:#aaa;">Walk to enemy bomb (north) and press E</span>`;
    notif.classList.remove('hidden');
    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => notif.classList.add('hidden'), 10000);
  }

  _updateCodesPanel() {
    const panel = document.getElementById('codesPanel');
    const list  = document.getElementById('codesList');
    if (!panel || !list) return;
    panel.classList.remove('hidden');
    list.innerHTML = this.collectedCodes.map(c => `<div>${c}</div>`).join('');
  }

  reset() {
    for (const note of this.notes) {
      if (!note.collected) note.collect();
    }
    this.notes = [];
    this.collectedCodes = [];
    this._nearestDx = 0;
    this._nearestDz = 0;
    this._nearestDist = 0;
    const panel = document.getElementById('codesPanel');
    if (panel) panel.classList.add('hidden');
    const compass = document.getElementById('noteCompass');
    if (compass) compass.classList.add('hidden');
  }
}
