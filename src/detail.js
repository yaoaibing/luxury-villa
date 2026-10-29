/* ============================================================
   detail.js · 精修构件库
   ------------------------------------------------------------
   所有构件都建成「有厚度的实体」：洞口有四壁内衬、框有进出位、
   板有倒角与滴水、缝是真实留空。纯色部分不贴任何图。
   每个构件返回 Group，并写入 userData.info（供网页端拾取展示）。
   ============================================================ */
import * as THREE from 'three';
import { M, box, slab, instanced } from './core.js';

/** 写入构件信息（网页端拾取时展示） */
export function info(g, name, o = {}) {
  g.name = name;
  g.userData.info = {
    name,
    size: o.size || '—',
    mat: o.mat || '—',
    note: o.note || '',
    simple: o.simple || '',
  };
  return g;
}

/* ============================================================
   1. 洞口四壁内衬（reveal）
   ------------------------------------------------------------
   洞口是墙里挖空的部分，四周必须贴面才不露结构芯。
   局部：x 沿墙，y 高，z 朝室外（0=外皮，-thick=内皮）
============================================================ */
export function reveal({ w, h, thick, mat, parent, t = 0.03, side = 'all' }) {
  const g = new THREE.Group();
  const zc = -thick / 2;
  const mk = (bw, bh, x, y, nm) => {
    const b = box(bw, bh, thick, mat, x, y, zc, g);
    b.name = nm;
    return b;
  };
  if (side === 'all' || side === 'h') {
    mk(w, t, 0, h / 2 + t / 2, '洞口上壁(过梁底)');   // 上
    mk(w, t, 0, -h / 2 - t / 2, '洞口下壁');          // 下
  }
  if (side === 'all' || side === 'v') {
    mk(t, h, -w / 2 - t / 2, 0, '洞口左侧壁');
    mk(t, h, w / 2 + t / 2, 0, '洞口右侧壁');
  }
  parent.add(g);
  return g;
}

/* ============================================================
   2. 窗单元：内衬 + 框 + 分格 + 玻璃 + 窗台（带滴水）
   opts: { mullions:[u偏移...], transom:[y偏移...], recess, sill, sillOut }
============================================================ */
export function windowUnit({
  hole, dir, root, name, thick = 0.30, mullions = [], transom = [],
  recess = 0.10, sill = true, sillOut = 0.10, revealMat = null, mat = M.metal,
}) {
  const [a, b] = hole.u, [c, d] = hole.y;
  const w = b - a, h = d - c;
  const G = new THREE.Group();
  G.name = name;

  // ---- 洞口内衬（石材面用石材，涂料面用涂料）
  reveal({ w, h, thick, mat: revealMat || M.coat, parent: G });

  // ---- 窗框（洞口内退 recess，框深 0.09）
  const fz = -recess - 0.045;
  const frameT = 0.06;
  const fmk = (bw, bh, x, y) => {
    const m = box(bw, bh, 0.09, mat, x, y, fz, G);
    m.name = '窗框';
    return m;
  };
  fmk(w + frameT * 2, frameT, 0, h / 2 + frameT / 2);
  fmk(w + frameT * 2, frameT, 0, -h / 2 - frameT / 2);
  fmk(frameT, h, -w / 2 - frameT / 2, 0);
  fmk(frameT, h, w / 2 + frameT / 2, 0);

  // ---- 玻璃（整片，在框后 10mm）
  const gp = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), M.glass);
  gp.position.set(0, 0, fz - 0.012);
  gp.name = '玻璃';
  G.add(gp);

  // ---- 竖挺 / 横挺（真几何分格）
  mullions.forEach((u, i) => {
    const m = box(0.055, h, 0.085, mat, u, 0, fz + 0.008, G);
    m.name = `竖向分格挺-${i + 1}`;
  });
  transom.forEach((y, i) => {
    const m = box(w, 0.055, 0.085, mat, 0, y, fz + 0.008, G);
    m.name = `横向分格挺-${i + 1}`;
  });

  // ---- 窗台板（外挑 + 滴水）
  if (sill) {
    const sw = w + 0.26;
    const sp = slab(sw, 0.07, 0.30, M.metalLite, 0, -h / 2 - 0.05, -0.06, G, 0.014);
    sp.name = '窗台板';
    // 滴水条（窗台前端下垂，防止雨水顺墙流）
    const dp = box(sw - 0.04, 0.030, 0.045, M.metal, 0, -h / 2 - 0.10, sillOut - 0.02, G);
    dp.name = '窗台滴水';
  }

  dir.put(G, root, (a + b) / 2, (c + d) / 2, 0);
  const cols = mullions.length + 1, rows = transom.length + 1;
  info(G, name, {
    size: `${w.toFixed(2)} × ${h.toFixed(2)} m（宽×高）`,
    mat: '深灰铝合金框 + 中空 Low-E 玻璃',
    note: `洞口四壁带 30mm 内衬，框内退 ${(recess * 1000).toFixed(0)}mm，分格 ${cols}×${rows}`,
    simple: '开启扇与五金未建模，仅以分格挺表达',
  });
  return G;
}

/* ============================================================
   3. 门单元：框 + 双开扇（玻璃+金属裙板）+ 把手 + 门槛
============================================================ */
export function doorUnit({
  hole, dir, root, name, thick = 0.30, leaves = 2, recess = 0.10,
  mat = M.metal, panelLow = 0.45, revealMat = M.coat,
}) {
  const [a, b] = hole.u, [c, d] = hole.y;
  const w = b - a, h = d - c;
  const G = new THREE.Group();

  reveal({ w, h, thick, mat: revealMat, parent: G });

  // 门框
  const fz = -recess - 0.05, frameT = 0.07;
  box(w + frameT * 2, frameT, 0.10, mat, 0, h / 2 + frameT / 2, fz, G).name = '门框上';
  box(frameT, h, 0.10, mat, -w / 2 - frameT / 2, 0, fz, G).name = '门框左';
  box(frameT, h, 0.10, mat, w / 2 + frameT / 2, 0, fz, G).name = '门框右';

  // 门扇
  const lw = w / leaves;
  for (let i = 0; i < leaves; i++) {
    const cx = -w / 2 + lw * (i + 0.5);
    const leaf = new THREE.Group();
    leaf.name = `门扇-${i + 1}`;
    // 扇框
    box(lw - 0.03, 0.07, 0.06, mat, 0, h / 2 - 0.035, 0, leaf).name = '扇上梃';
    box(lw - 0.03, 0.07, 0.06, mat, 0, -h / 2 + 0.035, 0, leaf).name = '扇下梃';
    box(0.07, h - 0.14, 0.06, mat, -(lw - 0.03) / 2, 0, 0, leaf).name = '扇边梃左';
    box(0.07, h - 0.14, 0.06, mat, (lw - 0.03) / 2, 0, 0, leaf).name = '扇边梃右';
    // 玻璃（裙板以上部分）——中心在 y = panelLow/2，高 gh
    const gh = Math.max(0.20, h - panelLow - 0.14);
    const gg = new THREE.Mesh(new THREE.BoxGeometry(lw - 0.17, gh, 0.02), M.glass);
    gg.position.set(0, panelLow / 2, -0.01);
    gg.name = '门扇玻璃';
    leaf.add(gg);
    // 下部金属裙板
    box(lw - 0.17, panelLow, 0.04, mat, 0, -h / 2 + 0.07 + panelLow / 2, 0, leaf).name = '门扇裙板';
    // 把手（简化竖条）
    const hx = (i === 0 ? 1 : -1) * (lw / 2 - 0.16);
    box(0.035, 0.62, 0.035, M.steel, hx, 0.05, 0.07, leaf).name = '门把手（简化）';
    leaf.position.set(cx, 0, fz - 0.02);
    G.add(leaf);
  }

  // 门槛（无高差，只做一道金属嵌条）
  box(w, 0.025, thick, M.steel, 0, -h / 2 + 0.012, -thick / 2, G).name = '门槛嵌条';

  dir.put(G, root, (a + b) / 2, (c + d) / 2, 0);
  info(G, name, {
    size: `${w.toFixed(2)} × ${h.toFixed(2)} m`,
    mat: '深灰铝合金门框 + 钢化玻璃 + 下部铝裙板',
    note: `${leaves} 扇对开，扇宽 ${lw.toFixed(2)}m，框内退 ${(recess * 1000).toFixed(0)}mm`,
    simple: '闭门器、地弹簧、密封条未建模',
  });
  return G;
}

/* ============================================================
   4. 车库卷帘门：门楣罩 + 叶片 + 导轨
============================================================ */
export function shutterDoor({
  hole, dir, root, name, thick = 0.30, slat = 0.16, revealMat = M.stone,
}) {
  const [a, b] = hole.u, [c, d] = hole.y;
  const w = b - a, h = d - c;
  const G = new THREE.Group();

  reveal({ w, h, thick, mat: revealMat, parent: G, side: 'v' });

  // 门楣罩（卷帘箱，突出墙面）
  const hood = slab(w + 0.30, 0.40, 0.46, M.metal, 0, h + 0.20, -0.10, G, 0.02);
  hood.name = '卷帘门楣罩';

  // 叶片（真几何，逐片）
  const n = Math.max(6, Math.round(h / slat));
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({ x: 0, y: -h / 2 + (h / n) * (i + 0.5), z: -0.09 });
  }
  instanced(new THREE.BoxGeometry(w - 0.10, (h / n) * 0.78, 0.05), M.metalLite, list, G, '卷帘叶片');

  // 导轨
  box(0.09, h, 0.14, M.metal, -w / 2 - 0.045, 0, -0.10, G).name = '卷帘导轨(左)';
  box(0.09, h, 0.14, M.metal, w / 2 + 0.045, 0, -0.10, G).name = '卷帘导轨(右)';

  dir.put(G, root, (a + b) / 2, (c + d) / 2, 0);
  info(G, name, {
    size: `${w.toFixed(2)} × ${h.toFixed(2)} m`,
    mat: '铝合金卷帘 + 钢导轨 + 门楣罩',
    note: `${n} 片叶片，片高 ${((h / n) * 1000).toFixed(0)}mm，双车位净宽`,
    simple: '电机、传动轴、底梁密封胶条未建模',
  });
  return G;
}

/* ============================================================
   5. 入口雨棚：结构板 + 封边 + 滴水 + 吊顶 + 立柱（带柱脚）
   out 为挑出深度（沿 dir 室外方向）
============================================================ */
export function canopy({
  dir, root, name, halfW, out, clear, thick = 0.30, mat = M.metalLite,
  columns = 2, colInset = 0.15,
}) {
  const G = new THREE.Group();
  const top = clear + thick;

  // 结构板（带倒角，真实 300 厚）
  const deck = slab(halfW * 2, thick, out, mat, 0, clear + thick / 2, out / 2, G, 0.024);
  deck.name = '雨棚结构板';

  // 前封边（fascia）：比板略高，形成厚檐口
  const fas = box(halfW * 2 + 0.08, 0.16, 0.07, M.metal, 0, top - 0.08, out + 0.005, G, { bevel: 0.012 });
  fas.name = '雨棚前封边';
  // 滴水（檐口下方 15mm 凸条，断水）
  box(halfW * 2 + 0.08, 0.035, 0.035, M.metal, 0, top - 0.17, out + 0.035, G).name = '檐口滴水';

  // 吊顶板（内凹 60mm，形成阴影缝）
  const ceil = box(halfW * 2 - 0.12, 0.05, out - 0.12, M.metal, 0, clear - 0.025, out / 2 - 0.02, G);
  ceil.name = '雨棚吊顶板';
  // 吊顶与封边之间的阴影缝（留空，不做贴图）
  box(halfW * 2 - 0.12, 0.02, 0.06, M.dark, 0, clear - 0.055, out - 0.09, G, { cast: false }).name = '吊顶阴影缝';

  // 侧封板
  [-1, 1].forEach((s) => {
    box(0.07, thick, out, M.metal, s * (halfW + 0.02), clear + thick / 2, out / 2, G).name = '雨棚侧封板';
  });

  // 立柱 + 柱脚
  if (columns === 2) {
    [-halfW + colInset, halfW - colInset].forEach((x, i) => {
      const cz = out - 0.18;
      const c = box(0.16, clear, 0.16, M.metal, x, clear / 2, cz, G, { bevel: 0.008 });
      c.name = `门廊立柱-${i + 1}`;
      // 柱脚（外包不锈钢，高出地面 60）
      const b = slab(0.26, 0.06, 0.26, M.steel, x, 0.03, cz, G, 0.010);
      b.name = `柱脚-${i + 1}`;
      // 柱头（与雨棚底的过渡板）
      box(0.22, 0.05, 0.22, M.metal, x, clear - 0.025, cz, G).name = '柱头过渡板';
    });
  }

  dir.put(G, root, 0, 0, 0);
  info(G, name, {
    size: `${(halfW * 2).toFixed(2)} × ${out.toFixed(2)} m（面宽×挑出），净高 ${clear.toFixed(2)}m`,
    mat: '铝合金包边结构板 + 铝吊顶 + 钢立柱',
    note: `板厚 ${(thick * 1000).toFixed(0)}mm，檐口带滴水，吊顶内凹 60mm 阴影缝`,
    simple: '内部钢梁、排水管、灯具未建模',
  });
  return G;
}

/* ============================================================
   6. 台阶 + 平台（真几何：踏面 / 踢面 / 防滑条）
============================================================ */
export function steps({
  dir, root, name, width, run = 0.32, rise = 0.16, count = 3,
  platform = 0, landW = null,
}) {
  const G = new THREE.Group();
  const totalOut = run * count + platform;
  const lw = landW ?? width;

  // 平台（最外一级，与入口齐平）
  if (platform > 0.01) {
    const p = slab(lw, rise * count, platform, M.conc, 0, rise * count / 2, platform / 2, G, 0.008);
    p.name = '入口平台';
  }
  // 逐级：从外往内，每级抬高 rise
  for (let i = 0; i < count; i++) {
    const y = rise * (count - i);
    const z = platform + run * i + run / 2;
    const t = slab(width, rise, run, i === count - 1 ? M.conc : M.conc,
      0, y - rise / 2, z, G, 0.008);
    t.name = `踏步-${i + 1}（踏面）`;
    // 踢面（略深，形成真实立面）
    const riser = box(width, rise, 0.04, M.concDark, 0, y - rise / 2, z - run / 2, G);
    riser.name = `踏步-${i + 1}（踢面）`;
    // 防滑条（每级踏面前缘一条凹槽）
    box(width - 0.10, 0.018, 0.05, M.metal, 0, y - 0.012, z + run / 2 - 0.03, G, { cast: false }).name = '防滑条';
  }
  // 侧帮
  [-1, 1].forEach((s) => {
    box(0.06, rise * count, totalOut, M.concDark, s * (width / 2 + 0.03), rise * count / 2, totalOut / 2, G).name = '台阶侧帮';
  });

  dir.put(G, root, 0, 0, 0);
  info(G, name, {
    size: `${width.toFixed(2)}m 宽 × ${count} 级，踏面 ${(run * 1000).toFixed(0)} / 踢面 ${(rise * 1000).toFixed(0)} mm`,
    mat: '清水混凝土，前缘嵌铝防滑条',
    note: platform > 0.01 ? `外设 ${platform.toFixed(2)}m 落地平台` : '直落式',
    simple: '未做排水坡度与防冻胀构造',
  });
  return G;
}

/* ============================================================
   7. 散水 + 排水沟（建筑周边一圈）
   rect: {x0,x1,z0,z1} 建筑外皮
============================================================ */
export function apron({ root, rect, name = '散水排水沟', w = 0.70, ditch = true }) {
  const G = new THREE.Group();
  const { x0, x1, z0, z1 } = rect;
  const seg = [
    [x0 - w, x1 + w, z1, z1 + w, '南'],
    [x0 - w, x1 + w, z0 - w, z0, '北'],
    [x1, x1 + w, z0, z1, '东'],
    [x0 - w, x0, z0, z1, '西'],
  ];
  seg.forEach(([ax, bx, az, bz, nm]) => {
    const ww = bx - ax, dd = bz - az;
    const slabM = slab(ww, 0.10, dd, M.concDark, (ax + bx) / 2, 0.05, (az + bz) / 2, G, 0.010);
    slabM.name = `散水-${nm}`;
    // 卵石面层（薄一层，浅色）
    const gr = box(ww - 0.10, 0.03, dd - 0.10, M.gravel, (ax + bx) / 2, 0.115, (az + bz) / 2, G, { cast: false });
    gr.name = `散水面层-${nm}`;
  });
  if (ditch) {
    // 排水沟：散水外缘一道凹槽（两条边条 + 沟底）
    const dz = z1 + w;
    box(x1 - x0 + 2 * w + 0.14, 0.10, 0.16, M.concDark, (x0 + x1) / 2, 0.05, dz + 0.08, G).name = '排水沟沟底';
    box(x1 - x0 + 2 * w + 0.14, 0.045, 0.05, M.metal, (x0 + x1) / 2, 0.12, dz + 0.015, G, { cast: false }).name = '排水沟边条';
  }
  root.add(G);
  info(G, name, {
    size: `宽 ${w.toFixed(2)}m，沿建筑周边通长`,
    mat: '混凝土垫层 + 卵石面层 + 金属边条排水沟',
    note: '外缘设通长排水沟，沟宽 160mm',
    simple: '沟内坡度、集水井、雨水管接口未建模',
  });
  return G;
}

/* ============================================================
   8. 空调百叶（真叶片，可通风）
============================================================ */
export function louver({ x, y, z, w, h, d = 0.42, ry = 0, root, name, blades = 9 }) {
  const G = new THREE.Group();
  G.position.set(x, y, z);
  G.rotation.y = ry;
  // 边框
  box(w, 0.06, d, M.metal, 0, h / 2, 0, G).name = '百叶上框';
  box(w, 0.06, d, M.metal, 0, -h / 2, 0, G).name = '百叶下框';
  box(0.06, h, d, M.metal, -w / 2 + 0.03, 0, 0, G).name = '百叶左边框';
  box(0.06, h, d, M.metal, w / 2 - 0.03, 0, 0, G).name = '百叶右边框';
  // 叶片（倾斜 32°，间距均匀）
  const list = [];
  const hh = h - 0.12;
  for (let i = 0; i < blades; i++) {
    list.push({
      x: 0, y: -hh / 2 + (hh / blades) * (i + 0.5), z: 0,
      rx: -32 * Math.PI / 180,
    });
  }
  instanced(new THREE.BoxGeometry(w - 0.10, (hh / blades) * 0.92, 0.035), M.metalLite, list, G, '百叶叶片');
  root.add(G);
  info(G, name, {
    size: `${w.toFixed(2)} × ${h.toFixed(2)} m`,
    mat: '铝合金防雨百叶',
    note: `${blades} 片，倾角 32°，有效通风面积约 55%`,
    simple: '防虫网、内侧检修门未建模',
  });
  return G;
}

/* ============================================================
   9. 玻璃栏板（露台）
============================================================ */
export function railing({ pts, root, name, h = 1.10, glassMat = M.glassRail }) {
  const G = new THREE.Group();
  // pts: [[x0,z0],[x1,z1],...] 折线
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    // 绕 Y 旋转 ry 后，局部 +x → 世界 (cos ry, 0, -sin ry)；令其等于 (dx, 0, dz)/len
    const ry = Math.atan2(-dz, dx);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const seg = new THREE.Group();
    seg.position.set(cx, 0, cz);
    seg.rotation.y = ry;
    // 玻璃栏板
    const gl = new THREE.Mesh(new THREE.BoxGeometry(len, h - 0.10, 0.028), glassMat);
    gl.position.set(0, (h - 0.10) / 2 + 0.02, 0);
    gl.name = `栏板玻璃-段${i + 1}`;
    seg.add(gl);
    // 底部卡槽
    box(len, 0.06, 0.09, M.metal, 0, 0.03, 0, seg).name = '栏板底槽';
    // 顶部扶手（圆管）
    const hr = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, len, 10), M.steel);
    hr.rotation.z = Math.PI / 2;
    hr.position.set(0, h, 0);
    hr.castShadow = true;
    hr.name = `扶手-段${i + 1}`;
    seg.add(hr);
    G.add(seg);
    // 立柱（每 1.2m 一根）
    const n = Math.max(1, Math.round(len / 1.2));
    const list = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      list.push({ x: x0 + dx * t, y: h / 2, z: z0 + dz * t });
    }
    instanced(new THREE.BoxGeometry(0.05, h, 0.05), M.steel, list, G, '栏板立柱');
  }
  root.add(G);
  info(G, name, {
    size: `高 ${h.toFixed(2)}m，${pts.length - 1} 段`,
    mat: '夹胶玻璃栏板 + 不锈钢圆管扶手 + 钢立柱',
    note: '扶手 φ52 圆管，立柱间距 ≤1.2m，满足防护高度',
    simple: '玻璃爪件、密封胶未建模',
  });
  return G;
}

/* ============================================================
   10. 门牌 / 标识（唯一使用贴图的地方之一）
============================================================ */
export function signage({ dir, root, u, y, name, w = 0.70, h = 0.35, tex, out = 0.02 }) {
  const G = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.28, metalness: 0.55, color: 0xffffff,
  });
  const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), [
    M.steel, M.steel, M.steel, M.steel, mat, M.steel,
  ]);
  p.castShadow = true;
  p.name = name;
  G.add(p);
  dir.put(G, root, u, y, out);
  info(G, name, {
    size: `${w.toFixed(2)} × ${h.toFixed(2)} m`,
    mat: '拉丝不锈钢底 + 阴刻填漆字',
    note: '门牌（贴图）',
    simple: '字体为程序化绘制，非实际字体文件',
  });
  return G;
}

/* ============================================================
   11. 竖向木格栅（带上下封边 / 边立柱 / 背部横梁）
============================================================ */
export function screen({ uSpan, ySpan, bar = 0.10, pitch = 0.25, depth = 0.26, out = 0.16, root, name }) {
  const G = new THREE.Group();
  const w = uSpan[1] - uSpan[0], h = ySpan[1] - ySpan[0];
  const cx = (uSpan[0] + uSpan[1]) / 2, cy = (ySpan[0] + ySpan[1]) / 2;

  // 竖条（批量实例）
  const list = [];
  for (let u = uSpan[0]; u <= uSpan[1] + 1e-6; u += pitch) list.push({ x: u, y: cy, z: out });
  instanced(new THREE.BoxGeometry(bar, h, depth), M.wood, list, G, '木格栅竖条');

  // 背部横梁（让格栅是结构，不是贴片）
  [-h / 2 + 0.25, 0, h / 2 - 0.25].forEach((dy, i) => {
    box(w + 0.10, 0.07, 0.08, M.woodDark, cx, cy + dy, out - 0.12, G).name = `格栅背横梁-${i + 1}`;
  });
  // 上下封边（金属）
  slab(w + 0.20, 0.10, depth + 0.06, M.metal, cx, ySpan[1] + 0.05, out, G, 0.012).name = '格栅上封边';
  slab(w + 0.20, 0.10, depth + 0.06, M.metal, cx, ySpan[0] - 0.05, out, G, 0.012).name = '格栅下封边';
  // 两侧立柱
  [-1, 1].forEach((s) => {
    box(0.11, h + 0.20, depth + 0.06, M.metal, cx + s * (w / 2 + 0.055), cy, out, G).name = '格栅边立柱';
  });
  root.add(G);
  const n = list.length;
  info(G, name, {
    size: `${w.toFixed(2)} × ${h.toFixed(2)} m`,
    mat: '硬木竖向格栅（断面 100×260）+ 铝合金封边',
    note: `${n} 根竖条，中心距 ${(pitch * 1000).toFixed(0)}mm，背后 3 道横梁`,
    simple: '金属连接件与防腐处理未建模',
  });
  return G;
}

/* ============================================================
   12. 屋面天窗（采光带）
============================================================ */
export function skylight({ x, z, w, d, y, root, name, curb = 0.28 }) {
  const G = new THREE.Group();
  G.position.set(x, 0, z);
  // 基座（混凝土翻边）
  const cb = box(w + 0.24, curb, d + 0.24, M.conc, 0, y + curb / 2, 0, G, { bevel: 0.012 });
  cb.name = '天窗基座';
  // 金属框
  box(w + 0.10, 0.08, d + 0.10, M.metal, 0, y + curb + 0.04, 0, G).name = '天窗框';
  // 玻璃（略斜，利于排水）
  const gl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), M.glass);
  gl.position.set(0, y + curb + 0.10, 0);
  gl.rotation.x = -5 * Math.PI / 180;
  gl.name = '天窗玻璃';
  G.add(gl);
  root.add(G);
  info(G, name, {
    size: `${w.toFixed(2)} × ${d.toFixed(2)} m`,
    mat: '混凝土翻边 + 铝合金框 + 夹胶玻璃',
    note: `基座高出屋面 ${(curb * 1000).toFixed(0)}mm，玻璃 5° 找坡`,
    simple: '开启机构、遮阳帘未建模',
  });
  return G;
}

/* ============================================================
   13. 雨水立管（简化，带管卡）
============================================================ */
export function downpipe({ x, z, y0, y1, root, name, r = 0.055 }) {
  const G = new THREE.Group();
  const h = y1 - y0;
  const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), M.metalLite);
  p.position.set(x, (y0 + y1) / 2, z);
  p.castShadow = true;
  p.name = name;
  G.add(p);
  // 管卡（每 2m 一个）
  const n = Math.max(2, Math.floor(h / 2));
  const list = [];
  for (let i = 1; i <= n; i++) list.push({ x: x + 0.03, y: y0 + (h / (n + 1)) * i, z });
  instanced(new THREE.BoxGeometry(0.05, 0.06, 0.05), M.metal, list, G, '立管管卡');
  root.add(G);
  info(G, name, {
    size: `φ${(r * 2000).toFixed(0)}mm，长 ${h.toFixed(2)}m`,
    mat: '铝合金雨水管',
    note: `${n} 道管卡固定`,
    simple: '简化：圆管到底，无弯头、无检查口、无落水斗',
  });
  return G;
}

/* ============================================================
   14. 简化设备盒（空调外机 / 热泵机组）
============================================================ */
export function mechBox({ x, y, z, w, h, d, root, name, kind = '空调室外机' }) {
  const G = new THREE.Group();
  const b = box(w, h, d, M.metalLite, x, y + h / 2, z, G, { bevel: 0.012 });
  b.name = name;
  // 顶面出风口（一圈凹槽）
  box(w - 0.12, 0.02, d - 0.12, M.dark, x, y + h + 0.005, z, G, { cast: false }).name = '出风口';
  // 前面散热格栅（3 条横线）
  [-0.25, 0, 0.25].forEach((t, i) => {
    box(w - 0.14, 0.02, 0.02, M.metal, x, y + h / 2 + t * h, z + d / 2 + 0.01, G, { cast: false }).name = `散热片-${i + 1}`;
  });
  // 混凝土基础
  box(w + 0.16, 0.12, d + 0.16, M.conc, x, y + 0.06, z, G).name = '设备基础';
  root.add(G);
  info(G, name, {
    size: `${w.toFixed(2)} × ${h.toFixed(2)} × ${d.toFixed(2)} m`,
    mat: '镀锌钢板外壳 + 混凝土基础',
    note: kind,
    simple: '简化：方盒，无百叶细节、无冷媒管与电气配管',
  });
  return G;
}
