// States: MENU → HIDE → MAIN → END
// Singleton — import and use anywhere

class GameStateManager {
  constructor() {
    this.state = 'MENU';
    this._listeners = {};
  }

  is(s) { return this.state === s; }

  transition(newState) {
    const prev = this.state;
    this.state = newState;
    console.log(`[GameState] ${prev} → ${newState}`);
    if (this._listeners[newState]) {
      this._listeners[newState].forEach(fn => fn(prev));
    }
  }

  on(state, fn) {
    if (!this._listeners[state]) this._listeners[state] = [];
    this._listeners[state].push(fn);
  }
}

export const gameState = new GameStateManager();
