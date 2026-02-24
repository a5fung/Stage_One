import * as THREE from 'three';
import { INTERACT_RANGE, CODE_NOTE_BOB_SPEED, CODE_NOTE_BOB_AMP } from '../Constants.js';
import { gameState } from '../GameState.js';

// Manages code notes placed by enemy bots during HIDE phase.
// Player finds notes by walking close and pressing E.

class CodeNote {
  constructor(scene, position, code) {
    this.scene    = scene;
    this.code     = code;
    this.collected= false;
    this._time    = Math.random() * Math.PI * 2;

    // White card mesh
    const geo = new THREE.PlaneGeometry(0.3, 0.2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffee,
      side: THREE.DoubleSide,
      emissive: 0xffffee,
    });
    // Use emissive with MeshLambertMaterial instead
    const mat2 = new THREE.MeshLambertMaterial({
      color: 0xffffee,
      emissive: 0xffffcc,
      emissiveIntensity: 0.6,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat2);
    this.mesh.position.copy(position);
    this.mesh.position.y = 1.0;
    scene.add(this.mesh);

    // Small glow light
    this.light = new THREE.PointLight(0xffffaa, 0.4, 3);
    this.light.position.copy(this.mesh.position);
    scene.add(this.light);
  }

  update(delta) {
    this._time += delta * CODE_NOTE_BOB_SPEED;
    this.mesh.position.y = 1.0 + Math.sin(this._time) * CODE_NOTE_BOB_AMP;
    this.mesh.rotation.y += delta * 0.8;
    this.light.position.copy(this.mesh.position);
  }

  collect() {
    this.collected = true;
    this.scene.remove(this.mesh);
    this.scene.remove(this.light);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  distanceTo(pos) {
    return this.mesh.position.distanceTo(pos);
  }
}

export class CodeSystem {
  constructor(scene) {
    this.scene = scene;
    this.notes = [];
    this.collectedCodes = [];
    this._hud  = null;  // set after HUD is created
  }

  // Called by BotManager when a bot places a note
  placeNote(position, code) {
    if (!gameState.is('HIDE') && !gameState.is('MAIN')) return;
    const note = new CodeNote(this.scene, position, code);
    this.notes.push(note);
  }

  // Called every frame — checks proximity to player
  update(delta, playerPos, inputManager) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const note of this.notes) {
      if (note.collected) continue;
      note.update(delta);
      const d = note.distanceTo(playerPos);
      if (d < nearestDist) { nearestDist = d; nearest = note; }
    }

    // Show interact prompt
    const prompt = document.getElementById('interactPrompt');
    if (nearest && nearestDist < INTERACT_RANGE) {
      if (prompt) {
        prompt.classList.remove('hidden');
        prompt.textContent = '[E] Pick up code note';
      }
      if (inputManager.isInteract()) {
        this._collectNote(nearest);
      }
    } else {
      // Only hide if BombSystem isn't showing its own prompt
      if (prompt && !prompt._bombPrompt) prompt.classList.add('hidden');
    }
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
    notif.innerHTML = `CODE FOUND: <strong style="letter-spacing:6px;font-size:20px;">${code}</strong><br><span style="font-size:11px;color:#aaa;">Use at enemy bomb to defuse</span>`;
    notif.classList.remove('hidden');
    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => notif.classList.add('hidden'), 8000);
  }

  _updateCodesPanel() {
    const panel = document.getElementById('codesPanel');
    const list  = document.getElementById('codesList');
    if (!panel || !list) return;

    if (this.collectedCodes.length > 0) {
      panel.classList.remove('hidden');
      list.innerHTML = this.collectedCodes.map(c => `<div>${c}</div>`).join('');
    }
  }

  getNoteMeshes() {
    return this.notes.filter(n => !n.collected).map(n => n.mesh);
  }

  reset() {
    for (const note of this.notes) {
      if (!note.collected) note.collect();
    }
    this.notes = [];
    this.collectedCodes = [];
    const panel = document.getElementById('codesPanel');
    if (panel) panel.classList.add('hidden');
  }
}
