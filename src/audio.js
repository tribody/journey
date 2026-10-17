/* =====================================================================
 * 声音：全部用 WebAudio 程序化合成，没有任何音频文件
 *   · BGM —— 苏格兰民谣《斯凯岛船歌》(The Skye Boat Song)：
 *            G 大调、6/8、慢速。一条像木管 / 口哨的旋律线，
 *            铺在风笛式的 G–D 持续低音（drone）上，整体过一条程序化混响。
 *            旋律逐音核对过多个谱源（trillian MIT 的 ABC、8notes、
 *            Fiddler's Companion、口琴谱），见下方 MELODY。
 *   · 音效 —— 解锁 / 翻回忆的铃音
 * ===================================================================== */

/* —— 音名 → 频率（A4 = 440Hz，十二平均律） —— */
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = (name) => {
  const m = /^([A-G])(#?)(-?\d)$/.exec(name);
  const midi = SEMI[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
};

/* —— 一个八分音符的时长（秒）。6/8 拍：附点四分 = 3 个八分 ≈ 1.11s ≈ ♩54 —— */
const EIGHTH = 0.37;

/* —— 《斯凯岛船歌》主旋律：G 大调、6/8、无弱起。
 *    每项为 [音名, 时值(以八分音符计)]。
 *    四句共 14 小节 = 84 个八分音符；第三句与第一句同旋律。 —— */
const MELODY = [
  // ① "Speed, bonnie boat, like a bird on the wing" —— 4 小节
  ['D4', 3], ['E4', 1], ['D4', 2],
  ['G4', 4], ['G4', 1], ['G4', 1],
  ['A4', 3], ['B4', 1], ['A4', 2],
  ['D5', 6],
  // ② "Onward! the sailors cry" —— 3 小节
  ['B4', 3], ['A4', 1], ['B4', 2],
  ['E4', 4], ['E4', 2],
  ['D4', 6],
  // ③ 与 ① 同旋律（"Carry the lad that's born to be King"）—— 4 小节
  ['D4', 3], ['E4', 1], ['D4', 2],
  ['G4', 4], ['G4', 1], ['G4', 1],
  ['A4', 3], ['B4', 1], ['A4', 2],
  ['D5', 6],
  // ④ "Over the sea to Skye" —— 3 小节（与 ② 同，只把末音落在 G4）
  ['B4', 3], ['A4', 1], ['B4', 2],
  ['E4', 4], ['E4', 2],
  ['G4', 6],
];
const LOOP = MELODY.reduce((s, [, e]) => s + e, 0) * EIGHTH;   // 一遍曲子 = 84 个八分

const MASTER_ON = 0.40;

export class Audio {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.started = false;
    this.drone = null;    // 风笛式持续低音（一直在底下垫着）
    this._bus = null;     // 所有乐音的汇合点
    this._master = null;  // 总音量（静音按钮就作用在这一级）
    this._vib = null;     // 旋律共用的颤动信号源
    this._next = 0;       // 下一遍曲子开始调度的时刻
    this._timer = null;
  }

  /** 程序化混响脉冲响应：一段按指数衰减的噪声（不引入任何音频文件） */
  _makeIR(ctx, dur, decay) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this._master = master;

    // 混响：给"夜里的空气"一点尾巴
    const conv = ctx.createConvolver();
    conv.buffer = this._makeIR(ctx, 3.2, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.34;
    const dry = ctx.createGain();
    dry.gain.value = 0.75;
    conv.connect(wet).connect(master);
    dry.connect(master);

    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(dry);
    bus.connect(conv);
    this._bus = bus;

    /* —— 风笛式持续低音：G2 + D3 + G3，整首曲子一直垫在底下 ——
     * 苏格兰风笛的招牌就是"固定低音 + 旋律在上面走"。低音取 G–D（主音 + 五度），
     * 任何一句旋律压上来都是协和的；特意不用 A 音垫 —— 那会和旋律的 G / D 撞得很浑浊。 */
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 0.5;
    lp.connect(bus);

    const breeze = ctx.createOscillator();       // 极慢的滤波扫动：让低音像夜里的呼吸
    breeze.frequency.value = 0.04;
    const breezeAmt = ctx.createGain();
    breezeAmt.gain.value = 170;
    breeze.connect(breezeAmt).connect(lp.frequency);
    breeze.start();

    this.drone = [[98.00, 0.062, 'sine'], [146.83, 0.036, 'sine'], [196.00, 0.020, 'triangle']]
      .map(([f, v, type]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = v;
        o.connect(g).connect(lp);
        o.start();
        return o;
      });

    /* —— 旋律共用的颤动（vibrato）：5.4Hz、±2.6Hz。
     * 三角波直出会太"电子"，加上这点颤动 + 下面那个第二泛音，才像吹出来的木管 / 口哨。 */
    const vib = ctx.createGain();
    vib.gain.value = 2.6;
    const vibLfo = ctx.createOscillator();
    vibLfo.frequency.value = 5.4;
    vibLfo.connect(vib);
    vibLfo.start();
    this._vib = vib;

    return ctx;
  }

  /** 必须在用户手势里调用（点「开始」时）—— 否则浏览器不给放声音 */
  start() {
    const ctx = this._ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    this.started = true;
    const t = ctx.currentTime;
    this._master.gain.cancelScheduledValues(t);
    this._master.gain.setValueAtTime(this._master.gain.value, t);
    this._master.gain.linearRampToValueAtTime(this.on ? MASTER_ON : 0, t + 2.2);
    // 曲子从当前时刻开始往后排，避免把"过去"的音符一次性补出来
    this._next = t + 0.5;
    if (this._timer === null) this._timer = setInterval(() => this._tick(), 250);
  }

  toggle() {
    this.on = !this.on;
    if (!this.ctx || !this.started) return this.on;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this._master.gain.cancelScheduledValues(t);
    this._master.gain.setValueAtTime(this._master.gain.value, t);
    this._master.gain.linearRampToValueAtTime(this.on ? MASTER_ON : 0, t + 0.7);
    return this.on;
  }

  /** 前瞻式调度器：每 250ms 往前看 1.5s，需要时把下一遍曲子整段铺出去 */
  _tick() {
    const ctx = this.ctx;
    if (!ctx || !this.started || !this.on) return;
    const now = ctx.currentTime;
    if (this._next < now) this._next = now + 0.2;     // 静音久了 / 标签页被节流 → 重新对齐
    const ahead = now + 1.5;
    while (this._next < ahead) {
      this._song(this._next);
      this._next += LOOP;
    }
  }

  /** 排一遍完整旋律：一条带颤动的木管音色 + 一点点第二泛音 */
  _song(t0) {
    const ctx = this.ctx, bus = this._bus, vib = this._vib;
    let t = t0;
    for (const [name, e] of MELODY) {
      const dur = e * EIGHTH;
      const f = hz(name);
      const atk = Math.min(0.055, dur * 0.3);      // 起音：吹奏需要一点气声时间
      const rel = Math.min(0.16, dur * 0.35);      // 收音：留一点点尾，但音符之间要断开

      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      vib.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.058, t + atk);
      g.gain.setValueAtTime(0.058, t + dur - rel);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur - 0.012);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + dur);

      const h = ctx.createOscillator();            // 第二泛音：让音色更像木管，不那么"电"
      h.type = 'sine';
      h.frequency.value = f * 2;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.0001, t);
      hg.gain.linearRampToValueAtTime(0.019, t + atk);
      hg.gain.setValueAtTime(0.019, t + dur - rel);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + dur - 0.012);
      h.connect(hg).connect(bus);
      h.start(t);
      h.stop(t + dur);

      t += dur;
    }
  }

  /** 小铃音 */
  ping(base = 880, dur = 0.9, vol = 0.075) {
    if (!this.on) return;
    const ctx = this._ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    for (const [mul, v] of [[1, 1], [2.01, 0.42], [3.03, 0.2]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  unlock() {
    this.ping(523.25, 1.5, 0.09);
    setTimeout(() => this.ping(783.99, 1.7, 0.07), 140);
    setTimeout(() => this.ping(1046.5, 2.0, 0.055), 300);
  }

  openNode() { this.ping(659.25, 1.0, 0.06); }
  complete() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      setTimeout(() => this.ping(f, 2.2, 0.07), i * 170));
  }
}
