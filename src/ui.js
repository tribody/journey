/* =====================================================================
 * UI：加载 / 开场 / 口令门 / HUD / 回忆卡 / 相册 / 碑文 / 信 / 小地图 / 提示
 * ===================================================================== */
import { SECRET, OPENING, DICKENS, LETTER, CAT, MEMORIES, ALBUM, photoUrl } from './memories.js';
import { codeDigest } from './hash.js';
import { iconSpriteSvg } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/**
 * 图片取不到时自动重试（最多 tries 次，每次隔 260ms）。
 * 本地小服务器一次要并发拉几十张照片，偶尔会有一两张被拒（连接被重置），
 * 用手机走局域网看更容易出现；重试一下用户基本察觉不到。
 * 同一个 img 只会挂一个 error 监听，反复换 src（照片舞台）也不会堆监听。
 */
function loadImg(img, url, tries = 3) {
  img.dataset.retryUrl = url;
  img._retryLeft = tries;
  if (!img._retryHooked) {
    img._retryHooked = true;
    img.addEventListener('error', () => {
      if (!(img._retryLeft > 0)) return;
      img._retryLeft--;
      const u = img.dataset.retryUrl;
      if (!u) return;
      setTimeout(() => {
        img.src = `${u}${u.includes('?') ? '&' : '?'}r=${Date.now()}`;
      }, 260);
    });
  }
  img.src = url;
  return img;
}

export class UI {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.digits = '';
    this.wrong = 0;
    this.open = false;
    this.galleryOpen = false;
    this.panelList = [];

    // 注入图标精灵
    document.body.insertAdjacentHTML('afterbegin', iconSpriteSvg());

    this.loading = $('#loading');
    this.loadFill = $('#load-fill');
    this.loadPct = $('#load-pct');
    this.loadTip = $('#load-tip');
    this.intro = $('#intro');
    this.gate = $('#gate');
    this.gateDisplay = $('#gate-display');
    this.gateHint = $('#gate-hint');
    this.hud = $('#hud');
    this.prompt = $('#prompt');
    this.nextUp = $('#next-up');
    this.panel = $('#panel');
    this.panelCard = $('#panel-card');
    this.panelBody = $('#panel-body');
    this.toastEl = $('#toast');
    this.curtain = $('#curtain');
    this.flashEl = $('#flash');
    this.minimap = $('#minimap');

    $('#btn-start').addEventListener('click', () => this.hooks.onStart?.());
    this._buildGateDisplay();
    $('#keypad').addEventListener('click', (e) => {
      const b = e.target.closest('.key');
      if (b) this.pressKey(b.dataset.key);
    });
    addEventListener('keydown', (e) => this._gateKeys(e));

    $('#btn-album').addEventListener('click', () => this.openByKey('album'));
    $('#btn-letter').addEventListener('click', () => this.openByKey('home'));
    $('#btn-gallery')?.addEventListener('click', () => this.openGallery());
    $('#btn-help').addEventListener('click', () => this.openHelp());
    $('#btn-audio').addEventListener('click', (e) => {
      const on = this.hooks.onToggleAudio?.();
      $('#btn-audio').classList.toggle('is-off', on === false);
      $('#btn-audio').innerHTML = `<svg class="ic"><use href="#i-${on === false ? 'mute' : 'music'}"/></svg><span>声音</span>`;
      e.currentTarget.blur();
    });

    this.panel.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.close();
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.close();
    });
    $('#panel-card').addEventListener('scroll', () => {});
    this.panelBody.addEventListener('scroll', () => this.panelBody.scrollTop = this.panelBody.scrollTop);
  }

  /* ---------------- 加载 ---------------- */
  setProgress(p, tip) {
    const v = Math.round(Math.max(0, Math.min(1, p)) * 100);
    this.loadFill.style.width = v + '%';
    this.loadPct.textContent = v + '%';
    if (tip) this.loadTip.textContent = tip;
  }
  hideLoading() {
    this.loading.classList.add('is-hidden');
    setTimeout(() => this.loading.remove(), 700);
  }

  /* ---------------- 开场 ---------------- */
  showIntro() {
    this.intro.classList.remove('is-hidden');
  }
  hideIntro() {
    this.intro.classList.add('is-hidden');
  }

  /* ---------------- 口令门 ---------------- */
  _buildGateDisplay() {
    const layout = [0, 1, 2, 3, 'dot', 4, 5, 'dot', 6, 7];
    this.gateDisplay.innerHTML = layout
      .map(t => t === 'dot' ? '<span class="cell dot">.</span>' : '<span class="cell"></span>')
      .join('');
    this.cells = [...this.gateDisplay.querySelectorAll('.cell:not(.dot)')];
  }

  showGate() {
    this.gate.classList.remove('is-hidden');
    this.digits = '';
    this.wrong = 0;
    this.gateHint.textContent = '';
    this._paintGate();
    this._gateKeysBound = true;
  }
  hideGate() { this.gate.classList.add('is-hidden'); }

  _gateKeys(e) {
    if (this.gate.classList.contains('is-hidden')) return;
    if (/^[0-9]$/.test(e.key)) this.pressKey(e.key);
    else if (e.key === 'Backspace') this.pressKey('del');
    else if (e.key === 'Enter') this.pressKey('ok');
  }

  pressKey(k) {
    if (k === 'del') {
      this.digits = this.digits.slice(0, -1);
    } else if (k === 'ok') {
      if (this.digits.length < 8) {
        this.gateHint.textContent = '还差一点点……';
        return;
      }
      if (codeDigest(this.digits) === SECRET.codeHash) {
        this.gateHint.textContent = '门开了。';
        this.gateHint.style.color = '#d5ff95';
        this.hooks.onUnlock?.();
        return;
      }
      this.wrong++;
      this.gateDisplay.classList.add('wrong');
      setTimeout(() => this.gateDisplay.classList.remove('wrong'), 460);
      this.gateHint.style.color = '#ffc67b';
      this.gateHint.textContent = SECRET.hints[Math.min(this.wrong - 1, SECRET.hints.length - 1)];
      this.digits = '';
      setTimeout(() => this._paintGate(), 340);
      return;
    } else if (this.digits.length < 8) {
      this.digits += k;
    }
    this._paintGate();
  }

  _paintGate() {
    this.cells.forEach((c, i) => {
      c.textContent = this.digits[i] || '';
      c.classList.toggle('on', !!this.digits[i]);
      c.classList.toggle('now', i === this.digits.length);
    });
  }

  /* ---------------- HUD ---------------- */
  showHUD() { this.hud.classList.remove('is-hidden'); }
  setVisited(n, total, x, z) {
    $('#prog-fill').style.width = (n / total * 100) + '%';
    $('#prog-txt').textContent = `${n} / ${total} 段回忆`;
  }
  setPrompt(txt) {
    if (!txt) { this.prompt.classList.add('is-hidden'); return; }
    this.prompt.innerHTML = txt;
    this.prompt.classList.remove('is-hidden');
  }
  /** HUD 顶部那条「下一段」指引；传 null 就收起来 */
  setNext(html) {
    const n = this.nextUp;
    if (!n) return;
    if (!html) {
      if (n._html) { n._html = ''; n.innerHTML = ''; }
      n.classList.add('is-hidden');
      return;
    }
    if (n._html === html) return;      // 避免每帧重写 DOM
    n._html = html;
    n.innerHTML = html;
    n.classList.remove('is-hidden');
  }
  toast(msg, ms = 3200) {
    this.toastEl.innerHTML = msg;
    this.toastEl.classList.remove('is-hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.add('is-hidden'), ms);
  }
  curtainOn(on) { this.curtain.classList.toggle('is-on', on); }
  flash() {
    this.flashEl.classList.remove('is-on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('is-on');
  }

  /* ---------------- 面板 ---------------- */
  isPanelOpen() { return this.open; }

  close() {
    if (!this.open) return;
    this.open = false;
    this.galleryOpen = false;
    this.panel.classList.add('is-hidden');
    this.panelBody.innerHTML = '';
    this.panelCard.style.width = '';
    this.hooks.onClose?.();
  }

  _mount(html, wide) {
    this.panelBody.innerHTML = '';
    this.panelBody.appendChild(html);
    this.open = true;
    this.panel.classList.remove('is-hidden');
    this.panelBody.scrollTop = 0;
    if (wide === 'album') this.panelCard.style.width = 'min(1180px,95vw)';
    else this.panelCard.style.width = '';
  }

  openByKey(key) {
    const node = this._nodes?.[key];
    if (node) this.openNode(node);
    else if (key === 'album') this.openAlbum();
  }

  openNode(node) {
    if (node.kind === 'memory') return this.openMemory(node);
    if (node.kind === 'album') return this.openAlbum();
    if (node.kind === 'stone') return this.openStone();
    if (node.kind === 'cat') return this.openCat();
    if (node.kind === 'home') return this.openLetter();
  }

  /* ---- 回忆卡 ---- */
  openMemory(node) {
    const m = node.data;
    const wrap = el('div', 'm-grid');

    const media = el('div', 'm-media');
    if (m.photos && m.photos.length) {
      media.appendChild(this.buildStage(m.photos.map(p => ({ src: photoUrl(p.p), cap: p.cap }))));
    } else {
      media.appendChild(el('div', 'ph', `
        <svg class="ic ph__ic"><use href="#i-${m.icon}"/></svg>
        <div class="ph__date">${m.date}</div>
        <div class="ph__note">这一天的照片，我们留在心里</div>`));
    }

    const body = el('div', 'm-body', `
      <div class="m-date">${m.date}</div>
      <h2 class="m-title">${m.title}</h2>
      <div class="m-place"><svg class="ic"><use href="#i-compass"/></svg>${m.place}</div>
      <p class="m-text">${m.text}</p>
      <div class="m-rule"></div>
      <div class="m-sign">仙姑巴巴 记</div>`);

    wrap.append(media, body);
    this._mount(wrap);
    requestAnimationFrame(() => {
      this.panelBody.querySelectorAll('.stagebox img').forEach(i => { i.style.willChange = 'opacity'; });
    });
  }

  /* ---- 照片舞台 ---- */
  buildStage(list, start = 0) {
    const box = el('div', 'stagebox');
    const view = el('div', 'stagebox__view');
    const img = el('img');
    img.alt = '';
    img.draggable = false;      // 照片是私人回忆，不是素材：不要拖拽 / 另存 / 下载
    const cap = el('div', 'stagebox__cap');
    const count = el('div', 'stagebox__count');
    const prev = el('button', 'stagebox__nav stagebox__nav--prev', '<svg class="ic"><use href="#i-arrow"/></svg>');
    const next = el('button', 'stagebox__nav stagebox__nav--next', '<svg class="ic"><use href="#i-arrow"/></svg>');
    view.append(img, cap, count, prev, next);

    const thumbs = el('div', 'stagebox__thumbs');
    const thumbBtns = list.map((p, i) => {
      const b = el('button');
      const t = el('img');
      loadImg(t, p.thumb || p.src);
      t.alt = '';
      t.draggable = false;
      b.appendChild(t);
      b.addEventListener('click', () => go(i));
      thumbs.appendChild(b);
      return b;
    });

    // 照片只是"看"，不该有"下载"这个动作：屏蔽右键菜单（另存为 / 复制图片）与移动端长按保存
    view.addEventListener('contextmenu', (e) => e.preventDefault());
    box.append(view, thumbs);
    let idx = Math.max(0, Math.min(list.length - 1, start));

    const preload = (i) => {
      if (i < 0 || i >= list.length) return;
      const p = new Image();
      p.src = list[i].src;
    };
    function go(i) {
      idx = (i + list.length) % list.length;
      img.style.animation = 'none';
      void img.offsetWidth;
      loadImg(img, list[idx].src);
      img.style.animation = '';
      cap.textContent = list[idx].cap || '';
      count.textContent = `${idx + 1} / ${list.length}`;
      thumbBtns.forEach((b, k) => b.classList.toggle('on', k === idx));
      thumbBtns[idx]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      preload(idx + 1); preload(idx - 1);
    }
    prev.addEventListener('click', () => go(idx - 1));
    next.addEventListener('click', () => go(idx + 1));
    prev.disabled = next.disabled = list.length < 2;

    // 滑动
    let sx = 0, sy = 0, moved = false;
    view.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; moved = false; });
    view.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - sx) > 40 && Math.abs(e.clientY - sy) < 30) moved = true;
    });
    view.addEventListener('pointerup', (e) => {
      if (!moved) return;
      const dx = e.clientX - sx;
      if (dx < -40) go(idx + 1); else if (dx > 40) go(idx - 1);
    });

    const onKey = (e) => {
      if (!this.open) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      if (e.key === 'ArrowLeft') go(idx - 1);
    };
    addEventListener('keydown', onKey);

    if (list.length) go(start);
    return box;
  }

  /* ---- 回忆长廊（家里的那面墙） ---- */
  openGallery() {
    if (this.galleryOpen) return;
    this.galleryOpen = true;

    const wrap = el('div', 'gallery');
    wrap.appendChild(el('div', 'gal__head', `
      <div class="gal__kicker">回忆长廊</div>
      <h2 class="gal__title">从 2019 到现在</h2>
      <p class="gal__lead">${MEMORIES.length} 站，一站一天。路上捡到的那些，都在这里了。</p>`));

    const list = el('div', 'gal__list');
    MEMORIES.forEach((m, i) => {
      const node = this._nodes?.[m.id];
      const stop = el('button', 'gal__stop' + (i % 2 ? ' gal__stop--right' : ''));

      const media = el('div', 'gal__img');
      if (m.photos && m.photos.length) {
        const im = el('img');
        loadImg(im, photoUrl(m.photos[0].p, true));
        im.loading = 'lazy';
        im.alt = m.title;
        im.draggable = false;
        media.appendChild(im);
      } else {
        media.classList.add('gal__img--ph');
        media.innerHTML = `<svg class="ic"><use href="#i-${m.icon}"/></svg>`;
      }

      const card = el('div', 'gal__card', `
        <div class="gal__date">${m.date}</div>
        <div class="gal__name">${m.title}</div>
        <div class="gal__place"><svg class="ic"><use href="#i-compass"/></svg>${m.place}</div>
        <p class="gal__txt">${m.text}</p>`);
      card.prepend(media);

      stop.append(el('span', 'gal__dot', String(i + 1).padStart(2, '0')), card);
      stop.addEventListener('click', () => { if (node) this.openMemory(node); });
      list.appendChild(stop);
    });
    wrap.appendChild(list);

    // 长廊的尽头：仙姑守着的那封信
    const end = el('div', 'gal__end');
    end.appendChild(el('div', 'gal__cat', `
      <svg class="ic gal__catic"><use href="#i-cat"/></svg>
      <div class="gal__catname">${CAT.name}</div>
      <div class="gal__catrole">${CAT.role} · 2020.05.28 来到我们家</div>
      <div class="gal__catmsg">${CAT.text.join('<br>')}</div>`));
    const letter = el('button', 'gal__letter', '<svg class="ic"><use href="#i-letter"/></svg>读那封信');
    letter.addEventListener('click', () => this.openLetter());
    end.appendChild(letter);
    wrap.appendChild(end);

    this._mount(wrap, 'album');
    requestAnimationFrame(() => { this.panelBody.scrollTop = 0; });
  }

  /* ---- 相册 ---- */
  openAlbum() {
    const wrap = el('div', 'album');
    const head = el('div', 'album__head');
    head.append(
      el('h2', 'album__title', '相册'),
      el('div', 'album__cnt', `${ALBUM.length} 张 · 按拍摄时间`)
    );
    const grid = el('div', 'album__grid');
    ALBUM.forEach((p, i) => {
      const b = el('button');
      const im = el('img');
      loadImg(im, photoUrl(p.p, true));
      im.loading = 'lazy';
      im.alt = p.cap;
      im.draggable = false;
      b.append(im, el('span', '', p.cap));
      b.addEventListener('click', () => this.openAlbumDetail(i));
      grid.appendChild(b);
    });
    wrap.append(head, grid);
    this._mount(wrap, 'album');
  }

  openAlbumDetail(i) {
    const list = ALBUM.map(p => ({ src: photoUrl(p.p), thumb: photoUrl(p.p, true), cap: p.cap }));
    const wrap = el('div', 'album album__detail');
    const back = el('button', 'backbtn', '<svg class="ic"><use href="#i-arrow"/></svg>返回相册');
    back.addEventListener('click', () => this.openAlbum());
    const stage = this.buildStage(list, i);
    stage.style.minHeight = '62vh';
    wrap.append(back, stage);
    this._mount(wrap, 'album');
    requestAnimationFrame(() => this.panelBody.scrollTop = 0);
  }

  /* ---- 碑文 ---- */
  openStone() {
    const wrap = el('div', 'sheet');
    wrap.innerHTML = `
      <svg class="ic sheet__ic"><use href="#i-compass"/></svg>
      <h2 class="sheet__title">${DICKENS.title}</h2>
      <div class="sheet__sub">Charles Dickens · ${DICKENS.year}</div>
      <p class="sheet__quote">${DICKENS.quote}</p>
      <div class="sheet__lines">
        ${DICKENS.after.map(t => `<p>${t}</p>`).join('')}
      </div>
      <div class="sheet__sign">—— 仙姑巴巴</div>`;
    this._mount(wrap);
  }

  /* ---- 信 ---- */
  openLetter() {
    const wrap = el('div', 'sheet');
    wrap.innerHTML = `
      <svg class="ic sheet__ic"><use href="#i-letter"/></svg>
      <h2 class="sheet__title">写给你的信</h2>
      <div class="sheet__sub">${LETTER.from} → ${LETTER.to}</div>
      <div class="sheet__lines">
        ${LETTER.body.map(t => t ? `<p>${t}</p>` : '<div style="height:6px"></div>').join('')}
      </div>
      <div class="sheet__sign">${LETTER.sign}</div>
      <div class="sheet__meta">${SECRET.display} — 今天</div>`;
    this._mount(wrap);
  }

  /* ---- 仙姑 ---- */
  openCat() {
    const wrap = el('div', 'sheet');
    wrap.innerHTML = `
      <svg class="ic sheet__ic"><use href="#i-cat"/></svg>
      <h2 class="sheet__title">${CAT.name}</h2>
      <div class="sheet__sub">${CAT.role} · 2020.05.28 来到我们家</div>
      <div class="sheet__lines">
        ${CAT.text.map(t => `<p class="mut">${t}</p>`).join('')}
      </div>
      <div class="sheet__sign">仙姑巴巴 &amp; 仙姑麻麻</div>`;
    this._mount(wrap);
  }

  /* ---- 玩法 ---- */
  openHelp() {
    const wrap = el('div', 'sheet');
    wrap.innerHTML = `
      <svg class="ic sheet__ic"><use href="#i-car"/></svg>
      <h2 class="sheet__title">怎么逛这座岛</h2>
      <div class="sheet__sub">Somewhere only we know</div>
      <div class="help__list">
        <div><svg class="ic"><use href="#i-car"/></svg><p><b>开车</b>：电脑用 W A S D 或方向键，Shift 加速，空格起跳；手机拖左下摇杆。</p></div>
        <div><svg class="ic"><use href="#i-compass"/></svg><p><b>环视</b>：在画面上按住拖动可以转视角，滚轮缩放；手机直接滑动屏幕。</p></div>
        <div><svg class="ic"><use href="#i-star"/></svg><p><b>回忆</b>：${MEMORIES.length} 段回忆按时间串成一颗心。<b>开卡车撞上那根发亮的光柱</b>才能翻开这一天，撞错顺序只会提醒你。</p></div>
        <div><svg class="ic"><use href="#i-album"/></svg><p><b>相册</b>：右上角「相册」里放着没归到具体日子的照片。</p></div>
        <div><svg class="ic"><use href="#i-letter"/></svg><p><b>我们的家</b>：岛上正中间那间亮着灯的房子。${MEMORIES.length} 段都点亮之后把车开进院子，会放烟花，然后自动展开「回忆长廊」。</p></div>
        <div><svg class="ic"><use href="#i-key"/></svg><p><b>钥匙</b>：进门的密码，是我们在一起的那一天。</p></div>
      </div>`;
    this._mount(wrap);
  }

  /* ---------------- 小地图 ---------------- */
  drawMinimap({ car, markers, road, nextKey, worldR = 205 }) {
    const cv = this.minimap;
    const ctx = cv.getContext('2d');
    const S = cv.width, c = S / 2, k = c / worldR;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(c, c);

    ctx.beginPath();
    ctx.arc(0, 0, worldR * k, 0, 6.3);
    ctx.fillStyle = 'rgba(49,49,94,.55)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, worldR * 0.9 * k, 0, 6.3);
    ctx.fillStyle = 'rgba(120,112,132,.62)';
    ctx.fill();

    if (road) {
      ctx.beginPath();
      road.forEach((p, i) => i ? ctx.lineTo(p.x * k, p.z * k) : ctx.moveTo(p.x * k, p.z * k));
      ctx.strokeStyle = 'rgba(226,210,189,.5)';
      ctx.lineWidth = 3.2;
      ctx.stroke();
    }

    for (const m of markers) {
      const isNode = m.kind && m.kind !== 'memory';
      const mk = (m.pos.x * k, m.pos.z * k);
      // 该去撞的那根：外面套一圈呼吸的亮环，一眼就能在小地图上认出来
      if (nextKey && m.key === nextKey) {
        const breathe = 0.5 + 0.5 * Math.sin(performance.now() / 260);
        ctx.beginPath();
        ctx.arc(mk[0], mk[1], 7 + breathe * 3.5, 0, 6.3);
        ctx.strokeStyle = `rgba(255,214,120,${0.35 + breathe * 0.5})`;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(mk[0], mk[1], isNode ? 6 : 4.4, 0, 6.3);
      if (m.visited) {
        ctx.fillStyle = 'rgba(255,255,255,.22)';
        ctx.fill();
        ctx.strokeStyle = m.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = m.accent;
        ctx.fill();
      }
    }

    // 车
    ctx.save();
    ctx.translate(car.pos.x * k, car.pos.z * k);
    ctx.rotate(-car.yaw + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3.4);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fillStyle = '#fff1e6';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,106,124,.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  setNodes(map) { this._nodes = map; }
}
