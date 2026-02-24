// Single source of truth for all input (keyboard, mouse, touch)
// Other systems read from this — they never add their own event listeners

export class InputManager {
  constructor() {
    // Keyboard state
    this.keys = {};

    // Mouse
    this.mouseDelta = { x: 0, y: 0 };
    this._mouseDeltaAccum = { x: 0, y: 0 };
    this.mouseButtons = { left: false, right: false };
    this.leftClickFired = false;   // single-shot per press

    // Touch / mobile joystick
    this.joystick = { x: 0, y: 0 };         // normalised -1..1
    this.lookDelta = { x: 0, y: 0 };        // touch look delta per frame
    this._lookDeltaAccum = { x: 0, y: 0 };
    this.fireTapped = false;
    this.interactTapped = false;
    this.reloadTapped = false;

    // Suppress game input when typing code
    this.suppressGame = false;

    this._isMobile = false;

    this._init();
  }

  _init() {
    // ---- Keyboard ----
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      this.keys[e.key]  = true;
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
      this.keys[e.key]  = false;
    });

    // ---- Mouse move ----
    document.addEventListener('mousemove', e => {
      this._mouseDeltaAccum.x += e.movementX;
      this._mouseDeltaAccum.y += e.movementY;
    });

    // ---- Mouse buttons ----
    document.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouseButtons.left = true; this.leftClickFired = true; }
      if (e.button === 2) this.mouseButtons.right = true;
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseButtons.left = false;
      if (e.button === 2) this.mouseButtons.right = false;
    });

    // ---- Touch joystick (left side) ----
    this._setupJoystick();

    // ---- Touch look zone (right side) ----
    this._setupLookZone();

    // ---- Mobile buttons ----
    this._setupMobileButtons();

    // Detect touch device — just set the flag, HUD controls visibility
    window.addEventListener('touchstart', () => {
      this._isMobile = true;
    }, { once: true });
  }

  _setupJoystick() {
    const zone = document.getElementById('joystickZone');
    const thumb = document.getElementById('joystickThumb');
    if (!zone || !thumb) return;

    const BASE_RADIUS = 55;
    let activeTouchId = null;
    let originX = 0, originY = 0;

    const onStart = e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      activeTouchId = t.identifier;
      const rect = zone.getBoundingClientRect();
      originX = rect.left + rect.width / 2;
      originY = rect.top + rect.height / 2;
      updateThumb(t.clientX, t.clientY);
    };

    const onMove = e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === activeTouchId) {
          updateThumb(t.clientX, t.clientY);
          break;
        }
      }
    };

    const onEnd = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === activeTouchId) {
          activeTouchId = null;
          this.joystick.x = 0;
          this.joystick.y = 0;
          thumb.style.left = '50%';
          thumb.style.top = '50%';
          break;
        }
      }
    };

    const updateThumb = (cx, cy) => {
      let dx = cx - originX;
      let dy = cy - originY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > BASE_RADIUS) {
        dx = dx / dist * BASE_RADIUS;
        dy = dy / dist * BASE_RADIUS;
      }
      this.joystick.x = dx / BASE_RADIUS;
      this.joystick.y = dy / BASE_RADIUS;
      const base = document.getElementById('joystickBase');
      const bRect = base.getBoundingClientRect();
      thumb.style.left = (50 + (dx / bRect.width) * 100) + '%';
      thumb.style.top  = (50 + (dy / bRect.height) * 100) + '%';
    };

    zone.addEventListener('touchstart', onStart, { passive: false });
    zone.addEventListener('touchmove',  onMove,  { passive: false });
    zone.addEventListener('touchend',   onEnd,   { passive: false });
    zone.addEventListener('touchcancel',onEnd,   { passive: false });
  }

  _setupLookZone() {
    const zone = document.getElementById('lookZone');
    if (!zone) return;

    const touches = {};

    zone.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        touches[t.identifier] = { x: t.clientX, y: t.clientY };
      }
    }, { passive: false });

    zone.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (touches[t.identifier]) {
          const prev = touches[t.identifier];
          this._lookDeltaAccum.x += (t.clientX - prev.x);
          this._lookDeltaAccum.y += (t.clientY - prev.y);
          touches[t.identifier] = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    zone.addEventListener('touchend', e => {
      for (const t of e.changedTouches) delete touches[t.identifier];
    }, { passive: false });

    zone.addEventListener('touchcancel', e => {
      for (const t of e.changedTouches) delete touches[t.identifier];
    }, { passive: false });
  }

  _setupMobileButtons() {
    const bind = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => {
        e.preventDefault();
        this[prop] = true;
      }, { passive: false });
      el.addEventListener('touchend', e => {
        e.preventDefault();
      }, { passive: false });
    };

    const fireBtn = document.getElementById('fireBtn');
    if (fireBtn) {
      fireBtn.addEventListener('touchstart', e => {
        e.preventDefault();
        this.fireTapped = true;
        this.leftClickFired = true;
        this.mouseButtons.left = true;
      }, { passive: false });
      fireBtn.addEventListener('touchend', e => {
        e.preventDefault();
        this.mouseButtons.left = false;
      }, { passive: false });
    }

    const interactBtn = document.getElementById('interactBtn');
    if (interactBtn) {
      interactBtn.addEventListener('touchstart', e => {
        e.preventDefault();
        this.interactTapped = true;
      }, { passive: false });
      interactBtn.addEventListener('touchend', e => { e.preventDefault(); }, { passive: false });
    }

    const reloadBtn = document.getElementById('reloadBtn');
    if (reloadBtn) {
      reloadBtn.addEventListener('touchstart', e => {
        e.preventDefault();
        this.reloadTapped = true;
      }, { passive: false });
      reloadBtn.addEventListener('touchend', e => { e.preventDefault(); }, { passive: false });
    }
  }

  // Call once per frame at the START — returns accumulated deltas and clears them
  flush() {
    this.mouseDelta.x = this._mouseDeltaAccum.x;
    this.mouseDelta.y = this._mouseDeltaAccum.y;
    this._mouseDeltaAccum.x = 0;
    this._mouseDeltaAccum.y = 0;

    this.lookDelta.x = this._lookDeltaAccum.x;
    this.lookDelta.y = this._lookDeltaAccum.y;
    this._lookDeltaAccum.x = 0;
    this._lookDeltaAccum.y = 0;
  }

  // Call AFTER consuming single-shot flags
  clearSingleShot() {
    this.leftClickFired = false;
    this.fireTapped = false;
    this.interactTapped = false;
    this.reloadTapped = false;
  }

  isMoving() {
    return this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD'] ||
           this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight'] ||
           Math.abs(this.joystick.x) > 0.05 || Math.abs(this.joystick.y) > 0.05;
  }

  isForward()  { return this.keys['KeyW'] || this.keys['ArrowUp']    || this.joystick.y < -0.2; }
  isBackward() { return this.keys['KeyS'] || this.keys['ArrowDown']  || this.joystick.y >  0.2; }
  isLeft()     { return this.keys['KeyA'] || this.keys['ArrowLeft']  || this.joystick.x < -0.2; }
  isRight()    { return this.keys['KeyD'] || this.keys['ArrowRight'] || this.joystick.x >  0.2; }
  isReload()   { return this.keys['KeyR'] || this.reloadTapped; }
  isInteract() { return this.keys['KeyE'] || this.interactTapped; }
}
