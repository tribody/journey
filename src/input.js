/* =====================================================================
 * 输入：键盘（WASD / 方向键 / Shift / 空格 / E）+ 指针（环视拖拽）+ 触屏摇杆
 * ===================================================================== */
export class Input {
  constructor(opts = {}) {
    this.keys = new Set();
    this.joy = { active: false, x: 0, y: 0 };
    this.jumpQueued = false;
    this.boost = false;
    this.onLook = opts.onLook || (() => {});
    this.onZoom = opts.onZoom || (() => {});
    this.onInteract = opts.onInteract || (() => {});
    this.enabled = true;
    this.lookId = null;
    this.lastLook = { x: 0, y: 0 };

    addEventListener('keydown', (e) => this._down(e));
    addEventListener('keyup', (e) => this._up(e));
    addEventListener('blur', () => { this.keys.clear(); this.joy.active = false; });

    const canvas = opts.canvas;
    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => this._pdown(e));
      canvas.addEventListener('pointermove', (e) => this._pmove(e));
      canvas.addEventListener('pointerup', (e) => this._pup(e));
      canvas.addEventListener('pointercancel', (e) => this._pup(e));
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.onZoom(Math.sign(e.deltaY) * 0.9);
      }, { passive: false });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    // 触屏摇杆
    this.joyEl = typeof opts.joyEl === 'string' ? document.querySelector(opts.joyEl) : opts.joyEl;
    if (this.joyEl) this._initJoy();
    this.jumpEl = typeof opts.jumpEl === 'string' ? document.querySelector(opts.jumpEl) : opts.jumpEl;
    if (this.jumpEl) {
      this.jumpEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.jumpQueued = true;
      });
    }
  }

  _down(e) {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    this.keys.add(k);
    if (k === 'e') this.onInteract();
    if (k === 'escape') this.onInteract(-1);
    if (k === 'shift') this.boost = true;
    if (k === ' ') this.jumpQueued = true;
  }
  _up(e) {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === 'shift') this.boost = false;
  }

  _pdown(e) {
    if (!this.enabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.lookId = e.pointerId;
    this.lastLook = { x: e.clientX, y: e.clientY };
    this.moved = 0;
    e.target.setPointerCapture?.(e.pointerId);
  }
  _pmove(e) {
    if (this.lookId !== e.pointerId) return;
    const dx = e.clientX - this.lastLook.x;
    const dy = e.clientY - this.lastLook.y;
    this.lastLook = { x: e.clientX, y: e.clientY };
    this.moved += Math.abs(dx) + Math.abs(dy);
    if (this.enabled) this.onLook(dx, dy);
  }
  _pup(e) {
    if (this.lookId !== e.pointerId) return;
    this.lookId = null;
    if (this.moved < 6 && this.onTap) this.onTap({ x: e.clientX, y: e.clientY });
  }

  _initJoy() {
    const el = this.joyEl;
    const knob = el.querySelector('.joy__knob');
    let id = null;
    const R = 46;
    const rect = () => el.getBoundingClientRect();
    const move = (e) => {
      const r = rect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const cl = Math.min(1, d / R);
      dx = dx / d * cl; dy = dy / d * cl;
      this.joy.x = dx; this.joy.y = -dy;
      this.joy.active = true;
      knob.style.transform = `translate(${dx * R}px,${dy * R}px)`;
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      el.setPointerCapture(e.pointerId);
      move(e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.joy.active = false;
      this.joy.x = 0; this.joy.y = 0;
      knob.style.transform = 'translate(0,0)';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  get throttle() {
    if (!this.enabled) return 0;
    let t = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) t += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) t -= 1;
    if (this.joy.active && Math.abs(this.joy.y) > 0.12) t += this.joy.y;
    return Math.max(-1, Math.min(1, t));
  }

  /**
   * 转向：正 = 车头向左偏。
   * vehicle.js 里 `yaw += steer * ...`，而第三人称视角下 yaw 增大就是「向左偏」，
   * 所以左键 / 摇杆左推 → +1，右键 / 摇杆右推 → -1。
   */
  get steer() {
    if (!this.enabled) return 0;
    let s = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) s += 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) s -= 1;
    if (this.joy.active && Math.abs(this.joy.x) > 0.12) s -= this.joy.x;
    return Math.max(-1, Math.min(1, s));
  }

  get boosted() {
    return this.boost || this.keys.has('shift');
  }

  consumeJump() {
    if (this.jumpQueued) { this.jumpQueued = false; return true; }
    return false;
  }
}
