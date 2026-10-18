/* =====================================================================
 * 世界：低多边形小岛 + 海 + 树 + 道路 + 16 个回忆点 + 相册 / 石碑 / 家
 * 所有几何都用 flatShading，黄昏光 + 暖雾
 * ===================================================================== */
import * as THREE from '../vendor/three.module.min.js';
import { MEMORIES, ALBUM, photoUrl } from './memories.js';
import { drawIcon } from './icons.js';

const ACCENTS = ['#ff87a2', '#d5ff95', '#ffc67b', '#ff6a7c', '#c9a7ff'];

export const SEA_Y = -5.6;

/* ---------------- 地形（解析高度场，几何与物理共用） ---------------- */
const FLATS = []; // {x,z,r,k,h}

function rawHeight(x, z) {
  let h =
    Math.sin(x * 0.062 + 0.4) * Math.cos(z * 0.055 - 0.9) * 2.6 +
    Math.sin(x * 0.028 - 1.3) * Math.cos(z * 0.033 + 0.7) * 5.2 +
    Math.sin((x + z * 0.7) * 0.011 + 2.1) * 3.6;
  const c = smoothstep(8, 34, Math.hypot(x, z));
  h *= 0.22 + 0.78 * c;
  const edge = 1 - smoothstep(165, 215, Math.hypot(x, z));
  return h * edge + (edge - 1) * 16;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 岛面高度（含广场 / 地标平台抚平） */
export function heightAt(x, z) {
  const raw = rawHeight(x, z);
  let k = 0, target = raw;
  for (let i = 0; i < FLATS.length; i++) {
    const b = FLATS[i];
    const d = Math.hypot(x - b.x, z - b.z);
    if (d > b.r) continue;
    const t = (1 - smoothstep(b.r * 0.25, b.r, d)) * b.k;
    if (t > k) { k = t; target = b.h; }
  }
  return raw * (1 - k) + target * k;
}

/* ---------------- 布局 ---------------- */
// 家搬到了岛的正中央，原来那个广场没有了；这个半径现在只表示"给树 / 草留出的家园空地"
const HOME_R = 13;
export const LAYOUT = {
  album: { angle: 1.02, r: 116 },
  stone: { angle: 3.42, r: 148 },
  home: { angle: 0, r: 0 },      // 家 = 心形的形心 = 岛的正中央（polar(0, 0) 依然是 (0, 0)）
  pond: { angle: 2.05, r: 27 },
};

function polar(a, r) { return { x: Math.cos(a) * r, z: Math.sin(a) * r }; }

/* ---------------- 心形回忆环 ----------------
 * 16 段回忆串成一颗心，家落在心的正中央（形心）。
 * 经典心形参数曲线（y 向上，t = π 是最下面的尖点，t = 0 是顶部凹口）：
 *     X(t) = 16·sin³t
 *     Y(t) = 13·cos t − 5·cos 2t − 2·cos 3t − cos 4t
 * 映射到世界 XZ 平面时把 Y 取反 → 心是"正着"的：尖点朝 +z（小地图下方），
 * 两瓣与凹口朝 −z（小地图上方）。
 * ------------------------------------------------------------------ */
function heartX(t) { return 16 * Math.sin(t) ** 3; }
function heartY(t) {
  return 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
}

const HEART = (() => {
  const N = 4096, TWO = Math.PI * 2;
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * TWO, t1 = ((i + 1) / N) * TWO;
    const x0 = heartX(t0), y0 = heartY(t0), x1 = heartX(t1), y1 = heartY(t1);
    const cross = x0 * y1 - x1 * y0;
    A += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
  }
  A *= 0.5; cx /= 6 * A; cy /= 6 * A;    // 面积形心 → 平移之后家正好落在原点
  let dmax = 0;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TWO;
    dmax = Math.max(dmax, Math.hypot(heartX(t) - cx, heartY(t) - cy));
  }
  return { cx, cy, S: 90 / dmax };       // 外接半径 ≈ 90：不与相册（116−11）打架
})();

/** 弧长表：从尖点 t = π 起、沿 t 递增方向绕一圈（把心形的隐含映射算好，供等距取点用） */
const HEART_ARC = (() => {
  const M = 2048, TWO = Math.PI * 2;
  const xs = [], zs = [], cum = [0];
  for (let i = 0; i <= M; i++) {
    const t = Math.PI + (i / M) * TWO;
    xs.push((heartX(t) - HEART.cx) * HEART.S);
    zs.push(-(heartY(t) - HEART.cy) * HEART.S);
    if (i > 0) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
  }
  return { M, xs, zs, cum, total: cum[M] };
})();

/** 心形上按弧长比例 s ∈ [0, 1) 取点（s = 0 就是尖点） */
function heartPoint(s) {
  const { M, xs, zs, cum, total } = HEART_ARC;
  const d = (((s % 1) + 1) % 1) * total;
  let lo = 0, hi = M;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < d) lo = mid + 1; else hi = mid;
  }
  if (lo === 0) return { x: xs[0], z: zs[0] };
  const s0 = cum[lo - 1], s1 = cum[lo];
  const k = (d - s0) / Math.max(s1 - s0, 1e-9);
  return { x: xs[lo - 1] + (xs[lo] - xs[lo - 1]) * k, z: zs[lo - 1] + (zs[lo] - zs[lo - 1]) * k };
}

/** 16 个回忆点：从尖点起按弧长 16 等分，返回顺序 = 时间顺序 */
function heartSlots() {
  const out = [];
  for (let i = 0; i < MEMORIES.length; i++) out.push(heartPoint(i / MEMORIES.length));
  return out;
}

/* ---------------- 贴图工具 ---------------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function iconSprite(name, color, px = 256, glow = 22) {
  const tex = canvasTex(px, px, (ctx) => {
    ctx.clearRect(0, 0, px, px);
    const g = ctx.createRadialGradient(px / 2, px / 2, 4, px / 2, px / 2, px / 2);
    g.addColorStop(0, 'rgba(255,255,255,.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, px, px);
    drawIcon(ctx, name, px * 0.62, color, 11, glow);
  });
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const s = new THREE.Sprite(m);
  return s;
}

function labelSprite(date, title, accent, w = 512, h = 148) {
  const tex = canvasTex(w * 2, h * 2, (ctx, W, H) => {
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = '132px "Amatic SC", cursive';
    ctx.fillText(date, W / 2, 116);
    if (title) {
      ctx.fillStyle = 'rgba(255,255,255,.94)';
      ctx.font = '600 52px Nunito, "PingFang SC", "Microsoft YaHei", sans-serif';
      const t = title.length > 12 ? title.slice(0, 12) + '…' : title;
      ctx.fillText(t, W / 2, 216);
    }
  });
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.set(w / 64, h / 64, 1);
  return s;
}

/* ---------- 质感贴图 / 几何 ---------- */

/** 低频云状噪声 + 细颗粒（给地面一点斑驳，别像一块纯色塑料） */
function noiseTex(size = 256, cells = 12, contrast = 0.26) {
  const t = canvasTex(size, size, (ctx, W, H) => {
    const img = ctx.createImageData(W, H);
    const rnd = mulberry32(90210);
    const g = new Float32Array((cells + 1) * (cells + 1));
    for (let i = 0; i < g.length; i++) g[i] = rnd() * 0.5 + 0.5;
    for (let y = 0; y < H; y++) {
      const fy = (y / H) * cells, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < W; x++) {
        const fx = (x / W) * cells, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const r0 = y0 * (cells + 1) + x0, r1 = r0 + (cells + 1);
        const v = (g[r0] * (1 - sx) + g[r0 + 1] * sx) * (1 - sy)
                + (g[r1] * (1 - sx) + g[r1 + 1] * sx) * sy;
        const c = Math.max(0, Math.min(1, 1 - contrast * (1 - v) + (rnd() - 0.5) * 0.14));
        const o = (y * W + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = c * 255;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 一簇草叶：5 片交叉的宽叶片（原版草地是粗壮的块状草，但很矮 —— 上一版做到 1.6m 高，把整座岛扎成了刺猬） */
function tuftGeometry() {
  const verts = [], idx = [];
  const w = 0.11;
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI + 0.35;
    const ca = Math.cos(a), sa = Math.sin(a);
    const h = 0.42 * (0.7 + (b % 3) * 0.32);
    const bend = 0.1;
    const base = verts.length / 3;
    const pts = [
      [-w, 0], [w, 0],
      [-w * 0.18 + bend, h * 0.72], [w * 0.18 + bend, h * 0.72],
    ];
    for (const [px, py] of pts) verts.push(px * ca, py, px * sa);
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* =====================================================================
 * 原版"质感"的真正核心：双色调光照
 * 原版不用 Lambert/Standard 那套（环境光 + 高光 + dotNL 衰减），它把
 * diffuse 直接写成
 *     lit  = baseColor * lightColor * lightIntensity
 *     shad = baseColor * shadowColor
 * 再由一个 dot(normal, lightDir) 的 smoothstep 遮罩在两者间切换，并和
 * 阴影贴图取 max。没有环境光、没有镜面高光 —— 这才是它那种
 * "大色块平涂 + 浓紫影子"观感的来源。
 * 这里用 onBeforeCompile 精确复刻，一行代码就能改掉全场景的质感。
 * ===================================================================== */
export const CEL = {
  dir: { value: new THREE.Vector3(0, 1, 0) },      // 视空间光源方向（每帧更新）
  // 原版 DayCycles.js 的 night preset（逐字照搬）—— 网站最标志性的"蓝紫小岛 + 暖橙灯"就是它
  light: { value: new THREE.Color('#3240ff') },    // 受光色
  lightI: { value: 3.0 },                          // 受光强度（原版 3.8；我们没上 tonemapping，3.8 会把地面蓝推爆，收一点）
  shadow: { value: new THREE.Color('#2f00db') },   // 阴影色（深蓝紫）
};

export function celify(material) {
  if (!material || material.userData._cel) return material;
  material.userData._cel = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCelDir = CEL.dir;
    shader.uniforms.uCelLight = CEL.light;
    shader.uniforms.uCelLightI = CEL.lightI;
    shader.uniforms.uCelShadow = CEL.shadow;
    shader.fragmentShader =
      'uniform vec3 uCelDir;\nuniform vec3 uCelLight;\nuniform float uCelLightI;\nuniform vec3 uCelShadow;\n'
      + shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          // geometryNormal 是视空间法线（lights_fragment_begin 里已处理双面翻转）
          vec3 celN = normalize( geometryNormal );
          // 原版 coreShadowMix = dot( N, L ).smoothstep( 1.0, -0.25, dotN )，等价于下面这行
          float celT = clamp( ( 1.0 - dot( celN, uCelDir ) ) / 1.25, 0.0, 1.0 );
          float celCore = celT * celT * ( 3.0 - 2.0 * celT );
          // 原版 dropShadowMix = 1 - catchedShadow（阴影贴图）
          float celDrop = 0.0;
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            DirectionalLightShadow celLS = directionalLightShadows[ 0 ];
            celDrop = 1.0 - getShadow(
              directionalShadowMap[ 0 ], celLS.shadowMapSize,
              celLS.shadowBias, celLS.shadowRadius, vDirectionalShadowCoord[ 0 ] );
          #endif
          vec3 celTone = mix( uCelLight * uCelLightI, uCelShadow, max( celCore, celDrop ) );
          reflectedLight.directDiffuse = diffuseColor.rgb * celTone;
          reflectedLight.indirectDiffuse = vec3( 0.0 );
          reflectedLight.directSpecular = vec3( 0.0 );
          reflectedLight.indirectSpecular = vec3( 0.0 );
        }`
      );
  };
  material.needsUpdate = true;
  return material;
}

/** 把整棵场景树里所有受光材质换成双色调模型 */
export function celifyScene(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m.isMeshStandardMaterial || m.isMeshLambertMaterial) celify(m);
    }
  });
}

/* ===================================================================== */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.markers = [];       // {key,kind,title,date,pos,group,pick,accent,visited}
    this.pickTargets = [];
    this.pickMeshes = [];
    this.roads = [];
    this.clouds = [];
    this.time = 0;
    this.heartPos = [];          // 16 个回忆点的世界坐标（按时间顺序）
    this.homeCenter = new THREE.Vector3();   // 家的中心（= 原点），收尾判定用
    this.activeMark = null;      // 当前"该去撞"的那根光柱
    // 静态碰撞体：给车用的圆柱 / 定向盒（全部在 XZ 平面上）。车是"双圆胶囊"，
    // 所以这里只需要最省的一层描述，不需要真物理引擎。
    this.colliders = [];
    // 烟花
    this.fireworks = [];         // 正在上升的炮弹
    this._bursts = [];           // 已炸开的光点云
  }

  /** 登记一个圆柱碰撞体（树 / 灯柱 / 池岸 / 柱体…），tag 用于让车知道撞到了什么 */
  addCyl(x, z, r, tag) {
    this.colliders.push({ x, z, r, box: false, rad: r, tag });
  }

  /** 登记一个 XZ 平面内的定向盒碰撞体（树篱 / 长椅 / 栅栏 / 墙体…） */
  addBoxCol(x, z, hw, hd, ry) {
    this.colliders.push({
      x, z, hw, hd, box: true,
      c: Math.cos(ry), s: Math.sin(ry),
      rad: Math.hypot(hw, hd),
    });
  }

  /** 登记一个环形墙碰撞体（院墙：从内侧 r、外侧 r+2t 都不能穿过；给了 gate 就在该角度留门） */
  addRing(x, z, r, t, gate, gateHalf) {
    this.colliders.push({ x, z, r, t, gate, gateHalf, box: false, ring: true, rad: r + 2 * t });
  }

  /* ---------- 1. 天空 / 光 / 海 ---------- */
  buildSky() {
    // 背景 = 屏幕空间径向渐变（原版 Fog.color 就是这么做的：中心 #3e53ff → 边缘 #ff4ce4）
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(700, 16, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          // 原版 Fog.js：背景就是这个径向渐变（night preset 的 fogColorA / fogColorB）
          cA: { value: new THREE.Color('#10266f') },
          cB: { value: new THREE.Color('#490a42') },
        },
        vertexShader: `
          varying vec2 vScr;
          void main(){
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
            vScr = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
          }`,
        fragmentShader: `
          uniform vec3 cA; uniform vec3 cB;
          varying vec2 vScr;
          void main(){
            gl_FragColor = vec4( mix( cA, cB, smoothstep( 0.0, 1.0, length( vScr - 0.5 ) ) ), 1.0 );
          }`,
      })
    );
    sky.renderOrder = -1;
    this.scene.add(sky);
    this.sky = sky;
    this.skyMat = sky.material;

    // 雾：远处溶进夜色（用 night preset 的 fogColorA），让岛的边缘和地平线一起沉进蓝紫里
    this.scene.fog = new THREE.Fog(new THREE.Color('#1c2a7a'), 70, 470);

    // 只留一盏方向光：它负责投影。真正的"受光色/阴影色"双色调在 celify() 里做。
    const sun = new THREE.DirectionalLight(new THREE.Color('#ffffff'), 0.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 62;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 20, far: 340 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.1;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    // 光源方位 = 原版 Lighting.js 的球坐标（phi 0.63 极角 / theta 0.72 方位角）
    const sph = new THREE.Spherical(1, 0.63, 0.72);
    this.sunDir = new THREE.Vector3().setFromSpherical(sph).normalize();
    this.followShadow(0, 0);
  }

  /** 阴影相机跟着车走（原版 Light 也是跟着焦点走）——范围小 → 影子清晰 */
  followShadow(x, z) {
    const o = this.sunDir.clone().multiplyScalar(95);
    this.sun.position.set(x + o.x, o.y, z + o.z);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
  }

  /* ---------- 2. 地形 ---------- */
  buildTerrain() {
    // 先登记需要抚平的平台（家的平台由下面 home 那一项承担，家就在原点，所以不用再单独铺一块）
    FLATS.length = 0;
    const lm = {};
    for (const key of ['album', 'stone', 'home']) {
      const L = LAYOUT[key];
      const p = polar(L.angle, L.r);
      lm[key] = p;
      FLATS.push({ x: p.x, z: p.z, r: key === 'home' ? 16 : 12, k: 1, h: rawHeight(p.x, p.z) });
    }
    // 睡莲池塘：单独抚平一块浅塘平台（水面比地面略高一点，四周砌石收边）
    const pd = polar(LAYOUT.pond.angle, LAYOUT.pond.r);
    lm.pond = pd;
    FLATS.push({ x: pd.x, z: pd.z, r: 10, k: 1, h: rawHeight(pd.x, pd.z) });
    // 心形回忆环：16 个回忆点从小地图下方的尖点起步，按时间顺序等距串成一颗心（家落在形心上）
    const slots = heartSlots();
    MEMORIES.forEach((m, i) => {
      const p = slots[i];
      FLATS.push({ x: p.x, z: p.z, r: 6.5, k: 0.92, h: rawHeight(p.x, p.z) });
      m._pos = new THREE.Vector3(p.x, 0, p.z);
    });
    this.layoutPos = lm;
    this.heartPos = slots.map(p => new THREE.Vector3(p.x, 0, p.z));

    const SEG = 256, SIZE = 480;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    // 原版 Terrain.js 的 colorNode：baseColor = 一条 3 段线性渐变，采样坐标是 terrainData.b 的补数。
    //   uv.y = 0    → #ffa94e 橙沙（岸边 / 水下）
    //   uv.y = 0.3  → #5bc2b9 青绿（过渡带）
    //   uv.y = 0.9+ → #13375f 深蓝（岛体绝大部分）
    // 所以原版的地面本身是「深蓝紫」，绿色只来自它上面成簇的草叶几何 —— 我上一版把它铺成了黄绿地，
    // 再被暖光一乘就变成了火星红，这是「完全不还原」的头号原因。
    const cSand = new THREE.Color('#ffa94e');
    const cMid = new THREE.Color('#5bc2b9');
    const cDeep = new THREE.Color('#13375f');
    const tmp = new THREE.Color();
    const terrainColor = (h) => {
      const t = smoothstep(-5.4, 2.2, h);          // 越高越远离岸边 → 越蓝
      if (t <= 0.1) return tmp.copy(cSand);
      if (t <= 0.3) return tmp.copy(cSand).lerp(cMid, (t - 0.1) / 0.2);
      if (t <= 0.9) return tmp.copy(cMid).lerp(cDeep, (t - 0.3) / 0.6);
      return tmp.copy(cDeep);
    };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      terrainColor(h);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const groundNoise = noiseTex(256, 12, 0.3);
    groundNoise.repeat.set(26, 26);
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 1, metalness: 0,
      map: groundNoise,
    }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    // 海：鲜亮靛蓝（原版水面是独立的非受光材质，所以它在大面积粉调里依然是亮蓝）
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(2200, 2200, 1, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#3f63ff'), fog: true })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA_Y;
    this.scene.add(sea);
    this.sea = sea;

    // 岸线浅滩
    const foam = new THREE.Mesh(
      new THREE.RingGeometry(182, 208, 128, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#cfd8ff'), transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = SEA_Y + 0.12;
    this.scene.add(foam);
  }

  /* ---------- 3. 树 / 石 / 云 / 萤火 / 路 / 码头 ---------- */
  buildProps() {
    // 全岛共用一条随机流：数值取纪念日，但写成十六进制，
    // 这样源码里不会再直接出现那串明文日期（数值完全没变，所以树 / 石 / 草的分布一模一样）
    const rnd = mulberry32(0x134140a);
    const tr = [];
    // 先把路修出来：后面的树 / 石 / 草 / 碎石都要靠 roadGrid 避让路面
    this.buildRoads();

    // 树干：白桦近白 + 棕木两种；树冠取原版调色板里的紫蓝 / 棕红 / 橄榄 / 亮黄绿 / 粉
    const trunkMats = ['#dfe3ec', '#6b4b3a', '#c9c2b4']
      .map(c => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), flatShading: true, roughness: 1 }));
    const leafMats = ['#4a3f8f', '#6a5bb8', '#8a4a3a', '#91ad78', '#b4b536', '#ff6d6d', '#8f7a58']
      .map(c => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), flatShading: true, roughness: 0.95 }));

    const spots = [];
    // 树全部改成 InstancedMesh：原来每棵树 4 个 Mesh（树干 + 3 团树冠），300 棵就是 ~1200 个
    // draw call，是全场景最大的一笔开销。现在按「树干 / 锥形针叶 / 球形阔叶 × 材质」合成
    // 十来个 InstancedMesh，省下的预算正好反过来把树干、针叶的分段数提上去（剪影更圆）。
    // 注意：下面 rnd() 的调用顺序与上一版逐个数保持完全一致 —— 整岛用的是同一条随机流，
    // 顺序一变，后面的石头 / 草 / 碎屑分布就全变了。所以这里只换"组装方式"，不动随机序列。
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.21, 1, 10);   // 高 1，由实例缩放拉到各树高度
    const coneGeo = new THREE.ConeGeometry(1, 1.9, 12);
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const buckets = new Map();          // 'kind|matIndex' → { kind, mat, list: Matrix4[] }
    const bucketOf = (kind, mat, mi) => {
      const key = kind + '|' + mi;
      let bk = buckets.get(key);
      if (!bk) { bk = { kind, mat, list: [] }; buckets.set(key, bk); }
      return bk;
    };
    const localM = (px, py, pz, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz)
    );
    const whole = new THREE.Matrix4();
    let tn = 0;
    for (let i = 0; i < 2200 && tn < 300; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 15 + Math.sqrt(rnd()) * 162;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = heightAt(x, z);
      if (y < -0.4 || y > 15) continue;
      if (Math.hypot(x, z) < HOME_R + 2) continue;      // 家园空地：别把树种到家里
      if (this.nearRoad(x, z, 4.6)) continue;           // 路两侧留出走廊
      if (this.inPond(x, z, 9)) continue;
      if (tooClose(spots, x, z, 5.4)) continue;
      spots.push({ x, z });
      const tall = rnd();
      const th = 1.5 + tall * 2.4;
      const ti = (rnd() * trunkMats.length) | 0;        // 树干材质
      const li = (rnd() * leafMats.length) | 0;         // 树冠材质
      const conifer = rnd() < 0.4;                      // 针叶 / 阔叶
      // 先按原来的顺序把局部零件算出来（顺序 = 原实现逐个 rnd() 的顺序）
      const parts = [];
      if (conifer) {
        // 针叶：叠锥
        const r0 = 1.1 + rnd() * 0.9;
        for (let k = 0; k < 3; k++) {
          const rk = r0 * (1 - k * 0.22);
          parts.push(['cone', li, localM(0, th + 0.7 + k * 1.15, 0, 0, rnd() * 1.4, 0, rk, 1, rk)]);
        }
      } else {
        // 阔叶：三团错位的低模球，比单球更有体积感
        const base = 0.95 + rnd() * 0.7;
        for (let k = 0; k < 3; k++) {
          const rr = base * (0.82 + rnd() * 0.3);
          const px = (rnd() - 0.5) * 1.1;
          const py = th + 0.85 + k * 0.62 + rnd() * 0.3;
          const pz = (rnd() - 0.5) * 1.1;
          const sy = 0.8 + rnd() * 0.25;
          const rx = rnd() * 3, ry = rnd() * 3, rz = rnd() * 3;
          parts.push(['leaf', li, localM(px, py, pz, rx, ry, rz, rr, rr * sy, rr)]);
        }
      }
      const gy = rnd() * 3.14;
      const s = 0.78 + rnd() * 0.7;
      // 整棵树的变换（位置 / 朝向 / 缩放），零件再左乘各自的局部矩阵
      whole.compose(
        new THREE.Vector3(x, y - 0.15, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, gy, 0)),
        new THREE.Vector3(s, s, s)
      );
      bucketOf('trunk', trunkMats[ti], ti).list.push(
        new THREE.Matrix4().multiplyMatrices(whole, localM(0, th / 2, 0, 0, 0, 0, 1, th, 1))
      );
      for (const [kind, mi, m] of parts) {
        bucketOf(kind, leafMats[mi], mi).list.push(new THREE.Matrix4().multiplyMatrices(whole, m));
      }
      tn++;
      this.addCyl(x, z, 0.44 * s);        // 树干挡车
    }
    const treeInst = [];
    for (const bk of buckets.values()) {
      const geo = bk.kind === 'trunk' ? trunkGeo : (bk.kind === 'cone' ? coneGeo : leafGeo);
      const im = new THREE.InstancedMesh(geo, bk.mat, bk.list.length);
      for (let k = 0; k < bk.list.length; k++) im.setMatrixAt(k, bk.list[k]);
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.frustumCulled = false;           // 实例铺满全岛，逐实例视锥剔除没有意义
      this.scene.add(im);
      treeInst.push(im);
    }
    this.trees = treeInst;

    // 岩石
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7f86a0'), flatShading: true, roughness: 0.92 });
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 22 + Math.sqrt(rnd()) * 158;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = heightAt(x, z);
      if (y < -0.8) continue;
      if (Math.hypot(x, z) < HOME_R + 1.5) continue;    // 家园空地
      if (this.nearRoad(x, z, 4.2)) continue;           // 别把石头扔在路上
      if (this.inPond(x, z, 8)) continue;
      const rr = 0.5 + rnd() * 1.1;
      // 大石头用细分球（近景轮廓更圆、不再是硬棱多面体），小石头保持低模块面感
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, rr > 1.0 ? 2 : 1), rockMat);
      m.position.set(x, y + 0.25, z);
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      m.scale.set(1, 0.72 + rnd() * 0.4, 1);
      m.castShadow = true;
      this.scene.add(m);
      this.addCyl(x, z, rr * 0.85);
    }

    // 低多边形云
    const cloudMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c9c4e8'), flatShading: true, roughness: 1,
      transparent: true, opacity: 0.9, fog: true,
    });
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const n = 3 + ((rnd() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const s0 = 6 + rnd() * 9;
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s0, 1), cloudMat);
        b.position.set((k - n / 2) * s0 * 0.9 + rnd() * 4, rnd() * 4, rnd() * 8);
        b.scale.set(1, 0.55, 0.8);
        g.add(b);
      }
      const a = rnd() * Math.PI * 2;
      const r = 40 + rnd() * 190;
      g.position.set(Math.cos(a) * r, 54 + rnd() * 40, Math.sin(a) * r);
      g.userData.spd = 0.35 + rnd() * 0.5;
      this.scene.add(g);
      this.clouds.push(g);
    }

    // 萤火
    const N = 420;
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 12 + Math.sqrt(rnd()) * 170;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = heightAt(Math.cos(a) * r, Math.sin(a) * r) + 0.6 + rnd() * 13;
      p[i * 3 + 2] = Math.sin(a) * r;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.fireflies = new THREE.Points(pg, new THREE.PointsMaterial({
      color: new THREE.Color('#ffd9a0'), size: 0.42, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
    }));
    this.scene.add(this.fireflies);

    this.buildLamps();
    this.buildHedge();

    // 地面细节：成簇草叶 + 散落碎石（原版地面很密，这一步是关键）
    this.buildScatter(rnd);

    // 路面上撒的"落叶小块"（原版 Leaves.js）
    this.buildLeaves(rnd);

    // 码头 + 小船
    this.buildDock(rnd);

    // 长椅 / 木栅栏 / 睡莲池塘
    this.buildBenches();
    this.buildFence();
    this.buildPond();
  }

  /** 是否落在池塘（含岸边）范围内 —— 树 / 草 / 碎石 / 长椅都要避开 */
  inPond(x, z, d) {
    const p = this.layoutPos && this.layoutPos.pond;
    if (!p) return false;
    return Math.hypot(x - p.x, z - p.z) < d;
  }

  /** 长椅：广场外圈 6 张（面朝圆心）+ 路边若干张（面朝路面） */
  buildBenches() {
    const woodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a6446'), flatShading: true, roughness: 1 });
    const legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b3552'), flatShading: true, roughness: 0.6, metalness: 0.3 });
    const bench = (x, z, fx, fz) => {
      const y = heightAt(x, z);
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 0.66), woodMat);
      seat.position.y = 0.48;
      seat.castShadow = true; seat.receiveShadow = true;
      g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.52, 0.12), woodMat);
      back.position.set(0, 0.86, -0.3);
      back.rotation.x = -0.15;
      back.castShadow = true;
      g.add(back);
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.48, 0.56), legMat);
        leg.position.set(s * 0.84, 0.24, 0);
        leg.castShadow = true;
        g.add(leg);
      }
      g.position.set(x, y, z);
      const ry = Math.atan2(fx, fz);   // 长椅局部 +z 为正面
      g.rotation.y = ry;
      this.scene.add(g);
      this.addBoxCol(x, z, 1.05, 0.36, ry);
    };
    // 路边：一段一段地摆，面朝路面（原来的广场环长椅随广场一起没了）
    const M = 26;
    for (let i = 2; i < M; i += 5) {
      const p = this.roadCurve.getPointAt(i / M);
      const tg = this.roadCurve.getTangentAt(i / M);
      const side = i % 10 < 5 ? 1 : -1;
      const x = p.x - tg.z * side * 5.4, z = p.z + tg.x * side * 5.4;
      if (heightAt(x, z) < -0.2 || this.inPond(x, z, 8)) continue;
      bench(x, z, tg.z * side, -tg.x * side);
    }
  }

  /** 路边木栅栏：立柱 + 两道横杆，沿道路一侧连续拉起（原版乡野的道具） */
  buildFence() {
    const postMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a6446'), flatShading: true, roughness: 1 });
    const railMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a37a55'), flatShading: true, roughness: 1 });
    const M = 26;
    let prev = null;
    for (let i = 0; i <= 8; i++) {
      const p = this.roadCurve.getPointAt(i / M);
      const tg = this.roadCurve.getTangentAt(i / M);
      const x = p.x - tg.z * 6.6, z = p.z + tg.x * 6.6;
      const y = heightAt(x, z);
      if (y < -0.3 || y > 14 || this.inPond(x, z, 8)) { prev = null; continue; }
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), postMat);
      post.position.set(x, y + 0.75, z);
      post.castShadow = true; post.receiveShadow = true;
      this.scene.add(post);
      if (prev) {
        const len = Math.hypot(x - prev.x, z - prev.z);
        const ry = -Math.atan2(z - prev.z, x - prev.x);
        const mx = (prev.x + x) / 2, mz = (prev.z + z) / 2;
        const by = Math.min(prev.y, y);
        for (const hy of [0.5, 1.05]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.11, 0.09), railMat);
          rail.position.set(mx, by + hy, mz);
          rail.rotation.y = ry;
          rail.castShadow = true;
          this.scene.add(rail);
        }
        this.addBoxCol(mx, mz, len / 2, 0.14, ry);
      }
      prev = { x, y, z };
    }
  }

  /** 睡莲池塘：石砌圆池 + 亮蓝水面 + 睡莲 + 芦苇 */
  buildPond() {
    const p = this.layoutPos.pond;
    const h = heightAt(p.x, p.z);
    const g = new THREE.Group();
    const rnd = mulberry32(31415);

    const bankMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7b7592'), flatShading: true, roughness: 1 });
    // 池身：一节矮石台，顶面略高于地面，把水和地面的接缝收干净
    const bank = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.9, 0.9, 40), bankMat);
    bank.position.y = -0.28;
    bank.receiveShadow = true;
    g.add(bank);
    // 砌石：沿池沿一圈大小石块
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const s = 0.55 + rnd() * 0.55;
      const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), bankMat);
      rk.position.set(Math.cos(a) * (5.7 + rnd() * 0.5), 0.16, Math.sin(a) * (5.7 + rnd() * 0.5));
      rk.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      rk.scale.set(1, 0.6, 1);
      rk.castShadow = true;
      g.add(rk);
    }

    // 水面：非受光材质（跟海同源），夜色里 celify 的蓝光不会把它洗掉
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.85, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#3f63ff') }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.24;
    g.add(water);
    // 水面亮边（原版水面的菲涅尔亮边）
    const edge = new THREE.Mesh(new THREE.RingGeometry(5.0, 5.85, 48, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fa4ff'), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.25;
    g.add(edge);

    // 睡莲：贴水的圆叶 + 零星粉花
    const padMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3f7a52'), emissive: new THREE.Color('#4fa86a'), emissiveIntensity: 0.3,
      flatShading: true, roughness: 1, side: THREE.DoubleSide,
    });
    const flowerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffd7ea'), emissive: new THREE.Color('#ff8fc0'), emissiveIntensity: 1.1, flatShading: true, roughness: 0.6,
    });
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 5.0;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.34 + rnd() * 0.3, 12), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = rnd() * 6.283;
      pad.position.set(Math.cos(a) * r, 0.29 + i * 0.001, Math.sin(a) * r);
      g.add(pad);
      if (rnd() < 0.28) {
        const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), flowerMat);
        fl.position.set(pad.position.x, 0.42, pad.position.z);
        fl.scale.set(1, 0.7, 1);
        g.add(fl);
      }
    }

    // 芦苇：池沿一圈细杆
    const reedMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6f8a45'), flatShading: true, roughness: 1 });
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 5.9 + rnd() * 0.9;
      const hh = 0.8 + rnd() * 0.9;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, hh, 6), reedMat);
      reed.position.set(Math.cos(a) * r, 0.16 + hh / 2, Math.sin(a) * r);
      reed.rotation.z = (rnd() - 0.5) * 0.35;
      g.add(reed);
    }

    g.position.set(p.x, h, p.z);
    g.rotation.y = 0.6;
    this.scene.add(g);
    this.addCyl(p.x, p.z, 6.25);   // 池水挡车（不许开进塘里）
  }

  /** 沿路排布灯柱：杆 + 锥形暖橙灯笼（原版最标志性的道具就是这盏暖橙斗笠灯） */
  buildLamps() {
    const poleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b3552'), flatShading: true, roughness: 0.7, metalness: 0.25 });
    // 灯笼罩：上窄下宽的斗笠状，本身带暖橙自发光（夜里 celify 会把任何非自发光物体乘成蓝紫，只有 emissive 才留得住橙色）
    const shadeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3a2f28'), emissive: new THREE.Color('#ff8641'), emissiveIntensity: 1.2,
      flatShading: true, roughness: 0.45, side: THREE.DoubleSide,
    });
    // 罩内的灯芯：更亮一点，靠 bloom 溢出一圈暖光
    const glassMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3a2f28'), emissive: new THREE.Color('#ffb066'), emissiveIntensity: 2.0, roughness: 0.35,
    });
    // 修灯：杆 + 斗笠罩 + 罩内暖橙灯芯（原版最标志性的道具）
    const lamp = (x, z) => {
      const y = heightAt(x, z);
      if (y < -0.2 || y > 14) return;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 3.3, 12), poleMat);
      pole.position.y = 1.65;
      pole.castShadow = true;
      g.add(pole);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.52, 0.46, 20, 1, true), shadeMat);
      shade.position.y = 3.4;
      g.add(shade);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 16), poleMat);
      cap.position.y = 3.62;
      g.add(cap);
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.32, 16), glassMat);
      bulb.position.y = 3.16;
      g.add(bulb);
      g.position.set(x, y, z);
      this.scene.add(g);
      this.addCyl(x, z, 0.3);
    };
    // 每座回忆柱的外侧一盏：一路点亮的灯笼，本身就是"该往哪开"的路标
    for (const p of this.heartPos) {
      const d = Math.hypot(p.x, p.z) || 1;
      lamp(p.x + (p.x / d) * 3.8, p.z + (p.z / d) * 3.8);
    }
    // 长弧中段再补几盏，免得两个回忆点之间黑着（放在心形的内侧，不跟外面那圈打架）
    const M = 32;
    for (let i = 0; i < M; i += 2) {
      const p = heartPoint((i + 0.5) / M);
      const d = Math.hypot(p.x, p.z) || 1;
      lamp(p.x - (p.x / d) * 3.8, p.z - (p.z / d) * 3.8);
    }
  }

  /**
   * 心形外沿的道具堆：木箱 / 石堆。原版车边永远堆着道具，
   * 现在广场没了，就改成撒在部分回忆柱外侧的空地上（离路面足够远，不挡车也不挡路）。
   */
  buildHedge() {
    const woodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a6446'), flatShading: true, roughness: 1 });
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8b84a8'), flatShading: true, roughness: 1 });
    const rnd = mulberry32(777);
    const M = 20;
    for (let i = 0; i < M; i++) {
      const p = heartPoint(i / M);
      const d = Math.hypot(p.x, p.z) || 1;
      // 外侧 7.5±1.2（路半宽 2.6 + 灯柱 3.8，再往外一点，谁也不打架）
      const off = 7.5 + rnd() * 2.4;
      const x = p.x + (p.x / d) * off, z = p.z + (p.z / d) * off;
      const y = heightAt(x, z);
      if (y < -0.3) continue;
      if (rnd() < 0.45) {
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const s = 0.72 + rnd() * 0.32;
          const c = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.86, s * 1.12), woodMat);
          c.position.set(x + (rnd() - 0.5) * 1.2, y + s * 0.43 + k * s * 0.86, z + (rnd() - 0.5) * 1.2);
          c.rotation.y = rnd() * 0.8;
          c.castShadow = true; c.receiveShadow = true;
          this.scene.add(c);
          this.addCyl(c.position.x, c.position.z, s * 0.62);
        }
      } else {
        for (let k = 0; k < 3; k++) {
          const s = 0.42 + rnd() * 0.78;
          const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
          rk.position.set(x + (rnd() - 0.5) * 1.9, y + s * 0.34, z + (rnd() - 0.5) * 1.9);
          rk.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
          rk.castShadow = true; rk.receiveShadow = true;
          this.scene.add(rk);
          this.addCyl(rk.position.x, rk.position.z, s * 0.75);
        }
      }
    }
  }

  /** 成簇草叶 + 碎石：用 InstancedMesh，几千个也只有一次 draw call */
  buildScatter(rnd) {
    const dummy = new THREE.Object3D();

    const tuft = tuftGeometry();
    // 草色跟地形同一族：原版草叶的颜色直接取自 terrain.colorNode（黄绿 + 青绿）
    const grassMats = ['#6f9a3c', '#5c8333', '#86a845', '#4c6b2e']
      .map(c => new THREE.MeshStandardMaterial({
        color: new THREE.Color(c), flatShading: true, roughness: 1, side: THREE.DoubleSide,
      }));

    // 原版 Grass.js 是 subdivisions=280 → 约 0.69 m 一根；但更关键的是它按 terrainData.g 的
    // 噪声遮罩成片生长，不是全岛插满尖刺 —— 上一版就是漏了这层遮罩，才把岛扎成了刺猬。
    const perMat = 4200;
    for (const mat of grassMats) {
      const im = new THREE.InstancedMesh(tuft, mat, perMat);
      let n = 0, guard = 0;
      while (n < perMat && guard < perMat * 30) {
        guard++;
        const a = rnd() * Math.PI * 2;
        const r = 8 + Math.sqrt(rnd()) * 148;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const y = heightAt(x, z);
        if (y < -0.35 || y > 16) continue;
        if (Math.hypot(x, z) < HOME_R) continue;
        if (this.nearRoad(x, z, 3.4)) continue;
        if (this.inPond(x, z, 8)) continue;
        // 成片遮罩：草只长在"草地斑块"里，斑块之间留出裸地
        const patch = Math.sin(x * 0.045 + 1.7) * Math.cos(z * 0.041 - 0.6) + 0.45 * Math.sin((x + z) * 0.09);
        if (patch < 0.05) continue;
        dummy.position.set(x, y - 0.03, z);
        dummy.rotation.set(0, rnd() * 6.283, 0);
        const sc = 0.7 + rnd() * 0.75;
        dummy.scale.set(sc, sc * (0.7 + rnd() * 0.5), sc);
        dummy.updateMatrix();
        im.setMatrixAt(n++, dummy.matrix);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      this.scene.add(im);
    }

    // 碎石 / 地面碎屑
    const pebbleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8d88a4'), flatShading: true, roughness: 1 });
    const pebble = new THREE.IcosahedronGeometry(0.13, 0);
    const pn = 420;
    const pim = new THREE.InstancedMesh(pebble, pebbleMat, pn);
    let pi = 0, pguard = 0;
    while (pi < pn && pguard < pn * 20) {
      pguard++;
      const a = rnd() * Math.PI * 2;
      const r = 4 + Math.sqrt(rnd()) * 178;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = heightAt(x, z);
      if (y < -0.2 || y > 16) continue;
      if (Math.hypot(x, z) < HOME_R - 1) continue;       // 家里那片空地不撒碎石
      if (this.inPond(x, z, 7.2)) continue;
      dummy.position.set(x, y + 0.04, z);
      dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      const sc = 0.5 + rnd() * 1.3;
      dummy.scale.set(sc, sc * 0.7, sc);
      dummy.updateMatrix();
      pim.setMatrixAt(pi++, dummy.matrix);
    }
    pim.count = pi;
    pim.instanceMatrix.needsUpdate = true;
    pim.frustumCulled = false;
    this.scene.add(pim);
  }

  /**
   * 铺装地上撒的小方块"落叶/花瓣"（原版 Leaves.js：PlaneGeometry(1,1) 双面、颜色 #95513a ↔ #f56a3a）
   * 这是原版地面质感里最抓眼的一笔：浅色铺装 + 深色碎点。
   */
  buildLeaves(rnd) {
    const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const N = 640;
    const im = new THREE.InstancedMesh(geo, mat, N);
    const dummy = new THREE.Object3D();
    // 原版 Leaves.js 的暖棕配色（#95513a ↔ #f56a3a）在夜里被 celify 的蓝光一乘会偏酒红，看着像撒了一地彩纸屑。
    // 换成一对深蓝紫，才是实拍里那种"深蓝地面上的一层更深的紫点"。
    const cA = new THREE.Color('#241f3f'), cB = new THREE.Color('#4a3a6e'), cc = new THREE.Color();
    let n = 0, guard = 0;
    while (n < N && guard < N * 12) {
      guard++;
      // 沿着整条心形道路两侧大抖动散布（原来"广场铺装撒叶"那一支随广场一起没了）
      const p = this.roadCurve.getPointAt(rnd());
      const x = p.x + (rnd() - 0.5) * 11;
      const z = p.z + (rnd() - 0.5) * 11;
      const y = heightAt(x, z) + 0.13;
      if (y < -0.4) continue;                            // 别撒到海里
      if (Math.hypot(x, z) < HOME_R - 1) continue;       // 家里那片空地干净点
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rnd() * 6.283, 0);
      const s = 0.16 + rnd() * 0.26;
      dummy.scale.set(s, 1, s * (0.7 + rnd() * 0.6));
      dummy.updateMatrix();
      im.setMatrixAt(n, dummy.matrix);
      cc.copy(cA).lerp(cB, rnd());
      im.setColorAt(n, cc);
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    this.scene.add(im);
    this.leaves = im;
  }

  /** 路面的粗网格：让草簇 / 碎石能快速避开路面 */
  nearRoad(x, z, d) {
    const grid = this.roadGrid;
    if (!grid) return false;
    const cell = grid.cell;
    const i = Math.floor(x / cell), j = Math.floor(z / cell);
    const d2 = d * d;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = grid.map.get((i + a) * 100000 + (j + b));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 2) {
          const dx = arr[k] - x, dz = arr[k + 1] - z;
          if (dx * dx + dz * dz < d2) return true;
        }
      }
    }
    return false;
  }

  buildRoads() {
    // 路就是这条心形本身：沿心形密采样之后闭合，车沿着它走一圈 = 按时间顺序走完 16 段回忆
    const pts = [];
    const M = 96;
    for (let i = 0; i < M; i++) {
      const p = heartPoint(i / M);
      pts.push(new THREE.Vector3(p.x, 0, p.z));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.roadCurve = curve;

    // 路网粗网格：给草簇 / 碎石做避让判断
    const cell = 5, map = new Map();
    for (let i = 0; i <= 800; i++) {
      const p = curve.getPointAt(i / 800);
      const k = Math.floor(p.x / cell) * 100000 + Math.floor(p.z / cell);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p.x, p.z);
    }
    this.roadGrid = { cell, map };

    const N = 420;
    const verts = [], idx = [], W = 2.6;
    const samples = curve.getSpacedPoints(N);
    for (let i = 0; i <= N; i++) {
      const p0 = samples[i];
      const p1 = samples[(i + 1) % (N + 1)];
      const dir = new THREE.Vector3().subVectors(p1, p0).setY(0).normalize();
      const nx = -dir.z, nz = dir.x;
      for (const s of [-1, 1]) {
        const x = p0.x + nx * W * s, z = p0.z + nz * W * s;
        verts.push(x, heightAt(x, z) + 0.1, z);
      }
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d2 = a + 3;
      idx.push(a, c, b, b, c, d2);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({
      color: new THREE.Color('#aaa8cd'), roughness: 0.9, side: THREE.DoubleSide,
    }));
    road.receiveShadow = true;
    this.scene.add(road);
    this.roads.push(road);
  }

  buildDock(rnd) {
    const a = 4.15, r = 186;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const baseY = SEA_Y + 0.9;
    const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8d6a4e'), flatShading: true, roughness: 1 });
    const g = new THREE.Group();
    const dirv = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
    const ang = Math.atan2(dirv.x, dirv.z);
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.22, 0.72), wood);
      b.position.set(0, baseY + Math.sin(i) * 0.02, -i * 0.85);
      b.rotation.z = 0;
      g.add(b);
    }
    for (let i = 0; i < 8; i++) {
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 10), wood);
        post.position.set(s * 2.3, baseY - 1.0, -i * 1.7);
        g.add(post);
      }
    }
    g.position.set(cx, 0, cz);
    g.rotation.y = ang;
    this.scene.add(g);

    // 小船
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 5.2, 12, 1, false),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9715f'), flatShading: true, roughness: 0.85 })
    );
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = Math.PI / 5;
    hull.scale.set(1, 1, 0.55);
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 8), wood);
    mast.position.y = 2.2;
    boat.add(mast);
    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 3),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#fff1e2'), side: THREE.DoubleSide, roughness: 0.9 })
    );
    sail.position.set(0.1, 2.4, 0);
    sail.rotation.y = 0.2;
    boat.add(sail);
    boat.position.set(cx - 20, SEA_Y + 0.55, cz - 14);
    boat.rotation.y = 1.2;
    this.scene.add(boat);
    this.boat = boat;
  }

  /* ---------- 4. 地标 ---------- */
  buildLandmarks() {
    MEMORIES.forEach((m, i) => this.addMemory(m, i));
    this.addAlbum(this.layoutPos.album);
    this.addStone(this.layoutPos.stone);
    this.addHome(this.layoutPos.home);
    this.buildPicks();
  }

  /** 每个交互点放一颗不可见的球，方便点选 */
  buildPicks() {
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const shape = {
      memory: [3.2, 3.0],
      album: [11, 4.2],
      stone: [8.5, 5.2],
      home: [7.6, 5.0],
      cat: [2.4, 1.0],
    };
    for (const n of this.pickTargets) {
      const [r, cy] = shape[n.kind] || [3, 2];
      const rr = n.kind === 'memory' ? (n.radius || r) : r;
      const m = new THREE.Mesh(new THREE.SphereGeometry(rr, 10, 8), mat);
      m.position.set(n.pos.x, n.pos.y + cy, n.pos.z);
      m.userData.node = n;
      this.scene.add(m);
      this.pickMeshes.push(m);
    }
  }

  addMemory(m, index = 0) {
    const accent = ACCENTS[index % ACCENTS.length];
    const isSecret = !!m.secret;
    const scale = isSecret ? 1.15 : 1;
    const g = new THREE.Group();
    const pos = m._pos;
    const y = heightAt(pos.x, pos.z);
    // 光柱挡车：撞上去会滑开 —— 但撞击本身会被 vehicle 回报给 main，用来触发回忆
    this.addCyl(pos.x, pos.z, 0.92 * scale, { kind: 'memory', key: m.id, index });

    // 原版每座地标的形制是「一根半透明的玻璃立柱」，不是方形台座 ——
    // 上一版那个 6 边形大台座 + 亮黄绿顶面在开场视野里糊了半屏，这里整体收细。
    const baseMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e2a44'), flatShading: true, roughness: 0.9 });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.88, 0.2, 24), baseMat);
    ped.position.y = 0.1;
    ped.castShadow = true;
    ped.receiveShadow = true;
    g.add(ped);

    // 玻璃柱：半透明冷调玻璃管。上一版 opacity 0.17 太淡，肉眼只剩下"台座 + 光圈"，
    // 柱子本身读不出来 —— 提到 0.3，让它成为画面的主体
    const towerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#9fb4ff'), flatShading: true, roughness: 0.16, metalness: 0.45,
      transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
    });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.6, 3.5, 24, 1, true), towerMat);
    tower.position.y = 1.95;
    g.add(tower);

    const bandMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#241f2e'), emissive: new THREE.Color(accent), emissiveIntensity: 1.0,
      flatShading: true, roughness: 0.5,
    });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.08, 24), bandMat);
    band.position.y = 3.72;
    g.add(band);

    const orbMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(accent), emissive: new THREE.Color(accent), emissiveIntensity: 1.2,
      flatShading: true, roughness: 0.4, metalness: 0.2,
    });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 2), orbMat);
    orb.position.y = 1.9;
    g.add(orb);

    // 柱顶向上的一束柔光：外壳 + 亮芯，夜里必须看起来像光、而不是一根实心柱子
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.05, 6.4, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent), transparent: true, opacity: 0.11,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
      })
    );
    beam.position.y = 6.9;
    g.add(beam);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.016, 6.4, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    core.position.y = 6.9;
    g.add(core);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.02, 64),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent), transparent: true, opacity: 0.45,
        side: THREE.DoubleSide, depthWrite: false, fog: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.19;
    g.add(ring);

    const icon = iconSprite(m.icon, accent, 256, 16);
    icon.position.y = 4.5;
    icon.scale.set(1, 1, 1);
    g.add(icon);

    const label = labelSprite(m.date, m.title, accent);
    label.position.y = 5.3;
    g.add(label);

    g.position.set(pos.x, y - 0.05, pos.z);
    g.scale.setScalar(scale);
    this.scene.add(g);

    const key = m.id;
    const marker = {
      key, kind: 'memory', data: m, accent, index,
      pos: new THREE.Vector3(pos.x, y, pos.z),
      group: g, orb, ring, beam, icon, band, label, tower, core,
      radius: 3.6 * scale,
      visited: false,
      state: '',            // '' | 'locked' | 'active'：顺序锁的三态外观
    };
    // 刚建出来统一是"锁着"的样子；main 会在装配完存档之后用 refreshGuide() 把它拨正
    this.markers.push(marker);
    this.pickTargets.push(marker);
    this.setMemoryState(key, 'locked');
  }

  /**
   * 拨回忆柱的外观：只有三种状态
   *   'normal' 还没轮到它（但也不该走到这里）
   *   'locked' 还没轮到 —— 灰掉、暗掉
   *   'active' 轮到它了 —— 保持最亮 + 呼吸（由 main 每帧推一次 ring 脉冲）
   * 已 visited 的柱子交给 setVisited() 收暗，所以这里遇到 visited 直接返回。
   */
  setMemoryState(key, state) {
    const mk = this.pickTargets.find(m => m.key === key);
    if (!mk || mk.kind !== 'memory' || mk.visited) return;
    if (mk.state === state) return;
    mk.state = state;
    const on = state === 'active';
    const lock = state === 'locked';
    if (mk.orb) {
      mk.orb.material.emissive.set(lock ? '#5a5a72' : mk.accent);
      mk.orb.material.color.set(lock ? '#4a4a60' : mk.accent);
      mk.orb.material.emissiveIntensity = lock ? 0.3 : (on ? 1.8 : 1.2);
    }
    if (mk.band) {
      mk.band.material.emissive.set(lock ? '#5a5a72' : mk.accent);
      mk.band.material.emissiveIntensity = lock ? 0.25 : 1.0;
    }
    if (mk.ring) mk.ring.material.opacity = lock ? 0.14 : (on ? 0.62 : 0.45);
    if (mk.beam) mk.beam.material.opacity = lock ? 0.03 : (on ? 0.2 : 0.11);
    if (mk.core) mk.core.material.opacity = lock ? 0.16 : (on ? 0.85 : 0.5);
    if (mk.tower) mk.tower.material.opacity = lock ? 0.16 : (on ? 0.42 : 0.3);
    if (mk.icon) mk.icon.material.opacity = lock ? 0.35 : 1;
    if (mk.label) mk.label.material.opacity = lock ? 0.3 : 1;
    this.activeMark = on ? mk : (this.activeMark === mk ? null : this.activeMark);
  }

  addAlbum(p) {
    const y = heightAt(p.x, p.z);
    const g = new THREE.Group();
    const accent = '#ffc67b';

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(10, 11, 0.6, 32),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#d3c3ae'), flatShading: true, roughness: 0.9 }));
    pad.position.y = -0.1;
    pad.receiveShadow = true;
    g.add(pad);

    const arch = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.55, 10, 64, Math.PI),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a4d63'), flatShading: true, roughness: 0.8 }));
    arch.position.y = 0.4;
    g.add(arch);
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.4),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a4d63'), flatShading: true }));
      col.position.set(s * 6.4, 0.3, 0);
      g.add(col);
      this.addBoxCol(p.x + s * 6.4, p.z, 0.7, 0.7, 0);   // 拱柱挡车（group 无旋转，局部偏移即世界偏移）
    }

    // 悬浮照片
    const spin = new THREE.Group();
    spin.position.y = 3.4;
    const loader = new THREE.TextureLoader();
    const picks = [ALBUM[0], ALBUM[8], ALBUM[14], ALBUM[20], ALBUM[26], ALBUM[31]].filter(Boolean);
    picks.forEach((it, i) => {
      const a = (i / picks.length) * Math.PI * 2;
      const tex = loader.load(photoUrl(it.p, true));
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2.5, 1.75),
        new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85, emissive: new THREE.Color('#2a2130'), emissiveIntensity: 0.5 })
      );
      m.position.set(Math.cos(a) * 4.6, 0, Math.sin(a) * 4.6);
      m.rotation.y = -a + Math.PI / 2;
      spin.add(m);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.95),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#efe3d4'), side: THREE.DoubleSide, roughness: 0.9 }));
      back.position.copy(m.position);
      back.rotation.y = m.rotation.y;
      back.position.multiplyScalar(0.985);
      spin.add(back);
    });
    g.add(spin);

    const light = new THREE.PointLight(new THREE.Color('#ffc67b'), 22, 34, 2);
    light.position.y = 3.4;
    g.add(light);

    g.position.set(p.x, y, p.z);
    this.scene.add(g);

    this.pickTargets.push({
      key: 'album', kind: 'album', title: '相册', date: '在一起的日子里',
      pos: new THREE.Vector3(p.x, y, p.z), group: g, orb: spin, ring: null,
      accent, radius: 12, visited: false,
    });
    this.albumNode = { group: g, spin };
  }

  addStone(p) {
    const y = heightAt(p.x, p.z);
    const g = new THREE.Group();
    const accent = '#d5ff95';

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 0.6, 32),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#544a5e'), flatShading: true, roughness: 0.92 }));
    pad.position.y = -0.1;
    pad.receiveShadow = true;
    g.add(pad);

    const faceTex = canvasTex(640, 1024, (ctx, W, H) => {
      ctx.fillStyle = '#9c94a6';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      for (let i = 0; i < 60; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * W, Math.random() * H, 6 + Math.random() * 26, 0, 6.3);
        ctx.fill();
      }
      ctx.fillStyle = '#e9ffcf';
      ctx.font = '600 44px "STKaiti","KaiTi","Songti SC",serif';
      ctx.textAlign = 'center';
      const col = '这是最好的时代这是最坏的时代这是智慧的年代这是愚蠢的年代';
      for (let i = 0; i < col.length; i++) {
        ctx.fillText(col[i], W * 0.5, 120 + i * 52);
      }
      ctx.fillStyle = '#d5ff95';
      ctx.font = '600 40px "STKaiti","KaiTi","Songti SC",serif';
      const col2 = '双城记';
      ctx.fillText(col2[0], W * 0.17, 210);
      ctx.fillText(col2[1], W * 0.17, 262);
      ctx.fillText(col2[2], W * 0.17, 314);
      ctx.font = '600 30px Nunito, sans-serif';
      ctx.fillText('1859', W * 0.17, 372);
    });
    const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8b828f'), flatShading: true, roughness: 0.9 });
    const frontMat = new THREE.MeshStandardMaterial({ map: faceTex, flatShading: true, roughness: 0.85, emissive: new THREE.Color('#26331c'), emissiveIntensity: 0.35 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 9.4, 1.5), [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat]);
    slab.position.y = 4.7;
    slab.castShadow = true;
    slab.rotation.y = -0.5;
    g.add(slab);
    this.addBoxCol(p.x, p.z, 2.6, 0.75, -0.5);          // 石碑挡车（group 无旋转）

    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const rr = 0.5 + Math.random() * 0.5;
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#6d6478'), flatShading: true, roughness: 0.95 }));
      s.position.set(Math.cos(a) * 6.4, 0.4, Math.sin(a) * 6.4);
      s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      g.add(s);
      this.addCyl(p.x + Math.cos(a) * 6.4, p.z + Math.sin(a) * 6.4, rr * 0.9);   // 环碑碎石挡车
    }

    const glow = new THREE.PointLight(new THREE.Color('#d5ff95'), 16, 30, 2);
    glow.position.set(0, 7.5, 0);
    g.add(glow);

    g.position.set(p.x, y, p.z);
    this.scene.add(g);

    this.pickTargets.push({
      key: 'stone', kind: 'stone', title: '双城记', date: '1859',
      pos: new THREE.Vector3(p.x, y, p.z), group: g, orb: slab, ring: null,
      accent, radius: 11, visited: false,
    });
    this.stoneNode = { group: g, slab };
  }

  addHome(p) {
    const y = heightAt(p.x, p.z);
    this.homeCenter.set(p.x, y, p.z);   // 收尾判定：车开进院子（到家中心 < 9）就算"回到家"
    const g = new THREE.Group();
    const accent = '#ff6a7c';

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 0.7, 36),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#cbbb9f'), flatShading: true, roughness: 0.92 }));
    pad.position.y = -0.15;
    pad.receiveShadow = true;
    g.add(pad);

    const wall = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f1e7db'), flatShading: true, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(10.4, 5.6, 8), wall);
    body.position.y = 2.8;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const up = new THREE.Mesh(new THREE.BoxGeometry(10.8, 5.2, 8.4), wall);
    up.position.set(-0.2, 8.1, -0.2);
    up.castShadow = true;
    g.add(up);

    // 坡屋顶：原版那间小屋是双坡硬山顶，上一版用两个四棱锥（攒尖顶）叠着，不像房子。
    // 两块斜板在屋脊对拼 + 屋脊压条 + 两端三角山墙。
    const roofMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b4614f'), flatShading: true, roughness: 0.88 });
    const trimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7d4437'), flatShading: true, roughness: 0.9 });
    const RIDGE_Y = 14.1, EAVE_Y = 11.4, HALF = 5.0, RW = 11.6;
    const slopeLen = Math.hypot(HALF, RIDGE_Y - EAVE_Y);
    const tilt = Math.atan2(RIDGE_Y - EAVE_Y, HALF);
    for (const s of [1, -1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.34, slopeLen), roofMat);
      slab.position.set(0, (RIDGE_Y + EAVE_Y) / 2, (s * HALF) / 2);
      slab.rotation.x = s * tilt;   // 正号让外侧（+z / -z 端）压低 → 形成向外的坡
      slab.castShadow = true;
      g.add(slab);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(RW + 0.4, 0.24, 0.56), trimMat);
    ridge.position.y = RIDGE_Y + 0.12;
    ridge.castShadow = true;
    g.add(ridge);
    // 山墙：两端各一块三角形封边（ShapeGeometry，与墙体同色）
    const tri = new THREE.Shape();
    tri.moveTo(-RW / 2, 0);
    tri.lineTo(RW / 2, 0);
    tri.lineTo(0, RIDGE_Y - EAVE_Y);
    tri.closePath();
    const gableGeo = new THREE.ShapeGeometry(tri);
    for (const s of [1, -1]) {
      const gm = new THREE.Mesh(gableGeo, wall);
      gm.position.set(s * 5.4, EAVE_Y, 0);
      gm.rotation.y = s * Math.PI / 2;   // 法线朝外，背面剔除才不会被看穿
      gm.castShadow = true;
      g.add(gm);
    }

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.9, 3.1, 0.3),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#7d4437'), flatShading: true, roughness: 0.8 }));
    door.position.set(0, 1.55, 4.05);
    g.add(door);
    const warmMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3b3030'), emissive: new THREE.Color('#ffcd8a'), emissiveIntensity: 1.3, roughness: 0.5,
    });
    for (const [wx, wy, wz, sz] of [[-3.1, 3.4, 4.05, 0], [3.1, 3.4, 4.05, 0], [-0.2, 9.1, 4.05, 0], [5.25, 3.4, 1.6, 1], [-5.25, 3.4, 1.6, 1], [5.25, 9.1, -1.4, 1], [-5.25, 9.1, -1.4, 1]]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(sz ? 0.26 : 1.7, 1.7, sz ? 1.7 : 0.26), warmMat);
      w.position.set(wx, wy, wz);
      g.add(w);
    }

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.3, 3.4, 1.3), trimMat);
    chimney.position.set(3.6, 13.1, -1.2);
    chimney.castShadow = true;
    g.add(chimney);

    // 栅栏：正对大门留一道院门，车才进得了院子
    const fenceMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e0d3c0'), flatShading: true, roughness: 0.95 });
    const FR = 9.6;
    // 院门开在房子的正前方（局部 +z，即局部角 π/2）。group 转了 -0.35，
    // 所以世界角 = 局部角 + 0.35 —— 门口方向和门的碰撞缺口都用这个值。
    // 18 根柱子每 20° 一根：按 0.50 rad 掐掉正好 2 根，留下 2π/18 = 20° 的两根作门框；
    // 碰撞口用 0.52（比门框净空略小），这样绝不会出现"看不见的墙"。
    const GATE_LOCAL = Math.PI / 2;
    const GATE_SEL = 0.5, GATE_HALF = 0.52;
    const atGate = (a) => Math.abs(Math.atan2(Math.sin(a - GATE_LOCAL), Math.cos(a - GATE_LOCAL))) < GATE_SEL;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const a2 = ((i + 1) / 18) * Math.PI * 2;
      const gateA = atGate(a), gateB = atGate(a2);
      if (!gateA) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), fenceMat);
        post.position.set(Math.cos(a) * FR, 0.75, Math.sin(a) * FR);
        g.add(post);
      }
      if (!gateA && !gateB) {
        const x2 = Math.cos(a2) * FR, z2 = Math.sin(a2) * FR;
        const len = Math.hypot(x2 - Math.cos(a) * FR, z2 - Math.sin(a) * FR);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.1), fenceMat);
        rail.position.set((Math.cos(a) * FR + x2) / 2, 1.15, (Math.sin(a) * FR + z2) / 2);
        rail.rotation.y = -Math.atan2(z2 - Math.sin(a) * FR, x2 - Math.cos(a) * FR);
        g.add(rail);
      }
    }
    // 院墙整圈挡车（环与 group 的 -0.35 旋转无关，中心仍在 (p.x,p.z)），院门处放行
    this.addRing(p.x, p.z, FR, 0.28, GATE_LOCAL + 0.35, GATE_HALF);
    // 房子本体挡车：两层盒体并集，随 group 一起转了 -0.35
    this.addBoxCol(p.x, p.z, 5.5, 4.3, -0.35);

    // 灌木
    const bushMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4d7a5c'), flatShading: true, roughness: 0.95 });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.35 + 0.7;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), bushMat);
      b.position.set(Math.cos(a) * 8.2, 0.5, Math.sin(a) * 8.2);
      b.scale.set(1, 0.8, 1);
      g.add(b);
    }

    // 灯串
    const bulbs = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffd9a0'), emissive: new THREE.Color('#ffc67b'), emissiveIntensity: 1.6 }));
      b.position.set(Math.cos(a) * 9.2, 2.9 + Math.sin(a * 3) * 0.35, Math.sin(a) * 9.2);
      g.add(b);
      bulbs.push(b);
    }
    g.add(new THREE.PointLight(new THREE.Color('#ffc67b'), 26, 26, 2).translateY(3.4));

    g.position.set(p.x, y, p.z);
    g.rotation.y = -0.35;
    this.scene.add(g);

    // 全部点亮的庆祝光环（默认隐藏）
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(12.6, 0.22, 8, 120),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ff87a2'), transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(p.x, y + 0.2, p.z);
    halo.visible = false;
    this.scene.add(halo);

    this.pickTargets.push({
      key: 'home', kind: 'home', title: '我们的家', date: '2024.10.01',
      pos: new THREE.Vector3(p.x, y, p.z), group: g, orb: null, ring: null,
      accent, radius: 13, visited: false,
    });
    this.homeNode = { group: g, bulbs, halo };

    // 仙姑（在院子里）
    const cat = this.makeCat();
    cat.position.set(p.x + 7.4, heightAt(p.x + 7.4, p.z + 5.6), p.z + 5.6);
    cat.rotation.y = -2.1;
    this.scene.add(cat);
    this.pickTargets.push({
      key: 'cat', kind: 'cat', title: '仙姑', date: '2020.05.28',
      pos: new THREE.Vector3(p.x + 7.4, cat.position.y, p.z + 5.6), group: cat,
      orb: cat, ring: null, accent: '#ff87a2', radius: 3.4, visited: false,
    });
    this.catNode = cat;
  }

  makeCat() {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e8dccb'), flatShading: true, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3c39'), flatShading: true, roughness: 1 });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), fur);
    body.scale.set(1.15, 0.95, 1.5);
    body.position.y = 0.62;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), fur);
    head.position.set(0, 1.16, 0.72);
    head.castShadow = true;
    g.add(head);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), fur);
      ear.position.set(s * 0.26, 1.5, 0.68);
      ear.rotation.z = s * 0.16;
      g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), dark);
      eye.position.set(s * 0.16, 1.2, 1.06);
      g.add(eye);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.1, 8), fur);
    tail.position.set(0, 0.95, -0.85);
    tail.rotation.x = -0.9;
    g.add(tail);
    for (const s of [-1, 1]) {
      const paw = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), fur);
      paw.position.set(s * 0.3, 0.25, 0.5);
      g.add(paw);
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 6, 20),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff87a2'), emissive: new THREE.Color('#ff87a2'), emissiveIntensity: 0.5 }));
    collar.position.set(0, 0.98, 0.62);
    collar.rotation.x = 1.1;
    g.add(collar);
    return g;
  }

  /* ---------- 运行时 ---------- */
  update(dt) {
    this.time += dt;
    if (this.fireflies) {
      this.fireflies.rotation.y += dt * 0.012;
      this.fireflies.material.opacity = 0.62 + Math.sin(this.time * 0.7) * 0.22;
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.spd * dt;
      if (c.position.x > 260) c.position.x = -260;
    }
    if (this.boat) {
      this.boat.position.y = SEA_Y + 0.55 + Math.sin(this.time * 0.9) * 0.16;
      this.boat.rotation.z = Math.sin(this.time * 0.7) * 0.045;
    }
    for (const mk of this.markers) {
      mk.orb.rotation.y += dt * 0.7;
      mk.orb.rotation.x += dt * 0.25;
      mk.orb.position.y = 1.9 + Math.sin(this.time * 1.3 + mk.pos.x * 0.1) * 0.09;
      mk.icon.position.y = 4.5 + Math.sin(this.time * 1.1 + mk.pos.z * 0.1) * 0.09;
      mk.label.position.y = 5.3 + Math.sin(this.time * 1.1 + mk.pos.z * 0.1) * 0.09;
    }
    if (this.albumNode) this.albumNode.spin.rotation.y += dt * 0.24;
    if (this.homeNode) {
      const t = this.time * 2.2;
      this.homeNode.bulbs.forEach((b, i) => {
        b.material.emissiveIntensity = 1.2 + Math.sin(t + i * 0.5) * 0.5;
      });
    }
    if (this.catNode) {
      this.catNode.rotation.y = -2.1 + Math.sin(this.time * 0.5) * 0.35;
    }
    if (this.homeHalo && this.homeNode.halo) {
      this.homeNode.halo.rotation.z += dt * 0.35;
      this.homeNode.halo.material.opacity = 0.55 + Math.sin(this.time * 2.2) * 0.3;
    }
    // 该撞的那根光柱：脚下那圈光环轻轻呼吸，让"下一步"一眼看得出来
    if (this.activeMark && this.activeMark.ring) {
      const pulse = Math.sin(this.time * 3.1);
      this.activeMark.ring.scale.setScalar(1 + pulse * 0.17);
      this.activeMark.ring.material.opacity = 0.58 + pulse * 0.22;
    }
    this._updateFireworks(dt);
  }

  /* ---------- 5. 烟花（集齐 16 段、回到家之后放） ---------- */

  /** 放一轮烟花：n 发炮弹从岛上不同位置升空，到顶炸开成一朵 */
  launchFireworks(n = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 58;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y0 = Math.max(heightAt(x, z), 0);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x, y0 + 2, z]), 3));
      const col = new THREE.Color().setHSL(Math.random(), 0.85, 0.62);
      const mat = new THREE.PointsMaterial({
        color: col, size: 0.6, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.fireworks.push({
        pts, x, z, y: y0 + 2, col,
        top: y0 + 28 + Math.random() * 16,
        vy: 27 + Math.random() * 8,
        delay: i * 0.5 + Math.random() * 0.3,
      });
    }
  }

  /** 炸开：K 个加性发光点向四面八方飞散，受重力 + 渐隐 */
  _spawnBurst(x, y, z, col) {
    const K = 88 + Math.floor(Math.random() * 45);
    const colors = new Float32Array(K * 3);
    const vel = [];
    const c = new THREE.Color();
    for (let k = 0; k < K; k++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = 6 + Math.random() * 9;
      vel.push(new THREE.Vector3(
        Math.sin(ph) * Math.cos(th) * sp,
        Math.cos(ph) * sp,
        Math.sin(ph) * Math.sin(th) * sp
      ));
      c.copy(col).offsetHSL((Math.random() - 0.5) * 0.14, 0, (Math.random() - 0.5) * 0.24);
      colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(K * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.72, transparent: true, opacity: 1, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false,
    });
    // 这个世界没有 tonemapping，additive 叠起来很容易糊成白 —— 把基色压到 0.9 留点色相
    mat.color.setScalar(0.9);
    const pts = new THREE.Points(geo, mat);
    pts.position.set(x, y, z);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this._bursts.push({ pts, vel, life: 2.2, fade: 1.6 });
  }

  /* ---------- 5b. 文字烟花（收尾：鸟瞰小岛 + 「老婆我爱你」五个字） ---------- */

  /**
   * 把一段文字画进离屏 canvas，再按网格采样成"点的形状"。
   * 返回每个字的点集（坐标是相对该字中心的像素偏移，y 向下）——
   * 后面映射到世界水平面上时：像素 x → 世界 x，像素 y → 世界 z，
   * 这样在"从天上往下看"的机位里，字是正的、不镜像的。
   */
  _sampleText(text, { font = 168, step = 5, gapRatio = 0.16 } = {}) {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const FONT = `bold ${font}px "Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif`;
    ctx.font = FONT;
    const chars = Array.from(text);
    const gap = Math.round(font * gapRatio);
    const widths = chars.map(c => ctx.measureText(c).width);
    const totalW = Math.round(widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1));
    cv.width = totalW + step * 2;
    cv.height = Math.round(font * 1.3);
    ctx.font = FONT;                    // 改过 canvas 尺寸后必须重设
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';

    const cy = cv.height / 2;
    const box = [];
    let px = step;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], px, cy);
      box.push({ x0: px - 1, x1: px + widths[i] + 1, cx: px + widths[i] / 2 });
      px += widths[i] + gap;
    }

    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const dots = chars.map(() => []);
    for (let y = step; y < cv.height; y += step) {
      for (let x = 0; x < cv.width; x += step) {
        if (data[(y * cv.width + x) * 4 + 3] < 128) continue;
        for (let i = 0; i < box.length; i++) {
          if (x >= box[i].x0 && x <= box[i].x1) { dots[i].push({ x: x - box[i].cx, y: y - cy }); break; }
        }
      }
    }
    return {
      dots,
      cxs: box.map(b => b.cx),
      totalW,
      center: cv.width / 2,
    };
  }

  /**
   * 文字烟花：每个字一发炮弹，从岛上不同位置升空，到顶后炸成那个字。
   * opts.width 是整段文字在世界里的宽度（由机位按屏幕比例算好传进来）
   */
  launchTextFireworks(text = '老婆我爱你', opts = {}) {
    const { width = 380, y = 46, delay = 2.0, stagger = 0.4 } = opts;
    const s = this._sampleText(text);
    if (!s.dots.some(d => d.length)) return;            // 字体回退到空字形时干脆不放
    const scale = width / s.totalW;                    // canvas 像素 → 世界单位
    const hues = [0.02, 0.10, 0.14, 0.92, 0.86, 0.06]; // 玫瑰红 → 金 → 粉紫
    for (let i = 0; i < s.dots.length; i++) {
      if (!s.dots[i].length) continue;
      const cx = (s.cxs[i] - s.center) * scale;
      const col = new THREE.Color().setHSL(hues[i % hues.length], 0.9, 0.68);
      const y0 = Math.max(heightAt(cx, 0), 0);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([cx, y0 + 2, 0]), 3));
      // 鸟瞰机位离得远（700+），这里不能再按世界尺寸缩放光点，否则缩成亚像素看不见 ——
      // 直接给恒定屏幕尺寸（sizeAttenuation: false，size 就是像素）
      const mat = new THREE.PointsMaterial({
        color: col, size: 3.0, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, fog: false,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.fireworks.push({
        pts, x: cx, z: 0, y: y0 + 2, col,
        // 一发够劲儿的炮弹：正好在这段文字所在的高度炸开（vy 给足，保证够得着）
        top: y, vy: 50 + Math.random() * 4,
        delay: delay + i * stagger + Math.random() * 0.08,
        text: { dots: s.dots[i], scale, size: 3.4 },
      });
    }
  }

  /** 文字炸开：点从爆心聚拢成字形 → 停住让人看清 → 变暗飘落 */
  _spawnTextBurst(x, y, z, col, dots, scale, size) {
    const K = dots.length;
    const src = new Float32Array(K * 3);
    const tgt = new Float32Array(K * 3);
    const colors = new Float32Array(K * 3);
    const spd = new Float32Array(K);
    const c = new THREE.Color();
    for (let k = 0; k < K; k++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const r0 = Math.random() * 1.7;                   // 起点：爆心附近的一小团
      src[k * 3] = x + Math.sin(ph) * Math.cos(th) * r0;
      src[k * 3 + 1] = y + Math.cos(ph) * r0;
      src[k * 3 + 2] = z + Math.sin(ph) * Math.sin(th) * r0;
      tgt[k * 3] = x + dots[k].x * scale;               // 终点：字形上的位置
      tgt[k * 3 + 1] = y;
      tgt[k * 3 + 2] = z + dots[k].y * scale;
      c.copy(col).offsetHSL((Math.random() - 0.5) * 0.05, 0, 0.05 + Math.random() * 0.25);
      colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
      spd[k] = 0.82 + Math.random() * 0.42;             // 到位快慢错开，像真的在聚拢
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(src, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size, transparent: true, opacity: 0, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, fog: false,
    });
    mat.color.setScalar(0.72);                          // 点会叠在一起 + 没有 tonemapping，压一点免得糊成白
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    // 时间线：聚拢 1.0s → 驻足 4.0s → 飘落渐隐 2.0s
    this._bursts.push({ pts, text: true, src, tgt, spd, age: 0, life: 7.0 });
  }

  _updateTextBurst(b, dt) {
    b.age += dt;
    const p = b.pts.geometry.attributes.position;
    const src = b.src, tgt = b.tgt, spd = b.spd;
    const n = spd.length;
    if (b.age < 1.0) {                                  // 聚拢成字
      for (let k = 0; k < n; k++) {
        let t = Math.min(1, b.age * spd[k]);
        t = 1 - Math.pow(1 - t, 3);
        p.setXYZ(k,
          src[k * 3] + (tgt[k * 3] - src[k * 3]) * t,
          src[k * 3 + 1] + (tgt[k * 3 + 1] - src[k * 3 + 1]) * t,
          src[k * 3 + 2] + (tgt[k * 3 + 2] - src[k * 3 + 2]) * t);
      }
      b.pts.material.opacity = Math.min(1, b.age / 0.28);
    } else if (b.age < 5.0) {                           // 停住：让人看清这五个字
      for (let k = 0; k < n; k++) p.setXYZ(k, tgt[k * 3], tgt[k * 3 + 1], tgt[k * 3 + 2]);
      b.pts.material.opacity = 1;
    } else {                                            // 飘落、渐隐
      const f = Math.min(1, (b.age - 5.0) / 2.0);
      for (let k = 0; k < n; k++) p.setXYZ(k, tgt[k * 3], tgt[k * 3 + 1] - f * f * 9, tgt[k * 3 + 2]);
      b.pts.material.opacity = 1 - f;
    }
    p.needsUpdate = true;
  }

  _updateFireworks(dt) {
    // 上升的炮弹
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const s = this.fireworks[i];
      s.delay -= dt;
      if (s.delay > 0) continue;
      s.vy -= 22 * dt;
      s.y += s.vy * dt;
      const p = s.pts.geometry.attributes.position;
      p.setY(0, s.y);
      p.needsUpdate = true;
      if (s.y >= s.top || s.vy <= 0) {
        this.scene.remove(s.pts);
        s.pts.geometry.dispose();
        s.pts.material.dispose();
        this.fireworks.splice(i, 1);
        if (s.text) {
          this._spawnTextBurst(s.x, s.y, s.z, s.col, s.text.dots, s.text.scale, s.text.size);
        } else {
          this._spawnBurst(s.x, s.y, s.z, s.col);
        }
      }
    }
    // 炸开的点云
    for (let i = this._bursts.length - 1; i >= 0; i--) {
      const b = this._bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this._bursts.splice(i, 1);
        continue;
      }
      if (b.text) { this._updateTextBurst(b, dt); continue; }
      const p = b.pts.geometry.attributes.position;
      for (let k = 0; k < b.vel.length; k++) {
        const v = b.vel[k];
        v.y -= 9 * dt;
        p.setXYZ(k, p.getX(k) + v.x * dt, p.getY(k) + v.y * dt, p.getZ(k) + v.z * dt);
      }
      p.needsUpdate = true;
      b.pts.material.opacity = Math.min(1, b.life / b.fade);
    }
  }


  setVisited(key, on = true) {
    const mk = this.pickTargets.find(m => m.key === key);
    if (!mk) return;
    mk.visited = on;
    if (on) {
      mk.state = '';
      if (this.activeMark === mk) this.activeMark = null;
      if (mk.icon) { mk.icon.material.opacity = 0.42; }
      if (mk.label) mk.label.material.opacity = 0.42;
      if (mk.ring) mk.ring.material.opacity = 0.1;
      if (mk.beam) mk.beam.material.opacity = 0.05;
      if (mk.core) mk.core.material.opacity = 0.12;
      if (mk.tower) mk.tower.material.opacity = 0.2;
      if (mk.orb && mk.orb.material && mk.orb.material.emissiveIntensity !== undefined) mk.orb.material.emissiveIntensity = 0.25;
      if (mk.band) mk.band.material.emissiveIntensity = 0.28;
    }
  }

  /** 车所在位置最近的可交互点 */
  nearest(pos, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const mk of this.pickTargets) {
      const d = mk.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = mk; }
    }
    return best;
  }

  glowHome(on) {
    if (!this.homeNode || !this.homeNode.halo) return;
    this.homeNode.halo.visible = on;
    this.homeHalo = on;
  }

  /* ---------- 6. 收尾鸟瞰用的小接口 ---------- */

  /** 收尾时相机要飞到很高，雾的远平面得暂时推开（关掉），否则整座岛被雾吞掉 */
  setFogRange(near, far) {
    if (this.scene.fog) { this.scene.fog.near = near; this.scene.fog.far = far; }
  }

  /** 天空穹顶球原本居中在原点，相机升到球半径之外就穿帮了 —— 让天穹跟着相机走 */
  skyFollow(x, y, z) {
    if (this.sky) this.sky.position.set(x, y, z);
  }
}

/* ---------------- 小工具 ---------------- */
function tooClose(list, x, z, min) {
  const m2 = min * min;
  for (const p of list) {
    const dx = p.x - x, dz = p.z - z;
    if (dx * dx + dz * dz < m2) return true;
  }
  return false;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
