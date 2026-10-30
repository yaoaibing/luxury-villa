/* ============================================================
   model.js · 豪华别墅 · 参数化数字孪生（仅外立面）
   ------------------------------------------------------------
   坐标：y=0 室外地坪；南=+z（主景观面/主入口），北=-z，东=+x，西=-x
   几何：墙板 Shape+holes 挤出（真洞口/真墙厚/6mm 倒角），
         板缝为真实留空（深色底板后退 8mm），构件厚度全部实体化。
   贴图：仅「光伏」「门牌标识」两处，其余一律纯色 PBR。

   每个立面独立定义并单独核对，不复用样板。
   ============================================================ */
import * as THREE from 'three';
import {
  M, box, slab, instanced, makeDir, facade, wallPanel, pvTexture, signTexture,
  groundFadeTexture,
} from './core.js';
import {
  info, windowUnit, doorUnit, shutterDoor, canopy, steps, apron,
  louver, railing, signage, screen, skylight, bipvRoof, downpipe, mechBox,
} from './detail.js';

/* ================= 参数表 ================= */
export const P = {
  site: { w: 39, d: 28, cx: -2.4, cz: 0 },

  main: {
    x0: -9.0, x1: 9.0,     // 面宽 18.0
    z0: -6.0, z1: 6.0,     // 进深 12.0
    f1: 3.90,              // 一层层高（二层楼板底）
    slab: 0.42,            // 二层楼板厚 → 二层楼面 4.32
    f2: 7.20,              // 二层顶（屋面板底）
    para: 8.10,            // 女儿墙顶
    wall: 0.30,            // 外墙厚
  },

  cant: { south: 1.80 },   // 二层南向通长悬挑

  // 车库：紧贴主楼西墙外侧，不插入主体，顶做露台
  garage: { x0: -14.40, x1: -9.00, z0: -6.00, z1: 0.00, h: 3.60, roof: 0.30 },

  // 主入口门廊（净高 3.6 —— 已按豪宅尺度抬高）
  porch: { halfW: 2.60, out: 2.60, clear: 3.60, thick: 0.30 },

  open: {
    // —— 南立面一层（u = 世界 x）——
    sDoor:  { u: [-1.10, 1.10], y: [0.00, 2.70] },   // 双开主入口
    sWinL:  { u: [-7.80, -2.60], y: [0.30, 3.40] },  // 落地窗 西
    sWinR:  { u: [2.60, 7.80],  y: [0.30, 3.40] },   // 落地窗 东
    // —— 南立面二层（外皮 z=7.8，u = 世界 x）——
    sWin2:  { u: [-8.40, 8.40], y: [4.40, 7.00] },   // 通长玻璃，5 段分格
    // —— 东立面（u = -世界 z）——
    eWin1: [{ u: [-4.20, -2.70], y: [1.00, 2.80] },
            { u: [-0.80, 0.80],  y: [1.00, 2.80] },
            { u: [2.70, 4.20],   y: [1.00, 2.80] }],
    eWin2: [{ u: [-4.20, -2.70], y: [4.40, 6.40] },
            { u: [2.70, 4.20],   y: [4.40, 6.40] },
            { u: [-0.70, 0.70],  y: [4.40, 7.00] }], // 中部通高
    // —— 北立面主楼段（u = -世界 x）——
    nDoor:  { u: [-4.10, -2.90], y: [0.00, 2.20] },  // 服务门 1.2m
    // 高窗必须避开门洞：左窗收到 -5.60~-4.30（与门留 0.20m 窗间墙）
    nWin1: [{ u: [-5.60, -4.30], y: [1.50, 2.70] },
            { u: [-2.50, -1.00], y: [1.50, 2.70] },
            { u: [0.60, 2.10],   y: [1.50, 2.70] }],
    nWin2: [{ u: [-5.60, -4.30], y: [4.40, 6.20] },
            { u: [0.60, 2.10],   y: [4.40, 6.20] }],
    // —— 北立面车库段（u = -世界 x，世界 x ∈ [-14.4,-9] → u ∈ [9,14.4]）——
    gWin:  [{ u: [10.60, 12.10], y: [1.30, 2.30] }],
    // —— 西立面主楼段（u = 世界 z）——
    wWin1: [{ u: [2.50, 4.00],   y: [1.40, 2.60] }],
    wDoor2: { u: [-4.00, -2.80], y: [4.34, 6.60] },  // 二层通露台门
    wWin2: [{ u: [1.50, 4.50],   y: [4.40, 6.40] }],
    // —— 西立面车库段（u = 世界 z，z ∈ [-6,0]）——
    gShutter: { u: [-5.00, 0.00], y: [0.00, 2.80] }, // 卷帘门 5.0×2.8
    // —— 车库南墙（u = 世界 x，x ∈ [-14.4,-9]）——
    gsVent: { u: [-12.45, -10.95], y: [1.90, 2.70] },
  },

  pv: { rows: 3, cols: 8, w: 1.65, d: 1.00, gap: 0.09, tilt: 10 },
  screen: { u: [-8.40, -1.20], y: [4.44, 7.10], bar: 0.10, pitch: 0.25 },
  // 东向遮阳：只设在两侧窗上口，中部通高窗不遮挡
  eastShade: { seg: [[-4.90, -2.00], [2.00, 4.90]], out: 0.90, thick: 0.14, y: 6.62 },
};

/* ================= 主构建 ================= */
export function buildVilla(scene) {
  const root = new THREE.Group();
  root.name = 'Villa';
  scene.add(root);

  const m = P.main, gr = P.garage, op = P.open;
  const F2 = m.f1 + m.slab;                 // 二层楼面 4.32
  const deckY = gr.h + gr.roof;             // 露台面 3.90
  const parts = [];                         // 构件清单（拾取用）
  const reg = (g) => { if (g && g.userData.info) parts.push(g.userData.info); return g; };

  /* ---------- 地面：一块整地，用圆盘而不是方盒顶面 ----------
     地面必须是单层，不能再叠「铺装板 + 外围地面」（差 2mm 就会 z-fighting）。
     但方盒顶面由两个三角面拼成，那条对角线在斜视角下会反光成一道深色接缝，
     横穿整个场地——比 z-fighting 更显眼。改用一个圆盘：
     三角面呈放射状均匀分布，没有贯穿全场的长边，边缘再用 alpha 淡出。   */
  const baseMat = new THREE.MeshLambertMaterial({
    color: 0xded8ca, map: groundFadeTexture(),
    transparent: true, depthWrite: false,
  });
  const discGeo = new THREE.CircleGeometry(56, 96);
  discGeo.rotateX(-Math.PI / 2);
  const base = new THREE.Mesh(discGeo, baseMat);
  base.position.set(P.site.cx, 0, P.site.cz);
  base.name = '场地地坪';
  base.renderOrder = -1;
  base.receiveShadow = true;
  root.add(base);

  /* ---------- 场地铺装（让建筑落地，仅铺装不做绿化/车辆） ---------- */
  const SP = new THREE.Group(); SP.name = '场地铺装'; root.add(SP);

  // 铺装直接做在场地底板上：0.9m 石材分格缝（真几何细条，非贴图）
  // 用 InstancedMesh 批绘制：74 条缝若各自成 Mesh 会多出 74 次 DrawCall
  const jmG = new THREE.Group(); jmG.name = '铺装分格缝'; SP.add(jmG);
  const sx0 = P.site.cx - P.site.w / 2 + 0.45, sx1 = P.site.cx + P.site.w / 2 - 0.45;
  const sz0 = P.site.cz - P.site.d / 2 + 0.45, sz1 = P.site.cz + P.site.d / 2 - 0.45;
  const jxList = [], jzList = [];
  for (let x = sx0; x <= sx1 + 1e-6; x += 0.9) jxList.push({ x, y: 0.0015, z: (sz0 + sz1) / 2 });
  for (let z = sz0; z <= sz1 + 1e-6; z += 0.9) jzList.push({ x: (sx0 + sx1) / 2, y: 0.0015, z });
  instanced(new THREE.BoxGeometry(0.032, 0.006, sz1 - sz0), M.joint, jxList, jmG, '分格缝-纵');
  instanced(new THREE.BoxGeometry(sx1 - sx0, 0.006, 0.032), M.joint, jzList, jmG, '分格缝-横');

  // 车库车道（卷帘门朝西）：深灰沥青，收在场地内。
  // 车道与步道都做成「零厚度贴面」（PlaneGeometry）而不是 50mm 厚的板：
  // 5cm 的侧壁在 25m 外被压缩成一条黑线，会横穿整个场地。
  const driveGeo = new THREE.PlaneGeometry(4.60, 5.40);
  driveGeo.rotateX(-Math.PI / 2);
  const drive = new THREE.Mesh(driveGeo, M.asphalt);
  drive.position.set(gr.x0 - 2.30, 0.004, -2.9);
  drive.receiveShadow = true;
  drive.name = '车库车道（简化：无路面标线与坡度）';
  SP.add(drive);
  // 入口步道（主入口向南引出）
  const walkGeo = new THREE.PlaneGeometry(3.40, 6.4);
  walkGeo.rotateX(-Math.PI / 2);
  const walk = new THREE.Mesh(walkGeo, M.paveWalk);
  walk.position.set(0, 0.004, m.z1 + P.cant.south + 2.7);
  walk.receiveShadow = true;
  walk.name = '入口步道';
  SP.add(walk);

  info(SP, '场地铺装', {
    size: `${P.site.w.toFixed(1)}×${P.site.d.toFixed(1)}m 石材铺装（0.9m 分格缝）· 车道 4.6×5.4m · 入口步道 3.4×6.4m`,
    mat: '浅灰石材铺装 + 深灰沥青车道',
    note: '仅做铺装；按你要求不含绿化、树木、车辆等环境要素',
    simple: '简化：无路面标线、无排水坡度、无路缘石细节',
  });
  reg(SP);

  /* ---------- 放置器（各立面外皮坐标） ---------- */
  const D = {
    s1: makeDir('south', m.z1),          // 主楼南一层  z=6.0
    s2: makeDir('south', m.z1 + P.cant.south), // 二层南（悬挑面） z=7.8
    sg: makeDir('south', gr.z1),         // 车库南墙    z=0.0
    n1: makeDir('north', m.z0),          // 北立面      z=-6.0
    e1: makeDir('east', m.x1),           // 东立面      x=9.0
    w1: makeDir('west', m.x0),           // 主楼西墙    x=-9.0
    wg: makeDir('west', gr.x0),          // 车库西墙    x=-14.4
  };

  /* =========================================================
     一层
  ========================================================= */
  const L1 = new THREE.Group(); L1.name = '一层'; root.add(L1);

  // 内胆：必须退到「墙内皮」，否则玻璃会被埋进实体里
  // 主楼：南/北/东/西四面各自内退一个墙厚
  box(m.x1 - m.x0 - 2 * m.wall, m.f1, m.z1 - m.z0 - 2 * m.wall, M.dark,
    (m.x0 + m.x1) / 2, m.f1 / 2, (m.z0 + m.z1) / 2, L1).name = '一层内胆';
  // 车库：西/南/北内退，东侧与主楼共用墙不内退
  box(gr.x1 - gr.x0 - m.wall, gr.h, gr.z1 - gr.z0 - 2 * m.wall, M.dark,
    (gr.x0 + m.wall + gr.x1) / 2, gr.h / 2, (gr.z0 + gr.z1) / 2, L1).name = '车库内胆';

  // —— 南立面一层（米白石材，3m 一开间，真板缝）——
  facade({
    uSpan: [m.x0, m.x1], ySpan: [0, m.f1], holes: [op.sDoor, op.sWinL, op.sWinR],
    mat: M.stone, thick: m.wall, dir: D.s1, root: L1, name: '南立面一层石材幕墙',
    splits: [-9, -6, -3, 0, 3, 6, 9], jointMat: M.stoneWarm,
  });

  // —— 东立面一层（米白涂料）——
  facade({
    uSpan: [-6, 6], ySpan: [0, m.f1], holes: op.eWin1,
    mat: M.coat, thick: m.wall, dir: D.e1, root: L1, name: '东立面一层涂料墙面',
    splits: [-6, -3, 0, 3, 6],
  });

  // —— 北立面一层（主楼段）——
  facade({
    uSpan: [-9, 9], ySpan: [0, m.f1], holes: [op.nDoor, ...op.nWin1],
    mat: M.coat, thick: m.wall, dir: D.n1, root: L1, name: '北立面一层墙面(主楼段)',
    splits: [-9, -6, -3, 0, 3, 6, 9],
  });
  // —— 北立面一层（车库段）——
  facade({
    uSpan: [9, 14.4], ySpan: [0, gr.h], holes: op.gWin,
    mat: M.stone, thick: m.wall, dir: D.n1, root: L1, name: '北立面一层墙面(车库段)',
    splits: [9, 11.7, 14.4], jointMat: M.stoneWarm,
  });

  // —— 西立面主楼段一层 ——
  facade({
    uSpan: [-6, 6], ySpan: [0, m.f1], holes: op.wWin1,
    mat: M.coat, thick: m.wall, dir: D.w1, root: L1, name: '西立面一层墙面(主楼段)',
    splits: [-6, -3, 0, 3, 6],
  });

  // —— 西立面车库段（卷帘门所在）——
  facade({
    uSpan: [-6, 0], ySpan: [0, gr.h], holes: [op.gShutter],
    mat: M.stone, thick: m.wall, dir: D.wg, root: L1, name: '西立面车库墙面',
    splits: [-6, -3, 0], jointMat: M.stoneWarm,
  });

  // —— 车库南墙 ——
  facade({
    uSpan: [gr.x0, gr.x1], ySpan: [0, gr.h], holes: [op.gsVent],
    mat: M.stone, thick: m.wall, dir: D.sg, root: L1, name: '车库南墙',
    splits: [-14.4, -11.7, -9], jointMat: M.stoneWarm,
  });

  /* ---------- 一层门窗 ---------- */
  const G1 = new THREE.Group(); G1.name = '一层门窗'; root.add(G1);
  reg(doorUnit({
    hole: op.sDoor, dir: D.s1, root: G1, name: '南-主入口双开玻璃门',
    thick: m.wall, leaves: 2, revealMat: M.stone,
  }));
  reg(windowUnit({
    hole: op.sWinL, dir: D.s1, root: G1, name: '南-一层落地窗(西)',
    thick: m.wall, mullions: [-1.6, 1.6], revealMat: M.stone, sillOut: 0.12,
  }));
  reg(windowUnit({
    hole: op.sWinR, dir: D.s1, root: G1, name: '南-一层落地窗(东)',
    thick: m.wall, mullions: [-1.6, 1.6], revealMat: M.stone, sillOut: 0.12,
  }));
  op.eWin1.forEach((h, i) => reg(windowUnit({
    hole: h, dir: D.e1, root: G1, name: `东-一层窗-${i + 1}`, thick: m.wall,
  })));
  op.nWin1.forEach((h, i) => reg(windowUnit({
    hole: h, dir: D.n1, root: G1, name: `北-一层高窗-${i + 1}`, thick: m.wall,
  })));
  reg(doorUnit({
    hole: op.nDoor, dir: D.n1, root: G1, name: '北-服务门',
    thick: m.wall, leaves: 1, panelLow: 0.70,
  }));
  reg(windowUnit({
    hole: op.wWin1[0], dir: D.w1, root: G1, name: '西-一层高窗', thick: m.wall,
  }));
  reg(shutterDoor({
    hole: op.gShutter, dir: D.wg, root: G1, name: '西-车库卷帘门', thick: m.wall,
  }));
  reg(louver({
    x: (gr.x0 + gr.x1) / 2 - 0.4, y: 2.30, z: gr.z0 - 0.30, w: 1.50, h: 1.00, d: 0.36,
    ry: 0, root: G1, name: '北-车库通风百叶', blades: 9,
  }));
  reg(louver({
    x: (gr.x0 + gr.x1) / 2, y: 2.30, z: gr.z1 + 0.30, w: 1.50, h: 0.80, d: 0.30,
    ry: 0, root: G1, name: '车库南墙通风百叶', blades: 7,
  }));

  /* =========================================================
     二层
  ========================================================= */
  const L2 = new THREE.Group(); L2.name = '二层'; root.add(L2);

  // 二层楼板 + 南向悬挑板
  const slabMain = box(m.x1 - m.x0, m.slab, m.z1 - m.z0, M.metalLite,
    (m.x0 + m.x1) / 2, m.f1 + m.slab / 2, (m.z0 + m.z1) / 2, L2);
  slabMain.name = '二层楼板';
  const slabS = box(m.x1 - m.x0, m.slab, P.cant.south, M.metalLite,
    (m.x0 + m.x1) / 2, m.f1 + m.slab / 2, m.z1 + P.cant.south / 2, L2);
  slabS.name = '二层南向悬挑板';
  // 悬挑板底金属包边（真实檐口厚度）
  const fascia = box(m.x1 - m.x0 + 0.10, 0.16, 0.08, M.metal,
    (m.x0 + m.x1) / 2, m.f1 + 0.08, m.z1 + P.cant.south + 0.01, L2, { bevel: 0.010 });
  fascia.name = '南向檐口包边';
  box(m.x1 - m.x0 + 0.10, 0.035, 0.035, M.metal,
    (m.x0 + m.x1) / 2, m.f1 - 0.005, m.z1 + P.cant.south + 0.045, L2).name = '檐口滴水';

  // 二层内胆（含南向悬挑部分，同样内退一个墙厚）
  const z2in = m.z1 + P.cant.south - m.wall;   // 二层南墙内皮 7.50
  box(m.x1 - m.x0 - 2 * m.wall, m.f2 - F2, z2in - (m.z0 + m.wall), M.dark,
    (m.x0 + m.x1) / 2, (F2 + m.f2) / 2, (m.z0 + m.wall + z2in) / 2, L2).name = '二层内胆';

  // —— 南立面二层（悬挑面，通长玻璃 5 段分格）——
  facade({
    uSpan: [m.x0, m.x1], ySpan: [F2, m.f2], holes: [op.sWin2],
    mat: M.coat, thick: m.wall, dir: D.s2, root: L2, name: '南立面二层墙面',
    splits: [-9, -4.5, 0, 4.5, 9],
  });
  // —— 东立面二层 ——
  facade({
    uSpan: [-6, 6], ySpan: [F2, m.f2], holes: op.eWin2,
    mat: M.coat, thick: m.wall, dir: D.e1, root: L2, name: '东立面二层墙面',
    splits: [-6, -3, 0, 3, 6],
  });
  // —— 北立面二层 ——
  facade({
    uSpan: [-9, 9], ySpan: [F2, m.f2], holes: op.nWin2,
    mat: M.coat, thick: m.wall, dir: D.n1, root: L2, name: '北立面二层墙面',
    splits: [-9, -6, -3, 0, 3, 6, 9],
  });
  // —— 西立面二层（含通露台门）——
  facade({
    uSpan: [-6, 6], ySpan: [F2, m.f2], holes: [op.wDoor2, ...op.wWin2],
    mat: M.coat, thick: m.wall, dir: D.w1, root: L2, name: '西立面二层墙面',
    splits: [-6, -3, 0, 3, 6],
  });

  /* ---------- 二层门窗 ---------- */
  const G2 = new THREE.Group(); G2.name = '二层门窗'; root.add(G2);
  reg(windowUnit({
    hole: op.sWin2, dir: D.s2, root: G2, name: '南-二层通长玻璃',
    thick: m.wall,
    mullions: [-5.04, -1.68, 1.68, 5.04],   // 16.8m 分 5 段，每段 3.36m
    sill: false, recess: 0.12,
  }));
  op.eWin2.forEach((h, i) => reg(windowUnit({
    hole: h, dir: D.e1, root: G2, name: `东-二层窗-${i + 1}`, thick: m.wall,
  })));
  op.nWin2.forEach((h, i) => reg(windowUnit({
    hole: h, dir: D.n1, root: G2, name: `北-二层窗-${i + 1}`, thick: m.wall,
  })));
  reg(windowUnit({
    hole: op.wWin2[0], dir: D.w1, root: G2, name: '西-二层窗', thick: m.wall,
  }));
  reg(doorUnit({
    hole: op.wDoor2, dir: D.w1, root: G2, name: '西-二层通露台门',
    thick: m.wall, leaves: 2, panelLow: 0.35,
  }));

  /* ---------- 东向遮阳挑檐（水平，真几何；只盖两侧窗） ---------- */
  const ES = new THREE.Group(); ES.name = '东向遮阳挑檐'; root.add(ES);
  // 这片挑檐连同拉杆都在东立面上，从南/北看只剩轮廓外一条斜杆，
  // 图纸视图（views.html）据此把它剔除，避免「悬空斜杆」误读。
  ES.userData.docHide = ['south', 'north'];
  const es = P.eastShade;
  es.seg.forEach(([a, b], si) => {
    const len = b - a;
    const g = new THREE.Group();
    const sh = slab(len, es.thick, es.out, M.metalLite, 0, 0, es.out / 2, g, 0.014);
    sh.name = `遮阳板-${si + 1}`;
    box(len + 0.06, 0.10, 0.06, M.metal, 0, -es.thick / 2 + 0.05, es.out, g).name = '遮阳板前封边';
    box(len + 0.06, 0.035, 0.035, M.metal, 0, -es.thick / 2 - 0.02, es.out + 0.03, g).name = '遮阳滴水';
    // 侧封板
    [-1, 1].forEach((s) => box(0.06, es.thick, es.out, M.metal, s * (len / 2 + 0.02), 0, es.out / 2, g).name = '遮阳侧封板');
    // 拉杆：从板外端上表面斜拉回墙面下方（两端必须正好落在板端与墙面上）
    [-1, 1].forEach((s, k) => {
      const drop = 0.90;                       // 墙面锚点距板面的垂直距离
      const L = Math.hypot(es.out, drop);
      const r = box(0.045, L, 0.045, M.steel, s * (len / 2 - 0.25), -drop / 2, es.out / 2, g);
      // 杆轴由 (y=-drop, z=0) 指向 (y=0, z=out)：即板外端斜拉回墙面
      r.rotation.x = Math.atan2(es.out, drop) + Math.PI;
      r.name = `遮阳拉杆-${si + 1}-${k + 1}（简化）`;
    });
    D.e1.put(g, ES, (a + b) / 2, es.y, 0);
  });
  info(ES, '东向遮阳挑檐', {
    size: `2 段各 ${(es.seg[0][1] - es.seg[0][0]).toFixed(2)}m 长 × ${es.out.toFixed(2)}m 挑出`,
    mat: '铝合金遮阳板 + 钢拉杆',
    note: `板厚 ${(es.thick * 1000).toFixed(0)}mm，设于二层两侧窗上口；中部通高窗不设，避免遮挡`,
    simple: '简化：拉杆为直杆，未做可调节点与根部埋件',
  });
  reg(ES);

  /* ---------- 竖向木格栅（南二层，已扩展至 7.2m） ---------- */
  const scr = screen({
    uSpan: P.screen.u, ySpan: P.screen.y, bar: P.screen.bar, pitch: P.screen.pitch,
    out: 0.18, root: new THREE.Group(), name: '南立面竖向木格栅',
  });
  scr.position.set(0, 0, m.z1 + P.cant.south);
  root.add(scr);
  reg(scr);

  /* =========================================================
     露台（车库顶）
  ========================================================= */
  const TG = new THREE.Group(); TG.name = '二层西露台'; root.add(TG);
  const deck = box(gr.x1 - gr.x0, gr.roof, gr.z1 - gr.z0, M.conc,
    (gr.x0 + gr.x1) / 2, gr.h + gr.roof / 2, (gr.z0 + gr.z1) / 2, TG);
  deck.name = '露台结构板（车库顶板）';
  // 露台面层（薄找坡层）
  box(gr.x1 - gr.x0 - 0.06, 0.04, gr.z1 - gr.z0 - 0.06, M.concDark,
    (gr.x0 + gr.x1) / 2, deckY + 0.02, (gr.z0 + gr.z1) / 2, TG, { cast: false }).name = '露台面层';

  // 栏板沿露台三面闭合：北(z=-6) → 西(x=-14.4) → 南(z=0)；东面紧接主楼墙体，不设
  const rail = railing({
    pts: [[gr.x1, gr.z0], [gr.x0, gr.z0], [gr.x0, gr.z1], [gr.x1, gr.z1]],
    root: TG, name: '露台玻璃栏板', h: 1.10,
  });
  rail.position.y = deckY;
  reg(rail);

  // 露台门下两步台阶：门在 x=-9 墙，向西下到露台（室内 4.32 → 露台 3.90）
  const ST = new THREE.Group(); ST.name = '露台踏步'; root.add(ST);
  // 出门平台（与室内齐平 4.32）
  box(0.60, 0.42, 1.60, M.conc, -9.30, 4.11, -3.40, ST, { bevel: 0.006 }).name = '露台门平台';
  // 第一级（顶面 4.11）
  box(0.30, 0.21, 1.60, M.conc, -9.75, 4.005, -3.40, ST, { bevel: 0.006 }).name = '露台踏步-1';
  // 第二级即露台面 3.90；补一道前缘防滑条
  box(0.06, 0.02, 1.60, M.metal, -9.90, 3.905, -3.40, ST, { cast: false }).name = '踏步前缘防滑条';
  info(ST, '露台踏步', {
    size: '平台 + 1 级，共下落 0.42m（210mm/级）',
    mat: '清水混凝土，前缘嵌铝防滑条',
    note: '连接二层室内地面(4.32)与露台面(3.90)，出门先设同高平台再下落',
    simple: '未做排水坡度与防冻胀构造',
  });
  reg(ST);

  // 车库与主楼错台处的线脚（3.60 → 3.90 过渡）
  const tr = box(gr.x1 - gr.x0 + 0.12, 0.10, 0.10, M.metal,
    (gr.x0 + gr.x1) / 2, gr.h + 0.05, gr.z1 + 0.05, TG, { bevel: 0.010 });
  tr.name = '车库顶错台线脚';
  info(tr, '车库顶错台线脚', {
    size: `长 ${(gr.x1 - gr.x0).toFixed(2)}m`,
    mat: '铝合金线脚',
    note: '车库净高 3.60 与二层楼板底 3.90 之间的过渡收口',
    simple: '简化：单道线脚，未做保温连续收头',
  });
  reg(tr);

  /* =========================================================
     主入口门廊
  ========================================================= */
  const PG = new THREE.Group(); PG.name = '主入口门廊'; root.add(PG);
  const po = P.porch;
  reg(canopy({
    dir: D.s1, root: PG, name: '入口雨棚', halfW: po.halfW, out: po.out,
    clear: po.clear, thick: po.thick, columns: 2,
  }));
  reg(steps({
    dir: D.s1, root: PG, name: '入口台阶', width: 3.40,
    run: 0.34, rise: 0.17, count: 3, platform: 1.20, landW: 4.60,
  }));

  /* ---------- 门牌（贴图） ---------- */
  const signTex = signTexture(['VILLA', 'No. 168']);
  reg(signage({
    dir: D.s1, root: PG, u: 2.30, y: 2.20, name: '入口门牌',
    w: 0.66, h: 0.33, tex: signTex, out: 0.03,
  }));

  /* =========================================================
     屋面
  ========================================================= */
  const RF = new THREE.Group(); RF.name = '屋面'; root.add(RF);

  const roofSlab = box(m.x1 - m.x0, 0.30, m.z1 - m.z0, M.metalLite,
    (m.x0 + m.x1) / 2, m.f2 + 0.15, (m.z0 + m.z1) / 2, RF);
  roofSlab.name = '屋面板';

  const PW = new THREE.Group(); PW.name = '屋面女儿墙'; RF.add(PW);

  // 女儿墙四面 + 压顶
  const ph = m.para - m.f2, pw = 0.22;
  [
    { ax: 'z', at: m.z1 - pw / 2, len: m.x1 - m.x0 + pw, nm: '南' },
    { ax: 'z', at: m.z0 + pw / 2, len: m.x1 - m.x0 + pw, nm: '北' },
    { ax: 'x', at: m.x1 - pw / 2, len: m.z1 - m.z0 - pw * 2, nm: '东' },
    { ax: 'x', at: m.x0 + pw / 2, len: m.z1 - m.z0 - pw * 2, nm: '西' },
  ].forEach(({ ax, at, len, nm }) => {
    const mp = box(ax === 'z' ? len : pw, ph, ax === 'z' ? pw : len, M.metal,
      ax === 'z' ? (m.x0 + m.x1) / 2 : at, m.f2 + ph / 2, ax === 'z' ? at : (m.z0 + m.z1) / 2, PW);
    mp.name = `女儿墙-${nm}`;
    const cp = slab(ax === 'z' ? len + 0.08 : pw + 0.08, 0.07, ax === 'z' ? pw + 0.08 : len + 0.08,
      M.metalLite, ax === 'z' ? (m.x0 + m.x1) / 2 : at, m.f2 + ph + 0.035,
      ax === 'z' ? at : (m.z0 + m.z1) / 2, PW, 0.012);
    cp.name = `女儿墙压顶-${nm}`;
  });
  info(PW, '屋面女儿墙', {
    size: `高 ${ph.toFixed(2)}m，厚 ${(pw * 1000).toFixed(0)}mm，四周闭合`,
    mat: '混凝土女儿墙 + 铝合金压顶（外挑 40mm 带滴水）',
    note: '压顶外挑出墙身，形成阴影线',
    simple: '压顶内侧泛水、避雷带未建模',
  });

  /* ---------- 屋面能源布局：中部 BIPV 采光带 + 两侧满铺光伏 ----------
     设计逻辑：一层进深 12m，中部必须自然采光，所以不能把光伏铺满；
     做法不是「天窗避让光伏」，而是把天窗本身做成透光光伏组件（BIPV），
     屋面成为一套统一的「采光发电屋面」，中部光带兼作采光与发电，
     南北两侧常规组件满铺到女儿墙内侧。                              */
  const pv = P.pv;
  const pvMat = new THREE.MeshStandardMaterial({
    map: pvTexture(), roughness: 0.26, metalness: 0.38, color: 0xffffff,
  });
  const PV = new THREE.Group(); PV.name = '屋面光伏阵列'; root.add(PV);

  // 中部 BIPV 采光带（沿东西向通长，位于主楼进深中部）
  const bandD = 2.40;                                  // 光带宽度
  const bandZ = (m.z0 + m.z1) / 2;                     // 进深正中
  const bandW = (m.x1 - m.x0) - 2 * 1.10;              // 两端各留 1.10m 检修边
  const band = bipvRoof({
    x: 0, z: bandZ, w: bandW, d: bandD, y: m.f2 + 0.30,
    root: RF, name: '屋面 BIPV 采光带',
  });
  reg(band);

  /* 常规光伏布点：以「块」为单位排布，块内整排整列，块间不重叠。
     屋面分三个功能区，互不侵占：
       ① 南块（光带以南 → 南女儿墙内侧）
       ② 北块-东（光带以北、设备区以东）
       ③ 北块-西：让位给热泵机组与检修走道，不铺光伏
     每块宽度取整列数，从块中心对称排布，避免出现残列。          */
  const tw = pv.cols * pv.w + (pv.cols - 1) * pv.gap;   // 8 列总宽
  const td = pv.rows * pv.d + (pv.rows - 1) * pv.gap;   // 3 排总深
  const edgeIn = 0.42;                                  // 距女儿墙内侧净距

  // 设备区（西北角）：x ∈ [-8.0, -2.6]，z ∈ [-5.7, -3.4]
  const eqZone = { x0: -8.0, x1: -2.6, z0: m.z0 + edgeIn, z1: -3.30 };

  const pvList = [], legList = [];
  /** 在给定矩形内，按 cols×rows 铺一个整块（超出则收缩列数保证不越界） */
  const fillBlock = (bx0, bx1, bz0, bz1, cols) => {
    const bw = bx1 - bx0;
    const n = Math.max(1, Math.min(cols, Math.floor((bw + pv.gap) / (pv.w + pv.gap))));
    const wTot = n * pv.w + (n - 1) * pv.gap;
    const dTot = td;
    const cx0 = bx0 + (bw - wTot) / 2;
    const cz0 = bz0 + ((bz1 - bz0) - dTot) / 2;
    for (let r = 0; r < pv.rows; r++) {
      for (let c = 0; c < n; c++) {
        const x = cx0 + pv.w / 2 + c * (pv.w + pv.gap);
        const z = cz0 + pv.d / 2 + r * (pv.d + pv.gap);
        pvList.push({ x, y: m.f2 + 0.40, z, rx: -pv.tilt * Math.PI / 180 });
        legList.push({ x: x - pv.w * 0.32, y: m.f2 + 0.40, z });
        legList.push({ x: x + pv.w * 0.32, y: m.f2 + 0.40, z });
      }
    }
  };

  const zBandN = bandZ - bandD / 2 - 0.30;              // 光带北边缘
  const zBandS = bandZ + bandD / 2 + 0.30;              // 光带南边缘
  // ① 南块：整宽 8 列
  fillBlock(m.x0 + edgeIn, m.x1 - edgeIn, zBandS, m.z1 - edgeIn, pv.cols);
  // ② 北块-东：设备区以东至东女儿墙内侧
  fillBlock(eqZone.x1 + 0.30, m.x1 - edgeIn, m.z0 + edgeIn, zBandN, pv.cols);
  // ③ 北块-西（x -8.6…-8.0）：仅 0.6m，不足一列，不铺光伏，留作检修通道
  instanced(new THREE.BoxGeometry(pv.w, 0.05, pv.d), pvMat, pvList, PV, '光伏板');
  instanced(new THREE.BoxGeometry(0.05, 0.22, 0.05), M.metal, legList, PV, '光伏支架');

  const nPV = pvList.length;
  const roofArea = (m.x1 - m.x0) * (m.z1 - m.z0);
  const areaPV = nPV * pv.w * pv.d, areaBIPV = bandW * bandD;
  info(PV, '屋面光伏阵列', {
    size: `${nPV} 块常规组件（南北两组各 ${pv.rows}×${pv.cols}）＋ 中部 BIPV 采光带 ${bandW.toFixed(1)}×${bandD.toFixed(1)}m`,
    mat: '单晶硅组件 + BIPV 透光组件 + 铝合金支架',
    note: `倾角 ${pv.tilt}°；发电面积 ${(areaPV + areaBIPV).toFixed(1)} m²，占屋面约 ${((areaPV + areaBIPV) / roofArea * 100).toFixed(0)}%`,
    simple: '简化：未建模逆变器、桥架、电缆与检修通道',
  });
  reg(PV);

  // —— 屋面设备平台 ——
  const EQ = new THREE.Group(); EQ.name = '屋面设备'; root.add(EQ);
  // 两台机组集中在西北角（eqZone 内），东侧屋面完整留给光伏
  reg(mechBox({
    x: -6.60, y: m.f2 + 0.32, z: -4.55, w: 1.60, h: 1.00, d: 0.90,
    root: EQ, name: '屋面热泵机组-A', kind: '空气源热泵室外机',
  }));
  reg(mechBox({
    x: -4.60, y: m.f2 + 0.32, z: -4.55, w: 1.20, h: 0.80, d: 0.80,
    root: EQ, name: '屋面热泵机组-B', kind: '空气源热泵室外机',
  }));
  // 设备基础（整体抬高，与光伏分区隔离）
  const eqBase = box(4.90, 0.16, 1.70, M.conc, -5.85, m.f2 + 0.40, -4.55, EQ, { bevel: 0.008 });
  eqBase.name = '屋面设备基础';
  info(eqBase, '屋面设备基础', {
    size: '4.90 × 1.70 × 0.16 m',
    mat: '混凝土条形基础',
    note: '两台热泵落在同一基础上，集中在西北角，东侧屋面完整用于光伏',
    simple: '简化：未建模减振垫与预埋件',
  });
  reg(eqBase);
  // 检修走道：设备区与光伏之间留 1.10m 通道（沿东西向）
  box(4.90, 0.06, 1.10, M.concDark, -5.85, m.f2 + 0.33, -3.20, EQ, { cast: false }).name = '屋面检修走道';

  /* =========================================================
     简化五金（标注）
  ========================================================= */
  const HW = new THREE.Group(); HW.name = '简化五金'; root.add(HW);
  // 雨水立管：放在凹角（主楼西墙 × 车库南墙）与东北背面角
  reg(downpipe({ x: m.x0 + 0.12, z: gr.z1 + 0.12, y0: 0, y1: m.f2, root: HW, name: '雨水立管-1（西南凹角）' }));
  reg(downpipe({ x: m.x1 - 0.12, z: m.z0 + 0.12, y0: 0, y1: m.f2, root: HW, name: '雨水立管-2（东北背面）' }));
  // 空调室外机（北立面，带百叶罩）
  reg(mechBox({
    x: 6.10, y: 0.14, z: m.z0 - 0.55, w: 1.10, h: 0.85, d: 0.55,
    root: HW, name: '空调室外机-1', kind: '分体空调室外机',
  }));
  reg(mechBox({
    x: 4.70, y: 0.14, z: m.z0 - 0.55, w: 1.10, h: 0.85, d: 0.55,
    root: HW, name: '空调室外机-2', kind: '分体空调室外机',
  }));
  // 百叶罩：外机最外缘 z=-6.825，罩移到 -6.95..-6.85，与外机留 25mm 净距（原值会穿插）
  reg(louver({
    x: 5.40, y: 0.565, z: m.z0 - 0.90, w: 3.30, h: 1.15, d: 0.10,
    ry: 0, root: HW, name: '空调外机百叶罩', blades: 13,
  }));
  // 入口壁灯
  [[-1.9], [1.9]].forEach(([x], i) => {
    const l = box(0.14, 0.34, 0.10, M.metal, x, 2.60, m.z1 + 0.06, HW, { bevel: 0.008 });
    l.name = `入口壁灯-${i + 1}（简化：方块，无配光）`;
    info(l, `入口壁灯-${i + 1}`, {
      size: '140 × 340 × 100 mm', mat: '铝制灯体',
      note: '门廊两侧对称布置',
      simple: '简化：方盒，无配光曲线、无光源',
    });
    reg(l);
  });

  /* =========================================================
     幕墙系统：统一登记为可拾取构件（几何分板已在 facade 内完成）
  ========================================================= */
  const WALL_META = {
    '南立面一层石材幕墙': {
      size: '18.00 × 3.90 m，6 块（3m 一开间）',
      mat: '米白洞石 30mm 干挂 + 暖灰缝底',
      note: '板缝 30mm 真实留空，缝内为后退 8mm 的暖灰底板；洞口四周 6mm 倒角',
      simple: '简化：未表达干挂挂件、背栓与保温层',
    },
    '东立面一层涂料墙面': {
      size: '12.00 × 3.90 m，4 块', mat: '米白外墙涂料',
      note: '板缝 30mm 留空；3 个洞口均带四壁内衬',
      simple: '简化：未做分格条与滴水线',
    },
    '北立面一层墙面(主楼段)': {
      size: '18.00 × 3.90 m，6 块', mat: '米白外墙涂料',
      note: '服务门 1.20m + 3 扇高窗（窗台 1.50m）',
      simple: '简化：未做分格条',
    },
    '北立面一层墙面(车库段)': {
      size: '5.40 × 3.60 m，2 块', mat: '米白洞石（与主楼南立面同材质）',
      note: '设 1.50m 通风百叶',
      simple: '简化：未表达与主楼交接处的变形缝',
    },
    '西立面一层墙面(主楼段)': {
      size: '12.00 × 3.90 m，4 块', mat: '米白外墙涂料',
      note: '设 1 扇高窗（1.40~2.60m）',
      simple: '简化：未做分格条',
    },
    '西立面车库墙面': {
      size: '6.00 × 3.60 m，2 块', mat: '米白洞石',
      note: '卷帘门洞口 5.00×2.80m，门楣罩外挑',
      simple: '简化：未表达门洞过梁与预埋件',
    },
    '车库南墙': {
      size: '5.40 × 3.60 m，2 块', mat: '米白洞石',
      note: '中部设 1.50m 通风百叶',
      simple: '简化：未表达与主楼交接的阴角处理',
    },
    '南立面二层墙面': {
      size: '18.00 × 2.88 m（悬挑面，外皮 z=7.80），4 块', mat: '米白外墙涂料',
      note: '通长玻璃洞口 16.80×2.60m，5 段分格；下方为 1.80m 悬挑板与檐口包边',
      simple: '简化：未表达悬挑梁与结构支撑',
    },
    '东立面二层墙面': {
      size: '12.00 × 2.88 m，4 块', mat: '米白外墙涂料',
      note: '2 扇侧窗（1.50×2.00m）+ 1 扇中部通高窗（1.40×2.60m）',
      simple: '简化：未表达结构梁位置',
    },
    '北立面二层墙面': {
      size: '18.00 × 2.88 m，6 块', mat: '米白外墙涂料',
      note: '2 扇窗（1.50×1.80m）',
      simple: '简化：未表达结构梁位置',
    },
    '西立面二层墙面': {
      size: '12.00 × 2.88 m，4 块', mat: '米白外墙涂料',
      note: '含通露台门洞口 1.20×2.26m 与 3.00×2.00m 侧窗',
      simple: '简化：未表达结构梁位置',
    },
  };
  root.traverse((o) => {
    if (o.name && WALL_META[o.name]) {
      o.userData.info = { name: o.name, ...WALL_META[o.name] };
      parts.push(o.userData.info);
    }
  });

  /* ---------- 散水排水沟（沿建筑轮廓分两段） ---------- */
  reg(apron({
    root, rect: { x0: m.x0, x1: m.x1, z0: m.z0, z1: m.z1 },
    name: '散水排水沟(主楼段)', w: 0.70,
  }));
  reg(apron({
    root, rect: { x0: gr.x0, x1: gr.x1, z0: gr.z0, z1: gr.z1 },
    name: '散水排水沟(车库段)', w: 0.70,
  }));

  return { root, parts };
}


/* ============================================================
   自检：同一立面上洞口是否重叠（重叠会让墙板 Shape 挖洞自相交，
   挤出后出现斜切多边形等破面）
============================================================ */
export function checkOpenings() {
  const bad = [];
  const facades = [
    ['南一层', P.open.sDoor, P.open.sWinL, P.open.sWinR].filter(Boolean),
    ['南二层', P.open.sWin2].filter(Boolean),
    ['东一层', ...P.open.eWin1],
    ['东二层', ...P.open.eWin2],
    ['北一层', P.open.nDoor, ...P.open.nWin1],
    ['北二层', ...P.open.nWin2],
    ['北车库', ...P.open.gWin],
    ['西一层', ...P.open.wWin1],
    ['西二层', P.open.wDoor2, ...P.open.wWin2],
    ['西车库', P.open.gShutter],
    ['车库南', P.open.gsVent],
  ];
  facades.forEach(([nm, ...list]) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        const ox = Math.min(A.u[1], B.u[1]) - Math.max(A.u[0], B.u[0]);
        const oy = Math.min(A.y[1], B.y[1]) - Math.max(A.y[0], B.y[0]);
        if (ox > 1e-6 && oy > 1e-6) {
          bad.push(`${nm}: 洞口${i + 1}与洞口${j + 1} 重叠 ${ox.toFixed(2)}m×${oy.toFixed(2)}m`);
        }
      }
    }
  });
  return bad;
}
