import { gameState } from '../GameState.js';

export class HUD {
  constructor() {
    this.els = {
      topHud:      document.getElementById('topHud'),
      bottomHud:   document.getElementById('bottomHud'),
      crosshair:   document.getElementById('crosshair'),
      hitMarker:   document.getElementById('hitMarker'),
      teamTime:    document.getElementById('teamBombTime'),
      enemyTime:   document.getElementById('enemyBombTime'),
      teamTimer:   document.getElementById('teamBombTimer'),
      enemyTimer:  document.getElementById('enemyBombTimer'),
      hpFill:      document.getElementById('hpFill'),
      hpNum:       document.getElementById('hpNum'),
      ammoCount:   document.getElementById('ammoCount'),
      phaseTimer:  document.getElementById('phaseTimer'),
      interactPrompt: document.getElementById('interactPrompt'),
      menuScreen:  document.getElementById('menuScreen'),
      endScreen:   document.getElementById('endScreen'),
      endTitle:    document.getElementById('endTitle'),
      endSubtitle: document.getElementById('endSubtitle'),
      phaseBanner: document.getElementById('phaseBanner'),
      notification:document.getElementById('notification'),
      mobileControls: document.getElementById('mobileControls'),
    };

    this._prevHp   = -1;
    this._prevAmmo = -1;
    this._prevTeamTime  = '';
    this._prevEnemyTime = '';
  }

  showMenu() {
    this.els.menuScreen.classList.remove('hidden');
    this.els.topHud.classList.add('hidden');
    this.els.bottomHud.classList.add('hidden');
    this.els.crosshair.classList.add('hidden');
    this.els.endScreen.classList.add('hidden');
  }

  showGame() {
    this.els.menuScreen.classList.add('hidden');
    this.els.topHud.classList.remove('hidden');
    this.els.bottomHud.classList.remove('hidden');
    this.els.crosshair.classList.remove('hidden');
    // Show mobile controls if on a touch device
    if (window.matchMedia('(pointer: coarse)').matches) {
      if (this.els.mobileControls) this.els.mobileControls.classList.remove('hidden');
    }
  }

  showEnd(reason) {
    this.els.endScreen.classList.remove('hidden');
    this.els.topHud.classList.add('hidden');
    this.els.bottomHud.classList.add('hidden');
    this.els.crosshair.classList.add('hidden');
    if (this.els.mobileControls) this.els.mobileControls.classList.add('hidden');

    const win = reason === 'WIN_DEFUSE' || reason === 'WIN_TIMER';
    this.els.endTitle.textContent = win ? 'VICTORY' : 'DEFEAT';
    this.els.endTitle.style.color = win ? '#4af' : '#f44';

    const messages = {
      'WIN_DEFUSE':   'Enemy bomb defused.',
      'WIN_TIMER':    'Enemy bomb timer expired.',
      'LOSE_EXPLODE': 'Your team\'s bomb exploded.',
      'LOSE_DEFUSED': 'Enemy agent defused your bomb.',
      'LOSE_DEAD':    'You were eliminated.',
    };
    this.els.endSubtitle.textContent = messages[reason] || '';
  }

  showBanner(text, duration = 3000) {
    const b = this.els.phaseBanner;
    b.textContent = text;
    b.classList.remove('hidden');
    // Reset animation
    b.style.animation = 'none';
    b.offsetHeight; // force reflow
    b.style.animation = '';
    setTimeout(() => b.classList.add('hidden'), duration);
  }

  showHideTimer(seconds) {
    const el = this.els.phaseTimer;
    el.classList.remove('hidden');
    el.textContent = `HIDE PHASE  ${Math.ceil(seconds)}s`;
    if (seconds <= 0) el.classList.add('hidden');
  }

  hidePhaseTimer() {
    this.els.phaseTimer.classList.add('hidden');
  }

  update(delta, player, bombSystem) {
    // HP
    if (player.hp !== this._prevHp) {
      this._prevHp = player.hp;
      const pct = player.hp / player.maxHp * 100;
      this.els.hpFill.style.width = pct + '%';
      this.els.hpFill.style.background = pct > 50 ? '#4af' : pct > 25 ? '#fa4' : '#f44';
      this.els.hpNum.textContent = player.hp;
    }

    // Ammo
    if (player._gun) {
      const ammo = player._gun.reloading ? 'RLD' : player._gun.ammo;
      if (ammo !== this._prevAmmo) {
        this._prevAmmo = ammo;
        this.els.ammoCount.textContent = ammo;
      }
    }

    // Bomb timers
    if (bombSystem && bombSystem.active) {
      const tt = bombSystem.formatTime(bombSystem.teamTimer);
      const et = bombSystem.formatTime(bombSystem.enemyTimer);

      if (tt !== this._prevTeamTime) {
        this._prevTeamTime = tt;
        this.els.teamTime.textContent = tt;
        const pulse = bombSystem.teamTimer < 30;
        this.els.teamTimer.classList.toggle('pulse', pulse);
      }
      if (et !== this._prevEnemyTime) {
        this._prevEnemyTime = et;
        this.els.enemyTime.textContent = et;
        const pulse = bombSystem.enemyTimer < 30;
        this.els.enemyTimer.classList.toggle('pulse', pulse);
      }
    }
  }

  resetTimerDisplay() {
    this._prevTeamTime  = '';
    this._prevEnemyTime = '';
    this.els.teamTime.textContent  = '3:00';
    this.els.enemyTime.textContent = '3:00';
    this.els.teamTimer.classList.remove('pulse');
    this.els.enemyTimer.classList.remove('pulse');
  }
}
