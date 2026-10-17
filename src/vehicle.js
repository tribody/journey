/* =====================================================================
 * 车：自写街机物理（无 Rapier）
 * 前向 = (sin(yaw), cos(yaw))，四点采样地形高度得到俯仰 / 侧倾
 * ===================================================================== */
import * as THREE from '../vendor/three.module.min.js';

const MAX_FWD = 21;
const MAX_BACK = 7;
const ACCEL = 19;
const BRAKE = 30;
const TURN = 2.05;
// 模型局部原点 = 轮胎着地线（车体几何从 y=0 往上长），所以这里不再额外抬升
const RIDE = 0;
const WHEELBASE = 2.62;
const TRACK = 1.94;
const WHEEL_R = 0.5;

/* ---- 车辆动力学：让这套"街机手感"尽量靠向真车 ---- */
// 侧向抓地：轮胎每秒能吃掉多少侧滑速度。数值越大越"咬地"，越小越容易甩尾
const GRIP = 7.5;
// 坡度重力：沿车身前后方向的重力分量，上坡减速 / 下坡加速
const SLOPE_G = 8.5;
// 双圆胶囊：撞树 / 撞墙时用前后两个圆近似 4.6×2.3 的车身（不做旋转响应，够用且稳）
const BODY_R = 1.12;
const BODY_HALF = 1.25;
// 碰撞回弹：撞上去会被弹开一点点，而不是"贴"在障碍上
const REST = 0.18;
// 悬挂：底盘相对车轮的上下起伏，纯表现层（车轮始终贴地）。
// 单位是"地面每秒起伏 1 米 → 底盘下沉多少米"，只影响观感，不影响轨迹
const SUSP_K = 0.03;
// 涉水深度：比海平面低这么多的浅滩越野车还能蹚过去，更深就挡住
// （岸边大部分滩涂都在这个深度以内；唯一泡在浅潟湖里的那座回忆柱也正好够得着）
const FORD = 0.75;

/* ---- 第二轮动力学细化：把"街机手感"再往真车推进一层 ---- */
// 风阻（二次项）：与速度平方成正比，高速时才是减速主力；松油门后先"滑"一段再明显掉速
const AIR_C = 0.038;
// 滚阻（线性项）：低速时主导，负责把车"顺滑地"停下来（原来的 DRAG×2.6 只是这一项）
const ROLL_C = 0.81;
// 高速抓地衰减：车速越接近极速，轮胎越吃不干净侧滑（真车的高速不足转向 / 推头）
const GRIP_FALL = 0.34;
// 高速转向权限收窄：只缩放转向幅度，绝不改变转向符号，也不动 yaw 的积分方式
const STEER_FALL = 0.24;
// 撞击：切向刮擦摩擦（蹭墙掉速、进而甩尾的物理来源）
const SCRUB = 0.5;
// 撞击：偏心撞击产生的偏航扰动（力臂 = 前后圆相对车身中心的偏移）
const HIT_YAW = 0.055;
// 撞击：悬挂被撞得压下去的冲击系数
const HIT_JOLT = 0.028;
// 悬挂：临界阻尼附近的弹簧（ω≈16 rad/s、ζ≈0.85），带速度状态 → 会真的压下去再弹回来
const SUSP_W = 16;
const SUSP_ZETA = 0.85;

export class Car {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 0, 15);
    this.yaw = 0;
    this.speed = 0;
    this.vlat = 0;              // 侧向速度（相对车身右方向）
    this.vy = 0;
    this.onGround = true;
    this.steerVis = 0;
    this.pitch = 0;
    this.roll = 0;
    this.loadPitch = 0;         // 加减速带来的车身俯仰（重心转移）
    this.susp = 0;              // 悬挂行程（底盘视觉起伏）
    this.suspVel = 0;           // 悬挂速度（弹簧-阻尼状态量）
    this.bank = 0;              // 离心侧倾（纯车身表现层，挂 chassis）
    this.yawKick = 0;           // 撞击带来的偏航角速度（短期衰减，独立于转向积分）
    this.wheelSpin = 0;
    this.height = () => 0;
    this.colliders = [];
    this.seaY = -999;           // 未绑海平面时不做水线阻挡
    this.onHit = null;          // 撞到带 tag 的碰撞体时回调 (tag, 撞击速度)
    this._prevGY = 0;
    this.group = new THREE.Group();
    // 底盘单独一层：车轮挂在 group（永远贴地），车身挂在 chassis（跟随悬挂起伏）
    this.chassis = new THREE.Group();
    this.group.add(this.chassis);
    this.build();
    scene.add(this.group);
    // 原版 View.js：radius 15~30、phi = π×0.27（离地仰角 ≈ 41°）—— 这个距离/角度才是那个"微缩景观"
    this.camera = { dist: 21, orbit: 0, pitch: 0.72 };
    this.reset();
  }

  build() {
    const g = this.group;

    // 原版那台车 = 深色粗犷吉普 + 橙色发光车灯。夜里 celify 的蓝光会把任何暖色乘成灰紫，
    // 所以车身只能是深蓝紫炭灰，暖色 / 粉色一律做成自发光件（celify 之后只剩 emissive 还能亮）。
    const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b3358'), flatShading: true, roughness: 0.6, metalness: 0.12 });
    const roofMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#251f3a'), flatShading: true, roughness: 0.55 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#171331'), flatShading: true, roughness: 0.45, metalness: 0.35 });
    const glassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b2a55'), flatShading: true, roughness: 0.12, metalness: 0.55 });
    const rimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8f8ab5'), flatShading: true, roughness: 0.4, metalness: 0.45 });
    // 自发光强度压到 2.0 以下：我们没有 tonemapping，>2 的暖色会直接 clip 成白色，丢掉橙/粉色相
    const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffcf8f'), emissive: new THREE.Color('#ff9d2e'), emissiveIntensity: 1.8, roughness: 0.3 });
    // 尾灯色值被 update() 的刹车逻辑按 getHex() 认领，不要改
    const tailMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff5b6e'), emissive: new THREE.Color('#ff5b6e'), emissiveIntensity: 1.2, roughness: 0.3 });
    // 粉色签名（车主的"仙姑麻麻"色）：夜色里只有自发光看得见
    const pinkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff8fc0'), emissive: new THREE.Color('#ff5fa6'), emissiveIntensity: 1.3, roughness: 0.4 });

    const box = (w, h, d, m, x, y, z) => {
      const n = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      n.position.set(x, y, z);
      this.chassis.add(n);      // 车身全部挂底盘层 → 悬挂起伏会整体带动它
      return n;
    };

    // —— 底盘 / 车身
    box(1.5, 0.24, 3.94, darkMat, 0, 0.5, 0);                       // 车架大梁
    const body = box(1.88, 0.6, 3.62, bodyMat, 0, 0.92, 0);
    body.castShadow = true;
    box(2.0, 0.2, 3.5, darkMat, 0, 0.58, 0);                       // 侧裙
    box(1.72, 0.2, 1.16, bodyMat, 0, 1.26, 1.2);                   // 机盖
    box(1.6, 0.07, 1.04, darkMat, 0, 1.4, 1.2);                    // 机盖护板

    // —— 座舱：短、方，吉普的比例
    const cabin = box(1.6, 0.78, 1.86, roofMat, 0, 1.62, -0.34);
    cabin.castShadow = true;
    const wind = box(1.5, 0.58, 0.08, glassMat, 0, 1.66, 0.58);
    wind.rotation.x = 0.24;
    box(1.5, 0.5, 0.08, glassMat, 0, 1.68, -1.26);
    for (const s of [-1, 1]) box(0.07, 0.42, 1.4, glassMat, s * 0.81, 1.68, -0.34);

    // —— 车顶行李架 + 顶灯条 + 粉色饰条
    box(1.56, 0.1, 1.7, darkMat, 0, 2.05, -0.34);
    for (const s of [-1, 1]) box(0.06, 0.18, 1.7, darkMat, s * 0.72, 2.16, -0.34);
    box(1.5, 0.05, 0.09, pinkMat, 0, 2.13, 0.5);
    for (let i = -1; i <= 1; i++) box(0.26, 0.14, 0.16, headMat, i * 0.42, 2.18, 0.42);

    // —— 前后保险杠 / 防撞杠 / 侧踏板
    box(2.0, 0.26, 0.26, darkMat, 0, 0.74, 1.9);
    box(1.92, 0.24, 0.24, darkMat, 0, 0.74, -1.88);
    for (const s of [-1, 1]) box(0.1, 1.02, 0.12, rimMat, s * 0.66, 1.14, 2.0);
    box(1.5, 0.1, 0.1, rimMat, 0, 1.6, 2.0);
    for (const s of [-1, 1]) {
      box(0.26, 0.1, 1.9, darkMat, s * 1.02, 0.62, -0.05);        // 侧踏板
      box(0.05, 0.06, 1.7, pinkMat, s * 1.17, 0.62, -0.05);       // 侧面粉色灯带
    }

    // —— 轮眉：原版这台车的辨识度一半来自外扩的方形轮眉
    for (const s of [-1, 1]) {
      for (const z of [1, -1]) box(0.3, 0.2, 1.34, darkMat, s * 1.08, 0.98, z * (WHEELBASE / 2));
    }

    // —— 车灯
    box(1.4, 0.12, 0.08, darkMat, 0, 0.98, 1.86);                 // 前格栅
    for (const s of [-1, 1]) {
      box(0.42, 0.24, 0.1, headMat, s * 0.6, 1.14, 1.84);          // 前大灯（暖橙自发光）
      box(0.34, 0.18, 0.08, tailMat, s * 0.7, 1.06, -1.84);        // 尾灯
    }

    // —— 轮子：更大更方，才有那股越野味（半径变了要同步改下面 wheelSpin 的除数）
    const tyreMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b172c'), flatShading: true, roughness: 0.95 });
    const wg = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.4, 20);
    wg.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.24, 0.26, 0.44, 14);
    hubGeo.rotateZ(Math.PI / 2);
    // 胎面：外圈一圈凸出的胎块（越野胎的辨识度）。整轮一圈用一个 InstancedMesh 装，
    // 因为它挂在轮子 group 下会跟着轮子一起转，实例矩阵是静态的、不需要每帧更新 → 每轮只多 1 个 draw call
    const TR = 12;
    const treadGeo = new THREE.BoxGeometry(0.44, 0.08, 0.24);
    const tMats = [];
    const tDummy = new THREE.Object3D();
    for (let i = 0; i < TR; i++) {
      const th = (i / TR) * Math.PI * 2;
      const rT = WHEEL_R - 0.03;
      tDummy.position.set(0, Math.sin(th) * rT, Math.cos(th) * rT);
      tDummy.rotation.set(th, 0, 0);
      tDummy.updateMatrix();
      tMats.push(tDummy.matrix.clone());
    }
    // 每个轮子单独建一个实例网格（显式构造，不依赖 InstancedMesh.clone 的实现）
    const mkTreads = () => {
      const im = new THREE.InstancedMesh(treadGeo, tyreMat, TR);
      for (let i = 0; i < TR; i++) im.setMatrixAt(i, tMats[i]);
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      return im;
    };
    const hubMesh = new THREE.Mesh(hubGeo, rimMat);
    this.wheels = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const w = new THREE.Group();
      const t = new THREE.Mesh(wg, tyreMat);
      t.castShadow = true;
      w.add(t);
      w.add(hubMesh.clone());
      w.add(mkTreads());
      w.position.set(sx * TRACK / 2 * 1.06, WHEEL_R, sz * WHEELBASE / 2);
      g.add(w);
      this.wheels.push({ obj: w, front: sz > 0, side: sx });
    }
  }

  reset() {
    // 出生点在心形尖点的外侧：正对 +z，一踩油门就正对着第一段回忆（m01）的那根光柱
    this.pos.set(0, 0, 15);
    this.yaw = 0;
    this.speed = 0;
    this.vlat = 0;
    this.vy = 0;
    this.pitch = 0;
    this.roll = 0;
    this.loadPitch = 0;
    this.susp = 0;
    this.suspVel = 0;
    this.bank = 0;
    this.yawKick = 0;
    this.snapToGround();
    this._prevGY = this.pos.y;
  }

  snapToGround() {
    this.pos.y = this._avgHeight(this.pos.x, this.pos.z);
  }

  _avgHeight(x, z) {
    // 采样点直接用四个轮子的接地坐标（前后 ±WHEELBASE/2、左右 ±TRACK/2×1.06），
    // 而不是原先 ±1.4 / ±1 的近似值 —— 车身的高度 / 俯仰 / 侧倾从此都长在轮子真正踩的地方
    const hx = TRACK / 2 * 1.06, hz = WHEELBASE / 2;
    let sum = 0, n = 0;
    for (const [ox, oz] of [[0, hz], [0, -hz], [hx, 0], [-hx, 0]]) {
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      const wx = x + ox * c - oz * s;
      const wz = z - ox * s - oz * c;
      sum += this.height(wx, wz);
      n++;
    }
    return sum / n;
  }

  /** 由外部注入地形高度函数 */
  bindHeight(fn) { this.height = fn; this.snapToGround(); return this; }

  /** 绑上静态碰撞体表（World 边构建边 push 进同一个数组，所以传引用即可） */
  bindColliders(arr) { this.colliders = arr || []; return this; }

  /** 绑上海平面：低于水线的地形不让开过去 */
  bindSea(y) { this.seaY = y; return this; }

  /* ---------------- 约束求解 ---------------- */

  /** 静态碰撞体求解：车身用前后两个圆近似，逐接触推出 + 沿面滑动（会回写世界速度） */
  _collide(vel) {
    const cols = this.colliders;
    if (!cols.length) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const reach = BODY_HALF + BODY_R;
    for (let i = 0; i < cols.length; i++) {
      const o = cols[i];
      // 宽相位：车心到碰撞体中心
      const ddx = this.pos.x - o.x, ddz = this.pos.z - o.z;
      const far = o.rad + reach;
      if (ddx * ddx + ddz * ddz > far * far) continue;

      for (const sg of [1, -1]) {
        const px = this.pos.x + s * BODY_HALF * sg;
        const pz = this.pos.z + c * BODY_HALF * sg;
        let nx = 0, nz = 0, pen = 0;

        if (o.ring) {
          // 院门：这个角度范围内放行，车才能开进院子
          if (o.gate !== undefined) {
            const ang = Math.atan2(pz - o.z, px - o.x);
            const dA = Math.atan2(Math.sin(ang - o.gate), Math.cos(ang - o.gate));
            if (Math.abs(dA) < o.gateHalf) continue;
          }
          // 院墙：一圈厚 2t 的墙，内外两面都要挡
          const dx = px - o.x, dz = pz - o.z;
          const d = Math.hypot(dx, dz) || 1e-4;
          const rOut = o.r + 2 * o.t;
          if (d > o.r + o.t) {
            if (d < rOut + BODY_R) { pen = rOut + BODY_R - d; nx = dx / d; nz = dz / d; }
          } else if (d > o.r - BODY_R) { pen = BODY_R - (o.r - d); nx = -dx / d; nz = -dz / d; }
        } else if (o.box) {
          // 定向盒：把圆心变换到盒的局部系，再做点-矩形最近点
          const dx = px - o.x, dz = pz - o.z;
          const lx = dx * o.c - dz * o.s;
          const lz = dx * o.s + dz * o.c;
          const clx = Math.max(-o.hw, Math.min(o.hw, lx));
          const clz = Math.max(-o.hd, Math.min(o.hd, lz));
          let dlx = lx - clx, dlz = lz - clz;
          const dd = Math.hypot(dlx, dlz);
          if (dd > 1e-5) {
            if (dd < BODY_R) { pen = BODY_R - dd; dlx /= dd; dlz /= dd; }
          } else {
            // 圆心已经落在盒内：沿最深穿透的短轴顶出去
            const ox = o.hw - Math.abs(lx), oz = o.hd - Math.abs(lz);
            if (ox < oz) { dlx = lx >= 0 ? 1 : -1; dlz = 0; pen = ox + BODY_R; }
            else { dlx = 0; dlz = lz >= 0 ? 1 : -1; pen = oz + BODY_R; }
          }
          if (pen > 0) { nx = dlx * o.c + dlz * o.s; nz = -dlx * o.s + dlz * o.c; }
        } else {
          const dx = px - o.x, dz = pz - o.z;
          const d = Math.hypot(dx, dz);
          if (d < o.r + BODY_R) { pen = o.r + BODY_R - d; nx = d > 1e-5 ? dx / d : 1; nz = d > 1e-5 ? dz / d : 0; }
        }

        if (pen <= 0) continue;
        this.pos.x += nx * pen;
        this.pos.z += nz * pen;
        // 消掉"撞进去"的那部分速度（带一点回弹）→ 自然变成沿墙滑动
        const vn = vel.x * nx + vel.z * nz;
        if (vn < 0) {
          const hit = -vn;
          // 撞上带 tag 的东西：把"撞的是什么 + 撞得多快"回报给上层。
          // 同一个碰撞体 500ms 内只报一次，免得贴着柱子磨的时候每帧刷屏。
          if (o.tag && hit > 1.2) {
            const now = performance.now();
            if (now - (o._hitAt || 0) > 500) {
              o._hitAt = now;
              if (this.onHit) this.onHit(o.tag, hit);
            }
          }
          vel.x -= nx * vn * (1 + REST); vel.z -= nz * vn * (1 + REST);
          // 切向刮擦：蹭墙不再是"抹了油的滑动"——撞击越斜、刮掉的切向速度越多，
          // 这也是"擦着柱子过弯会掉速、进而甩尾"的物理来源
          const tx = -nz, tz = nx;
          const vt = vel.x * tx + vel.z * tz;
          const scrub = Math.min(1, SCRUB * Math.min(1, hit * 0.4));
          vel.x -= tx * vt * scrub; vel.z -= tz * vt * scrub;
          // 偏心撞击：前后圆相对车身中心有力臂 → 车头被撞偏 + 悬挂被撞得压下去
          this._impact(hit, nx, nz, sg);
        }
      }
    }
  }

  /**
   * 撞击反馈：偏心撞击给车头一个偏航扰动、并把悬挂撞得压下去。
   * 注意：这只是"额外叠加"的扰动量，转向的符号约定 / yaw 的积分方式完全没有动。
   * sg = 撞击点在前圆(+1)还是后圆(-1)，nx/nz = 碰撞推出的法线方向。
   */
  _impact(v, nx, nz, sg) {
    if (v < 0.8) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    // 扭矩（绕 +Y）= r × F：r 沿车身前向 × sg，(c,-s) 是车身"右"方向。
    // 撞在前角偏右的物体上 → 车头被推着往右偏，和真车一致。
    const torque = sg * (c * nx - s * nz) * v;
    this.yawKick = Math.max(-0.55, Math.min(0.55, this.yawKick + torque * HIT_YAW));
    this.suspVel -= v * HIT_JOLT;               // 负 = 悬挂被压缩
  }

  /** 水线约束：深水不许开进去（浅滩属于可涉水区），顺带把车推回岸上 */
  _blockWater(vel) {
    if (this.seaY < -900) return;
    const lim = this.seaY - FORD;
    const h0 = this.height(this.pos.x, this.pos.z);
    if (h0 >= lim) return;
    // 上坡方向 = 朝内陆
    const e = 0.7;
    const gx = this.height(this.pos.x + e, this.pos.z) - this.height(this.pos.x - e, this.pos.z);
    const gz = this.height(this.pos.x, this.pos.z + e) - this.height(this.pos.x, this.pos.z - e);
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-4) { vel.x = 0; vel.z = 0; return; }
    const nx = gx / gl, nz = gz / gl;
    const vn = vel.x * nx + vel.z * nz;
    if (vn < 0) { vel.x -= nx * vn; vel.z -= nz * vn; }   // 只挡朝海的那一半，仍然可以沿岸行驶
    const push = Math.min(0.28, (lim - h0) * 0.8);
    this.pos.x += nx * push;
    this.pos.z += nz * push;
  }

  update(dt, input) {
    const h = this.height;
    const throttle = input.throttle;
    const steer = input.steer;
    const boost = input.boosted ? 1.42 : 1;
    const maxFwd = MAX_FWD * boost;
    this.boosting = boost > 1 && this.speed > 4;
    const prevSpeed = this.speed;

    // 纵向
    if (throttle > 0.02) {
      this.speed += ACCEL * boost * throttle * dt * (1 - Math.max(0, this.speed) / (maxFwd * 1.35));
    } else if (throttle < -0.02) {
      if (this.speed > 0.6) this.speed -= BRAKE * dt;
      else this.speed += ACCEL * 0.7 * throttle * dt * (1 - Math.max(0, -this.speed) / (MAX_BACK * 1.4));
    } else {
      // 松油门：滚阻（线性，低速主导）+ 风阻（二次，高速主导）。
      // 结果就是先顺滑地溜一段、再明显掉速，而不是一松油门就"撞墙"。
      const mag = Math.abs(this.speed);
      const dec = (ROLL_C * mag + AIR_C * mag * mag) * dt;
      this.speed -= Math.sign(this.speed) * Math.min(mag, dec);
      if (Math.abs(this.speed) < 0.04) this.speed = 0;
    }
    // 坡度重力：上坡时 pitch 为负 → 减速；下坡反过来
    this.speed += Math.sin(this.pitch) * SLOPE_G * dt;
    this.speed = Math.max(-MAX_BACK, Math.min(maxFwd, this.speed));

    // 转向（速度越快越难打满，静止不转）
    const sf = Math.min(1, Math.abs(this.speed) / 9);
    // 再叠一层"高速转向权限收窄"（真车的高速不足转向）：只缩放幅度，符号 / 积分式一律不动，
    // 所以转向方向的手感与之前完全一致，只是高速时车头不再那么贼
    const auth = 1 - STEER_FALL * Math.min(1, Math.max(0, Math.abs(this.speed) - 9) / (maxFwd - 9));
    const dir = this.speed >= 0 ? 1 : -1;
    const grip = this.onGround ? 1 : 0.32;
    const prevYaw = this.yaw;
    this.yaw += steer * TURN * dt * (0.22 + 0.78 * sf) * auth * dir * grip;

    // 撞击扰动：短期衰减的偏航角速度。与上面的转向积分是两个独立的量，
    // 叠在同一帧里统一进入下面的惯性换算，形成"被撞歪了一下车头"的效果。
    if (this.yawKick) {
      this.yaw += this.yawKick * dt;
      this.yawKick *= Math.max(0, 1 - 3.2 * dt);
      if (Math.abs(this.yawKick) < 0.008) this.yawKick = 0;
    }

    // 车头转过 dy 之后，原来的世界速度在新车身系里就多出了一份"侧向分量"——
    // 这是惯性的来源：转得越急、速度越高，甩出去的侧向速度越多
    const dy = this.yaw - prevYaw;
    if (dy) {
      const cd = Math.cos(dy), sd = Math.sin(dy);
      const nf = this.speed * cd + this.vlat * sd;
      this.vlat = -this.speed * sd + this.vlat * cd;
      this.speed = nf;
    }
    // 轮胎把侧向速度吃掉；吃不掉的部分就是打滑。车速越高抓地越差：
    // 慢速时轮胎能咬死，接近极速时明显推头 / 甩尾 —— 真车的高速不足转向
    const gripNow = GRIP * (1 - GRIP_FALL * Math.min(1, Math.max(0, this.speed) / maxFwd));
    this.vlat -= this.vlat * Math.min(1, gripNow * dt * (this.onGround ? 1 : 0.25));

    // 世界速度 = 前向 + 侧向
    let c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const vel = { x: s * this.speed + c * this.vlat, z: c * this.speed - s * this.vlat };

    // 位移，然后做约束求解（水线 → 静态碰撞体），解算会回写 vel
    this.pos.x += vel.x * dt;
    this.pos.z += vel.z * dt;
    this._blockWater(vel);
    this._collide(vel);

    // 把解算后的世界速度还原回前向 / 侧向分量
    c = Math.cos(this.yaw); s = Math.sin(this.yaw);
    this.speed = Math.max(-MAX_BACK, Math.min(maxFwd, vel.x * s + vel.z * c));
    this.vlat = vel.x * c - vel.z * s;

    // 跳
    if (input.consumeJump() && this.onGround) {
      this.vy = 6.6;
      this.onGround = false;
    }

    const groundY = this._avgHeight(this.pos.x, this.pos.z);
    if (!this.onGround) {
      this.vy -= 19 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= groundY) {
        this.susp = Math.max(-0.2, this.vy * 0.022);   // 落地时悬挂被压一下
        this.pos.y = groundY; this.vy = 0; this.onGround = true;
      }
    } else {
      const dyG = groundY - this.pos.y;
      if (dyG < -1.4) {
        this.onGround = false;          // 冲下断崖：地面整个塌下去，短暂腾空交给上面的弹道分支
      } else {
        // 贴地：跟随系数提到 28/s（9 → 20 → 28）。整车（车身 + 四个轮子）都骑在 pos.y 上，
        // 所以这条钳位就是"车最多能离地多远"的硬上限 —— 原来 0.3m 太松，
        // 上坡 / 过坎时车身会明显浮在地形上方一格；收紧到 0.13m 后基本贴着地形走。
        this.pos.y += dyG * Math.min(1, 28 * dt);
        const off = this.pos.y - groundY;
        if (off > 0.13) this.pos.y = groundY + 0.13;
        else if (off < -0.13) this.pos.y = groundY - 0.13;
      }
    }

    // 悬挂行程：底盘相对车轮随地形起伏上下（纯表现层，车轮始终贴地）
    const gvy = (groundY - this._prevGY) / Math.max(dt, 1e-3);
    this._prevGY = groundY;
    const tSusp = Math.max(-0.10, Math.min(0.06, -gvy * SUSP_K));
    // 弹簧-阻尼（带速度状态）：过坎 / 落地 / 撞墙时车身会真的压下去再回弹一次，
    // 而不是像原来那样"指数跟随"、只是平滑地滑到目标值。
    // 大 dt（标签页节流后最大 50ms）会打散发散，所以内部按 ≤1/80 s 子步推进。
    const sub = Math.max(1, Math.ceil(dt / 0.0125));
    const hSub = dt / sub;
    const kS = SUSP_W * SUSP_W, cS = 2 * SUSP_ZETA * SUSP_W;
    for (let i = 0; i < sub; i++) {
      this.suspVel += ((tSusp - this.susp) * kS - this.suspVel * cS) * hSub;
      this.susp += this.suspVel * hSub;
    }
    // 行程限幅收紧（原来 ±0.22/0.12 会让车身上下"脱开"轮子，看起来像浮在地上）
    if (this.susp < -0.14) { this.susp = -0.14; this.suspVel = 0; }
    else if (this.susp > 0.07) { this.susp = 0.07; this.suspVel = 0; }

    // 姿态：四点高度 -> 俯仰 / 侧倾，弹簧平滑
    const fl = h(this.pos.x + (-TRACK / 2) * c - (WHEELBASE / 2) * s, this.pos.z + (TRACK / 2) * s - (WHEELBASE / 2) * c);
    const fr = h(this.pos.x + (TRACK / 2) * c - (WHEELBASE / 2) * s, this.pos.z - (TRACK / 2) * s - (WHEELBASE / 2) * c);
    const bl = h(this.pos.x + (-TRACK / 2) * c + (WHEELBASE / 2) * s, this.pos.z + (TRACK / 2) * s + (WHEELBASE / 2) * c);
    const br = h(this.pos.x + (TRACK / 2) * c + (WHEELBASE / 2) * s, this.pos.z - (TRACK / 2) * s + (WHEELBASE / 2) * c);
    const tPitch = Math.atan2((fl + fr) / 2 - (bl + br) / 2, WHEELBASE);
    const tRoll = Math.atan2((bl + fl) / 2 - (br + fr) / 2, TRACK);

    const k = Math.min(1, 12 * dt);
    this.pitch += (tPitch * -1 - this.pitch) * k;
    this.roll += ((tRoll + steer * 0.16 * sf) - this.roll) * Math.min(1, 7 * dt) * 0.85;

    if (!this.onGround) {
      this.pitch += (this.vy * -0.012 - this.pitch) * 0.06;
    }

    // 重心转移：加速抬头、刹车点头（真车最直观的那一下）
    const longAcc = (this.speed - prevSpeed) / Math.max(dt, 1e-3);
    this.loadPitch += (Math.max(-0.06, Math.min(0.06, -longAcc * 0.0016)) - this.loadPitch) * Math.min(1, 8 * dt);

    // 轮子
    this.wheelSpin += (this.speed / WHEEL_R) * dt;
    this.steerVis += (steer * 0.5 - this.steerVis) * Math.min(1, 10 * dt);

    // 离心侧倾：转弯时车身朝弯外倾（力 = 侧向加速度 = v × yawRate）。
    // 这是纯车身表现层，挂在 chassis 上（旋转轴 = 车身前向），车轮与轨迹都不受影响。
    const yawRate = (this.yaw - prevYaw) / Math.max(dt, 1e-3);
    const latAcc = this.speed * yawRate;
    this.bank += (Math.max(-0.1, Math.min(0.1, latAcc * 0.02)) - this.bank) * Math.min(1, 6 * dt);

    // 应用
    this.group.position.set(this.pos.x, this.pos.y + RIDE, this.pos.z);
    this.group.rotation.set(this.pitch + this.loadPitch, this.yaw, this.roll, 'YXZ');
    this.chassis.position.y = this.susp;
    this.chassis.rotation.z = this.bank;

    for (const w of this.wheels) {
      w.obj.rotation.x = -this.wheelSpin;
      // 四轮各自贴地：拿每个轮子所在位置的地形高度去微调它的局部 y（±0.11m 悬挂行程）。
      // 于是过坎 / 走沟时是"每个轮子各自找地"，而不是整块平板一起抬 —— 车才真的踩在地上。
      const lx = w.side * TRACK / 2 * 1.06;
      const lz = (w.front ? 1 : -1) * WHEELBASE / 2;
      const wy = h(this.pos.x + lx * c - lz * s, this.pos.z - lx * s - lz * c);
      const ty = Math.max(WHEEL_R - 0.11, Math.min(WHEEL_R + 0.11, WHEEL_R + (wy - this.pos.y)));
      w.obj.position.y += (ty - w.obj.position.y) * Math.min(1, 24 * dt);
      if (w.front) {
        // 阿克曼转角：内侧轮比外侧轮转得更多（纯视觉细节，转向基准仍是 steerVis，符号不变）
        const inner = yawRate >= 0 ? 1 : -1;
        w.obj.rotation.y = this.steerVis * (w.side === inner ? 1.18 : 0.9);
      }
    }

    // 尾灯刹车
    const braking = throttle < -0.02 && this.speed > 0.6;
    this.group.traverse(o => {
      if (o.material && o.material.emissive && o.material.color && o.material.color.getHex() === 0xff5b6e) {
        o.material.emissiveIntensity = braking ? 2.6 : 1.2;
      }
    });
  }

  /** 相机目标点（带环视偏移） */
  cameraTarget(dist, orbit, pitch, out) {
    const a = this.yaw + Math.PI + orbit;
    const y = 1.5 + Math.sin(pitch) * dist;
    const flat = Math.cos(pitch) * dist;
    out.set(this.pos.x + Math.sin(a) * flat, this.pos.y + y, this.pos.z + Math.cos(a) * flat);
    return out;
  }
}
