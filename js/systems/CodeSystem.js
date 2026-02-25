import * as THREE from 'three';
import { INTERACT_RANGE, CODE_NOTE_BOB_SPEED, CODE_NOTE_BOB_AMP } from '../Constants.js';
import { gameState } from '../GameState.js';

class CodeNote {
  constructor(scene, position, code, team) {
    this.scene     = scene;
    this.code      = code;
    this.team      = team;    // 'friendly' | 'enemy'
    this.collected = false;
    this._time     = Math.random() * Math.PI * 2;

    const color = team === 'friendly' ? 0xffcc00 : 0xff6633;

    const geo = new THREE.PlaneGeometry(0.55, 0.38);
    const mat = new THREE.MeshLambertMaterial({
      map: this._makeCodeTexture(code, team),
      emissive: color,
      emissiveIntensity: 0.6,
      side: THREE.DoubleSide,
      transparent: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.mesh.position.y = 1.3;
    scene.add(this.mesh);

    this.light = new THREE.PointLight(color, 1.8, 8);
    this.light.position.copy(this.mesh.position);
    scene.add(this.light);
  }

  _makeCodeTexture(code, team) {
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 176;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = team === 'friendly' ? '#fffde7' : '#fff0e7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = team === 'friendly' ? '#e6b800' : '#cc4400';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    ctx.fillStyle = '#888';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    const label = team === 'friendly' ? 'YOUR DEFUSE CODE' : 'ENEMY CODE';
    ctx.fillText(label, canvas.width / 2, 44);

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 58);
    ctx.lineTo(canvas.width - 20, 58);
    ctx.stroke();

    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 72px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(code, canvas.width / 2, 138);

    return new THREE.CanvasTexture(canvas);
  }

  update(delta) {
    this._time += delta * CODE_NOTE_BOB_SPEED;
    const y = 1.3 + Math.sin(this._time) * CODE_NOTE_BOB_AMP;
    this.mesh.position.y = y;
    this.mesh.rotation.y += delta * 1.2;
    this.light.position.copy(this.mesh.position);
  }

  collect() {
    this.collected = true;
    this.scene.remove(this.mesh);
    this.scene.remove(this.light);
    this.mesh.geometry.dispose();
    if (this.mesh.material.map) this.mesh.material.map.dispose();
    this.mesh.material.dispose();
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
    this.friendlyCodes = [];  // codes from friendly team — used to defuse TEAM bomb
    this.enemyCodes    = [];  // codes from enemy team
    this.collectedCodes = []; // all collected codes (compat)
    this._compassEl = null;
  }

  placeNote(position, code, team = 'friendly') {
    if (!gameState.is('HIDE') && !gameState.is('MAIN')) return;
    const note = new CodeNote(this.scene, position, code, team);
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

    const prompt = document.getElementById('interactPrompt');

    if (nearest && nearestDist < INTERACT_RANGE) {
      if (prompt) {
        prompt.classList.remove('hidden');
        prompt._bombPrompt = false;
        prompt.textContent = '[E] Pick up ' + (nearest.team === 'friendly' ? 'your' : 'enemy') + ' code note';
      }
      if (inputManager.isInteract()) {
        this._collectNote(nearest);
      }
    } else {
      if (prompt && !prompt._bombPrompt) prompt.classList.add('hidden');
    }

    this._updateCompass(nearest, nearestDist, playerPos);
  }

  _updateCompass(nearest, nearestDist, playerPos) {
    if (!this._compassEl) {
      this._compassEl = document.getElementById('noteCompass');
    }
    const el = this._compassEl;
    if (!el) return;

    // Only point to uncollected FRIENDLY notes (that's the player's objective)
    const nearestFriendly = this.notes
      .filter(n => !n.collected && n.team === 'friendly')
      .reduce((best, n) => {
        const d = n.distanceTo(playerPos);
        return (!best || d < best.dist) ? { note: n, dist: d } : best;
      }, null);

    if (!nearestFriendly) {
      el.classList.add('hidden');
      return;
    }

    el.classList.remove('hidden');
    const dx = nearestFriendly.note.mesh.position.x - playerPos.x;
    const dz = nearestFriendly.note.mesh.position.z - playerPos.z;
    this._nearestDx   = dx;
    this._nearestDz   = dz;
    this._nearestDist = Math.round(nearestFriendly.dist);
  }

  updateCompassAngle(cameraYaw) {
    const el = this._compassEl || document.getElementById('noteCompass');
    if (!el || !this._nearestDx) return;

    const worldAngle = Math.atan2(this._nearestDx, this._nearestDz);
    const relAngle   = worldAngle - cameraYaw;
    el.style.transform = `translateX(-50%) rotate(${relAngle}rad)`;

    const distEl = document.getElementById('noteCompassDist');
    if (distEl) distEl.textContent = this._nearestDist + 'm';
  }

  _collectNote(note) {
    note.collect();
    if (note.team === 'friendly') {
      this.friendlyCodes.push(note.code);
    } else {
      this.enemyCodes.push(note.code);
    }
    this.collectedCodes.push(note.code);
    this._showCodePopup(note.code, note.team);
    this._updateCodesPanel();
  }

  _showCodePopup(code, team) {
    const notif = document.getElementById('notification');
    if (!notif) return;
    const label  = team === 'friendly' ? 'YOUR CODE FOUND' : 'ENEMY CODE FOUND';
    const hint   = team === 'friendly'
      ? 'Walk to YOUR bomb (south) and press E to defuse it'
      : 'Enemy code — not needed for your objective';
    notif.innerHTML = `${label}: <strong style="letter-spacing:6px;font-size:20px;">${code}</strong><br><span style="font-size:11px;color:#aaa;">${hint}</span>`;
    notif.classList.remove('hidden');
    clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => notif.classList.add('hidden'), 10000);
  }

  _updateCodesPanel() {
    const panel = document.getElementById('codesPanel');
    const list  = document.getElementById('codesList');
    if (!panel || !list) return;
    panel.classList.remove('hidden');
    const items = this.notes
      .filter(n => n.collected)
      .map(n => `<div style="color:${n.team === 'friendly' ? '#ffe066' : '#ff9944'}">${n.code} <span style="font-size:9px;letter-spacing:2px;opacity:0.7">${n.team === 'friendly' ? 'YOURS' : 'ENEMY'}</span></div>`);
    list.innerHTML = items.join('');
  }

  reset() {
    for (const note of this.notes) {
      if (!note.collected) note.collect();
    }
    this.notes = [];
    this.friendlyCodes  = [];
    this.enemyCodes     = [];
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
