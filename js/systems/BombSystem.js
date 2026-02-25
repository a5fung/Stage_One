import * as THREE from 'three';
import { BOMB_TIMER_DURATION, INTERACT_RANGE } from '../Constants.js';
import { gameState } from '../GameState.js';
import { TEAM_BOMB_POS, ENEMY_BOMB_POS } from '../world/SpawnPoints.js';

const BOMB_COLOR_IDLE    = 0x333333;
const BOMB_COLOR_ACTIVE  = 0xff4422;
const BOMB_COLOR_DEFUSED = 0x22cc44;
const BOMB_COLOR_EXPLODE = 0xff8800;

export class BombSystem {
  constructor(scene, codeSystem, botManager) {
    this.scene      = scene;
    this.codeSystem = codeSystem;
    this.botManager = botManager; // for kill counts in tiebreaker

    this.teamTimer  = BOMB_TIMER_DURATION;
    this.enemyTimer = BOMB_TIMER_DURATION;

    this.teamDefused   = false;
    this.enemyDefused  = false;
    this.teamExploded  = false;
    this.enemyExploded = false;

    this.active  = false;
    this._ended  = false;

    this._codeInputBuffer = [];
    this._codePanelOpen   = false;
    this._targetBomb      = null;

    this._playerRef   = null;
    this._controlsRef = null;

    this._buildBombMeshes();
    this._setupCodePanel();
  }

  _buildBombMeshes() {
    this._teamBombWorldPos  = TEAM_BOMB_POS.clone();
    this._enemyBombWorldPos = ENEMY_BOMB_POS.clone();
    this.teamBomb  = this._makeBombMesh(TEAM_BOMB_POS,  0x4488ff);
    this.enemyBomb = this._makeBombMesh(ENEMY_BOMB_POS, 0xff4422);
  }

  _makeBombMesh(position, color) {
    const group = new THREE.Group();

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.4, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    base.position.y = 0.2;

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.2, 0.05),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6 })
    );
    screen.position.set(0, 0.3, 0.21);

    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6),
      new THREE.MeshLambertMaterial({ color: 0x555555 })
    );
    ant.position.set(0.2, 0.55, 0);

    const light = new THREE.PointLight(color, 0.8, 4);
    light.position.set(0, 0.5, 0);

    group.add(base, screen, ant, light);
    group.position.copy(position);
    group._light  = light;
    group._screen = screen;

    this.scene.add(group);
    return group;
  }

  setRefs(player, controls) {
    this._playerRef   = player;
    this._controlsRef = controls;
  }

  // Call this when switching stages to move the bomb meshes
  setBombPositions(teamPos, enemyPos) {
    this._teamBombWorldPos  = teamPos.clone();
    this._enemyBombWorldPos = enemyPos.clone();
    this.teamBomb.position.copy(teamPos);
    this.enemyBomb.position.copy(enemyPos);
  }

  _setupCodePanel() {
    const panel = document.getElementById('codePanel');
    if (!panel) return;

    document.addEventListener('keydown', e => {
      if (!this._codePanelOpen) return;

      if (e.key === 'Escape') {
        this._closePanel();
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        if (this._codeInputBuffer.length < 4) {
          this._codeInputBuffer.push(e.key);
          this._updateCodeDisplay();
        }
      } else if (e.key === 'Backspace') {
        this._codeInputBuffer.pop();
        this._updateCodeDisplay();
      } else if (e.key === 'Enter') {
        this._submitCode();
      }
    });

    document.querySelectorAll('.numpad-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.digit;
        if (!this._codePanelOpen) return;
        if (d === 'clear') {
          this._codeInputBuffer.pop();
          this._updateCodeDisplay();
        } else if (d === 'enter') {
          this._submitCode();
        } else {
          if (this._codeInputBuffer.length < 4) {
            this._codeInputBuffer.push(d);
            this._updateCodeDisplay();
          }
        }
      });
    });
  }

  _openPanel(whichBomb) {
    this._codePanelOpen = true;
    this._targetBomb    = whichBomb;
    this._codeInputBuffer = [];
    this._updateCodeDisplay();

    document.getElementById('codePanel').classList.remove('hidden');
    document.getElementById('codeError').classList.add('hidden');

    if (this._controlsRef) this._controlsRef.unlock();
    if (this._playerRef) this._playerRef.isInCodePanel = true;
  }

  _closePanel() {
    this._codePanelOpen = false;
    document.getElementById('codePanel').classList.add('hidden');
    document.getElementById('codeError').classList.add('hidden');
    this._codeInputBuffer = [];

    if (this._playerRef) this._playerRef.isInCodePanel = false;

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    if (!isMobile) {
      const resumeHint = document.getElementById('notification');
      if (resumeHint) {
        resumeHint.textContent = 'Click to resume';
        resumeHint.classList.remove('hidden');
        const relockFn = () => {
          resumeHint.classList.add('hidden');
          if (this._controlsRef) this._controlsRef.lock();
          document.removeEventListener('click', relockFn);
        };
        document.addEventListener('click', relockFn);
      }
    }
  }

  _updateCodeDisplay() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`cd${i}`);
      if (el) {
        if (this._codeInputBuffer[i] !== undefined) {
          el.textContent = this._codeInputBuffer[i];
          el.classList.add('filled');
        } else {
          el.textContent = '_';
          el.classList.remove('filled');
        }
      }
    }
  }

  _submitCode() {
    if (this._codeInputBuffer.length < 4) return;
    const entered = this._codeInputBuffer.join('');

    // Only friendly codes work on the team bomb
    const valid = this.codeSystem.friendlyCodes.includes(entered);

    if (valid) {
      this._defuseTeamBombByPlayer();
    } else {
      this._showError();
    }
  }

  // Player successfully defused their own bomb — WIN
  _defuseTeamBombByPlayer() {
    this.teamDefused = true;
    this._closePanel();

    const screen = this.teamBomb._screen;
    screen.material.color.setHex(BOMB_COLOR_DEFUSED);
    screen.material.emissive.setHex(BOMB_COLOR_DEFUSED);
    this.teamBomb._light.color.setHex(BOMB_COLOR_DEFUSED);

    setTimeout(() => {
      if (this._ended) return;
      this._ended = true;
      window._endReason = 'WIN_DEFUSE';
      gameState.transition('END');
    }, 600);
  }

  // Enemy runner reached enemy bomb and defused it — player LOSES
  triggerEnemyBombDefused() {
    if (this.enemyDefused || this._ended) return;
    this.enemyDefused = true;
    const screen = this.enemyBomb._screen;
    screen.material.color.setHex(BOMB_COLOR_DEFUSED);
    screen.material.emissive.setHex(BOMB_COLOR_DEFUSED);
    this._ended = true;
    window._endReason = 'LOSE_DEFUSED';
    gameState.transition('END');
  }

  _showError() {
    const err = document.getElementById('codeError');
    if (err) {
      err.classList.remove('hidden');
      setTimeout(() => err.classList.add('hidden'), 1500);
    }
    const disp = document.getElementById('codeInputDisplay');
    if (disp) {
      disp.style.transform = 'translateX(-6px)';
      setTimeout(() => { disp.style.transform = 'translateX(6px)'; }, 80);
      setTimeout(() => { disp.style.transform = ''; }, 160);
    }
    this._codeInputBuffer = [];
    this._updateCodeDisplay();
  }

  start() {
    this.active = true;
    this._ended = false;
  }

  update(delta, playerPos, inputManager) {
    if (!this.active || this._ended) return;

    // --- Tick team timer ---
    if (!this.teamDefused && !this.teamExploded) {
      this.teamTimer -= delta;
      if (this.teamTimer <= 0) {
        this.teamTimer = 0;
        this.teamExploded = true;
        this._explode(this.teamBomb);
        if (this.enemyExploded) {
          // Both bombs exploded — kills tiebreaker
          this._killsTiebreaker();
        } else {
          this._ended = true;
          window._endReason = 'LOSE_EXPLODE';
          gameState.transition('END');
        }
        return;
      }
    }

    // --- Tick enemy timer ---
    if (!this.enemyDefused && !this.enemyExploded) {
      this.enemyTimer -= delta;
      if (this.enemyTimer <= 0) {
        this.enemyTimer = 0;
        this.enemyExploded = true;
        this._explode(this.enemyBomb);
        if (this.teamExploded) {
          this._killsTiebreaker();
        } else {
          this._ended = true;
          window._endReason = 'WIN_TIMER';
          gameState.transition('END');
        }
        return;
      }
    }

    // --- Animate bombs ---
    this._animateBomb(this.teamBomb,  this.teamTimer,  this.teamDefused,  this.teamExploded);
    this._animateBomb(this.enemyBomb, this.enemyTimer, this.enemyDefused, this.enemyExploded);

    // --- Check player proximity to TEAM bomb (their own bomb to defuse) ---
    if (!this.teamDefused && !this.teamExploded && !this._codePanelOpen) {
      const dx   = playerPos.x - this._teamBombWorldPos.x;
      const dz   = playerPos.z - this._teamBombWorldPos.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      const prompt = document.getElementById('interactPrompt');

      if (dist < INTERACT_RANGE) {
        if (prompt) {
          prompt.classList.remove('hidden');
          prompt._bombPrompt = true;
          prompt.textContent = '[E] Defuse YOUR bomb';
        }
        if (inputManager.isInteract() && gameState.is('MAIN')) {
          this._openPanel('team');
        }
      } else if (prompt && prompt._bombPrompt) {
        prompt._bombPrompt = false;
      }
    }
  }

  _killsTiebreaker() {
    this._ended = true;
    const kills = this.botManager ? this.botManager.getKillCounts() : { friendly: 0, enemy: 0 };
    window._killCounts = kills;
    window._endReason  = kills.friendly >= kills.enemy ? 'WIN_KILLS' : 'LOSE_KILLS';
    gameState.transition('END');
  }

  _animateBomb(bomb, timer, defused, exploded) {
    if (defused || exploded) return;
    const screen = bomb._screen;
    const speed  = timer < 30 ? 6 : timer < 120 ? 3 : 1;
    const pulse  = (Math.sin(Date.now() * 0.001 * speed) + 1) * 0.5;
    screen.material.emissiveIntensity = 0.3 + pulse * 0.5;
    bomb._light.intensity = 0.5 + pulse * 0.5;
  }

  _explode(bomb) {
    const screen = bomb._screen;
    screen.material.color.setHex(BOMB_COLOR_EXPLODE);
    screen.material.emissive.setHex(BOMB_COLOR_EXPLODE);
    screen.material.emissiveIntensity = 2;
    bomb._light.color.setHex(BOMB_COLOR_EXPLODE);
    bomb._light.intensity = 3;

    bomb.scale.setScalar(1);
    let t = 0;
    const expand = setInterval(() => {
      t += 0.05;
      bomb.scale.setScalar(1 + t * 2);
      if (t >= 1) clearInterval(expand);
    }, 50);
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  reset() {
    this.teamTimer  = BOMB_TIMER_DURATION;
    this.enemyTimer = BOMB_TIMER_DURATION;
    this.teamDefused   = false;
    this.enemyDefused  = false;
    this.teamExploded  = false;
    this.enemyExploded = false;
    this.active  = false;
    this._ended  = false;
    this._codePanelOpen   = false;
    this._codeInputBuffer = [];

    const resetBomb = (bomb, color) => {
      const screen = bomb._screen;
      screen.material.color.setHex(color);
      screen.material.emissive.setHex(color);
      screen.material.emissiveIntensity = 0.6;
      bomb._light.color.setHex(color);
      bomb._light.intensity = 0.8;
      bomb.scale.setScalar(1);
    };
    resetBomb(this.teamBomb,  0x4488ff);
    resetBomb(this.enemyBomb, 0xff4422);

    document.getElementById('codePanel').classList.add('hidden');
    document.getElementById('codeError').classList.add('hidden');
  }
}
