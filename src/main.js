/* =====================================================================
 * 主控：渲染器 / 分步加载 / 状态机（加载 → 开场 → 口令门 → 世界）/ 主循环
 * ===================================================================== */
import * as THREE from '../vendor/three.module.min.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { World, heightAt, celifyScene, CEL, SEA_Y } from './world.js';
import { Car } from './vehicle.js';
import { Audio } from './audio.js';
import { MEMORIES, photoUrl, ALBUM } from './memories.js';

const SAVE_KEY = 'sgbb.m20190218.visited.v1';
const CELEBRATED_KEY = 'sgbb.m20190218.celebrated.v1';
const isTouch = matchMedia('(hover:none) and (pointer:coarse)').matches;

/* ---------------- 渲染器 ---------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: !isTouch, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 2 : 1.8));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// 原版 View.js：PerspectiveCamera(25, ratio, 0.1, 200) —— 窄视场才有那个"立体模型/微缩景观"的味道
const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.4, 900);
camera.position.set(0, 26, 46);

/* ---------------- 后期：泛光（原版靠 RenderPipeline 的 bloom 让车灯 / 灯笼发光） ---------------- */
const pr = renderer.getPixelRatio();
const rt = new THREE.WebGLRenderTarget(
  Math.floor(innerWidth * pr), Math.floor(innerHeight * pr),
  { type: THREE.HalfFloatType, samples: isTouch ? 0 : 4 }
);
rt.texture.name = 'composer.rt';
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
// 原版 Rendering.js：bloomThreshold = 1 / strength = 0.25 / smoothWidth = 1 —— 只有自发光才泛光
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.6, 1.0
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth, innerHeight);
});

/* ---------------- 世界 / 车 / 输入 ---------------- */
const audio = new Audio();
const visited = new Set(loadVisited());
const world = new World(scene);
// world.colliders 是同一个数组引用，道具在 boot 里边建边 push，所以这里传引用就能拿到全量
const car = new Car(scene).bindHeight(heightAt).bindColliders(world.colliders).bindSea(SEA_Y);

let state = 'loading';
// 开场飞行按"真实时间"推进，而不是累加 dt —— 否则在标签页被节流 / 低帧率设备上，
// 攒不够帧数就永远停在远景俯瞰，镜头落不下来
let revealStart = 0;
let revealing = false;
let nearNode = null;
let lastHover = null;
let lookIdle = 9;
let mmTick = 0;
let roadPts = null;
let nearestT = 0;
let last = 0;
// —— 顺序锁 / 收尾庆祝的状态
let nextKey = null;                 // 当前"该去撞"的那根光柱
let celebrated = loadCelebrated();  // 已经放过烟花、进过长廊
let celebrating = false;
let nudgeAt = 0;                    // 提示节流（免得贴着柱子磨的时候刷屏）

const ui = new UI({
  onStart: () => {
    audio.start();
    ui.hideIntro();
    ui.showGate();
    state = 'gate';
  },
  onUnlock: () => {
    audio.unlock();
    state = 'reveal';
    ui.flash();
    setTimeout(() => { ui.hideGate(); ui.curtainOn(true); }, 300);
    setTimeout(() => {
      ui.showHUD();
      introStart.set(car.pos.x + 34, car.pos.y + 84, car.pos.z + 128);
      revealStart = performance.now();
      revealing = true;
      ui.curtainOn(false);
      state = 'world';
      input.enabled = true;
      if (visited.size === 0) ui.toast(`开车去逛逛吧 · <b>用卡车撞醒 ${MEMORIES.length} 座光柱</b>`);
      preloadFull();
    }, 1000);
  },
  onClose: () => {
    if (state === 'world') input.enabled = true;
    ui.setPrompt(null);
  },
  onToggleAudio: () => audio.toggle(),
});

// 存档 / 节点表的装配要等 boot 里 buildLandmarks() 跑完才能真正生效（pickTargets 那时才有内容），
// 所以这三行搬进了 boot()，见下文。

// 撞到光柱 → 只有"该撞的那一根"会翻开回忆，其余的只给一句提示
car.onHit = (tag, speed) => {
  if (!tag || tag.kind !== 'memory') return;
  handleMemoryImpact(tag.key, speed);
};

const input = new Input({
  canvas,
  joyEl: '#joy',
  jumpEl: '#btn-jump',
  onLook: (dx, dy) => {
    car.camera.orbit -= dx * 0.0055;
    car.camera.pitch = Math.max(0.16, Math.min(1.2, car.camera.pitch + dy * 0.0032));
    lookIdle = 0;
  },
  onZoom: (d) => { car.camera.dist = Math.max(15, Math.min(31, car.camera.dist + d)); },
});
input.enabled = false;
input.onInteract = (which) => {
  if (which === -1 || ui.isPanelOpen()) return;
  if (!nearNode) return;
  // 光柱只能用车撞开：这里只提醒，不翻开
  if (nearNode.kind === 'memory') { nudgeImpact('<b>撞上去</b> · 光柱得用卡车顶开'); return; }
  openNode(nearNode);
};
input.onTap = (p) => {
  if (state !== 'world' || ui.isPanelOpen()) return;
  const hit = p ? pickFromScreen(p.x, p.y) : null;
  if (!hit) return;
  if (hit.kind === 'memory') { nudgeImpact('<b>撞上去</b> · 光柱得用卡车顶开'); return; }
  openNode(hit);
};
if (!isTouch) {
  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'world' || ui.isPanelOpen()) return;
    lastHover = pickFromScreen(e.clientX, e.clientY);
    canvas.style.cursor = lastHover ? 'pointer' : 'default';
  });
}

function buildNodeMap() {
  const map = {};
  for (const n of world.pickTargets) map[n.key] = n;
  return map;
}

/* ---------------- 拾取 ---------------- */
const raycaster = new THREE.Raycaster();
raycaster.params.Sprite = { threshold: 0.8 };
const ndc = new THREE.Vector2();

function pickFromScreen(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(world.pickMeshes, false);
  if (hits.length) return hits[0].object.userData.node;
  // 兜底：直接点光柱本体
  const hits2 = raycaster.intersectObjects(world.pickTargets.map(n => n.group), true);
  for (const h of hits2) {
    let o = h.object;
    while (o) {
      const n = world.pickTargets.find(x => x.group === o);
      if (n) return n;
      o = o.parent;
    }
  }
  return null;
}

/* ---------------- 打开 / 进度 ---------------- */
function openNode(node) {
  if (ui.isPanelOpen()) return;
  input.enabled = false;
  lookIdle = 0;
  const first = !visited.has(node.key);
  visited.add(node.key);
  saveVisited();
  if (node.kind === 'memory') {
    world.setVisited(node.key, true);
    ui.setVisited(visitedCount(), MEMORIES.length);
    if (first) audio.openNode();
    if (visitedCount() === MEMORIES.length) {
      world.glowHome(true);
      ui.toast('<b>✦ 16 段回忆都点亮了</b> · 开车回家吧');
    }
    refreshGuide();
  }
  ui.setPrompt(null);
  ui.openNode(node);
}

function visitedCount() {
  let n = 0;
  for (const m of MEMORIES) if (visited.has(m.id)) n++;
  return n;
}

/* ---------------- 顺序锁 · 指引 · 收尾 ---------------- */

/** 还没读过的最早一段回忆 —— 就是"此刻该去撞"的那根光柱 */
function computeNextKey() {
  for (const m of MEMORIES) if (!visited.has(m.id)) return m.id;
  return null;
}

/** 把三态（已读 / 该撞 / 没到时候）落到每根光柱的外观上 */
function refreshMemoryTones() {
  for (const m of MEMORIES) {
    if (visited.has(m.id)) world.setVisited(m.id, true);
    else world.setMemoryState(m.id, m.id === nextKey ? 'active' : 'locked');
  }
}

/** 重算下一段，并把 HUD 顶部那条「下一段」横幅刷新掉 */
function refreshGuide() {
  nextKey = computeNextKey();
  refreshMemoryTones();
  const m = MEMORIES.find(x => x.id === nextKey);
  ui.setNext(m
    ? `<span class="nextup__k">下一段</span>${m.date} · ${m.title}<em>撞上那根发亮的光柱</em>`
    : null);
}

/** 撞错 / 点错时的软提示（2.2s 节流，免得贴着柱子磨的时候刷屏） */
function nudgeImpact(msg) {
  const now = performance.now();
  if (now - nudgeAt < 2200) return;
  nudgeAt = now;
  ui.toast(msg);
}

/** 车撞上光柱：只有"该撞的那一根"翻得开，其余只给一句提示 */
function handleMemoryImpact(key) {
  if (state !== 'world' || ui.isPanelOpen() || celebrating) return;
  const node = world.pickTargets.find(n => n.key === key);
  if (!node || visited.has(key)) return;
  if (key !== nextKey) {
    nudgeImpact('这段回忆还没到时候 · 先去看看 <b>下一段</b>');
    return;
  }
  openNode(node);
}

/** 16 段全亮 + 车开进院子：放烟花，然后自动展开长廊 */
function launchCelebration() {
  celebrating = true;
  celebrated = true;
  saveCelebrated();
  audio.complete();
  ui.flash();
  ui.toast('<b>✦ 16 段回忆都点亮了</b> · 欢迎回家');
  world.launchFireworks(3);
  setTimeout(() => world.launchFireworks(3), 900);
  setTimeout(() => world.launchFireworks(3), 1900);
  setTimeout(() => {
    if (!ui.isPanelOpen() && state === 'world') { celebrating = false; ui.openGallery(); }
  }, 3600);
}

/* ---------------- 加载 ---------------- */
const introStart = new THREE.Vector3();
const steps = [
  ['正在升起一座小岛……', () => world.buildSky()],
  ['正在铺开我们的世界……', () => world.buildTerrain()],
  ['正在种树、修路、放一艘小船……', () => world.buildProps()],
  ['正在把回忆放到岛上……', () => world.buildLandmarks()],
  ['正在冲洗那些照片……', () => preloadThumbs()],
];

const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  await document.fonts.ready.catch(() => {});
  for (let i = 0; i < steps.length; i++) {
    ui.setProgress(i / steps.length, steps[i][0]);
    await nextFrame();
    const r = steps[i][1]();
    if (r && r.then) await r;
    ui.setProgress((i + 1) / steps.length);
  }
  await nextFrame();
  // 存档 / 节点表要等 buildLandmarks() 建完（pickTargets 那时才有内容）才能装配
  ui.setNodes(buildNodeMap());
  ui.setVisited(visitedCount(), MEMORIES.length);
  for (const id of visited) world.setVisited(id, true);
  if (visitedCount() === MEMORIES.length) world.glowHome(true);
  refreshGuide();
  // 全场景换成原版的双色调光照（必须在所有网格建完之后做一次）
  celifyScene(scene);
  ui.hideLoading();
  ui.showIntro();
  last = performance.now();
  loop();
}

function preloadThumbs() {
  const list = [];
  for (const m of MEMORIES) for (const p of m.photos || []) list.push(p.p);
  for (const p of ALBUM) list.push(p.p);
  let done = 0;
  const total = list.length;
  return new Promise((res) => {
    const next = () => {
      if (!list.length) return res();
      const id = list.shift();
      const im = new Image();
      im.onload = im.onerror = () => {
        done++;
        ui.setProgress(0.8 + 0.2 * (done / total));
        setTimeout(next, 0);
      };
      im.src = photoUrl(id, true);
    };
    for (let i = 0; i < 6; i++) next();
  });
}

let fullQueue = [];
function preloadFull() {
  if (isTouch) return;
  fullQueue = [];
  for (const m of MEMORIES) for (const p of m.photos || []) fullQueue.push(p.p);
  for (const p of ALBUM) fullQueue.push(p.p);
  const pump = () => {
    if (!fullQueue.length) return;
    const im = new Image();
    im.onload = im.onerror = () => setTimeout(pump, 40);
    im.src = photoUrl(fullQueue.shift());
  };
  setTimeout(pump, 1200);
}

/* ---------------- 主循环 ---------------- */
const camTarget = new THREE.Vector3();
const camLove = new THREE.Vector3();

function render(dt) {
  world.update(dt);

  const driving = state === 'world' && input.enabled && !ui.isPanelOpen();
  if (driving) car.update(dt, input);
  else car.update(dt, { throttle: 0, steer: 0, boosted: false, consumeJump: () => false });

  // 自动回正视角
  if (lookIdle < 6) lookIdle += dt;
  if (car.speed > 2.5 && lookIdle > 1.1) car.camera.orbit *= Math.max(0, 1 - dt * 1.4);

  car.cameraTarget(car.camera.dist, car.camera.orbit, car.camera.pitch, camTarget);
  camTarget.y += 1.1;

  if (revealing) {
    const t = Math.min(1, (performance.now() - revealStart) / 3800);
    if (t >= 1) revealing = false;
    camera.position.copy(introStart).lerp(camTarget, t * t * (3 - 2 * t));
  } else {
    camLove.copy(camTarget);
    const gy = heightAt(camLove.x, camLove.z) + 2.6;
    if (camLove.y < gy) camLove.y = gy;
    camera.position.lerp(camLove, Math.min(1, 1 - Math.exp(-7 * dt)));
  }
  camera.lookAt(car.pos.x, car.pos.y + 1.6, car.pos.z);

  const speedFov = 28 + Math.min(1, Math.abs(car.speed) / 20) * 5 + (car.boosting ? 2 : 0);
  camera.fov += (speedFov - camera.fov) * Math.min(1, 4 * dt);
  camera.updateProjectionMatrix();

  // 双色调光照
  // 1) 阴影相机跟着车走（原版 Light 也这么做）—— 范围小，影子才清晰
  world.followShadow(car.pos.x, car.pos.z);
  // 2) 光源方向转到视空间（shader 里的几何法线是视空间）
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  CEL.dir.value.copy(world.sunDir).transformDirection(camera.matrixWorldInverse);

  // 附近可交互点提示
  nearestT += dt;
  if (nearestT > 0.14 && state === 'world' && !ui.isPanelOpen()) {
    nearestT = 0;
    nearNode = world.nearest(car.pos, 9.5);
    if (nearNode) {
      const isMem = nearNode.kind === 'memory';
      const title = isMem ? nearNode.data.title : nearNode.title;
      const date = isMem ? nearNode.data.date : nearNode.date;
      let tip;
      if (!isMem) tip = '按 E / 点一下 · 打开';
      else if (visited.has(nearNode.key)) tip = '已读过';
      else if (nearNode.key === nextKey) tip = '撞上去 · 翻开这一天';
      else tip = '这段还没到时候 · 先去找那根发亮的光柱';
      ui.setPrompt(`<b>${title}</b>　${date}<em>${tip}</em>`);
    } else {
      ui.setPrompt(null);
    }
  }

  // 小地图
  mmTick += dt;
  if (mmTick > 0.22) {
    mmTick = 0;
    if (!roadPts) roadPts = world.roadCurve.getSpacedPoints(48);
    ui.drawMinimap({
      car, road: roadPts, nextKey,
      markers: world.pickTargets.map(n => ({
        pos: n.pos, accent: n.accent, kind: n.kind, key: n.key,
        visited: n.kind === 'memory' ? visited.has(n.key) : true,
      })),
    });
  }

  // 16 段全亮 + 车开进院子 → 放烟花、自动展开长廊（一次性）
  if (!celebrated && !celebrating && state === 'world' && !ui.isPanelOpen()
    && visitedCount() === MEMORIES.length
    && Math.hypot(car.pos.x - world.homeCenter.x, car.pos.z - world.homeCenter.z) < 9.0) {
    launchCelebration();
  }

  composer.render(dt);
}

function loop() {
  const now = performance.now();
  let dt = (now - last) / 1000;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(0.05, dt);
  last = now;
  render(dt);
  requestAnimationFrame(loop);
}

/* ---------------- 存档 ---------------- */
function loadVisited() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; } catch { return []; }
}
function saveVisited() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify([...visited])); } catch {}
}
function loadCelebrated() {
  try { return localStorage.getItem(CELEBRATED_KEY) === '1'; } catch { return false; }
}
function saveCelebrated() {
  try { localStorage.setItem(CELEBRATED_KEY, '1'); } catch {}
}

boot();
