/* ============================================================
   core.js · 核心库
   ------------------------------------------------------------
   · PBR 材质集（纯色部分一律不贴图）
   · 程序化天空环境贴图（给 PBR 提供真实反射）
   · 光伏 / 标识 / 门牌 贴图（仅这三类用贴图）
   · 几何工具：带倒角板件、放置器、墙板挖洞、批量实例
   ============================================================ */
import * as THREE from 'three';

/* ---------------- PBR 材质 ---------------- */
function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.r ?? 0.62,
    metalness: o.m ?? 0.0,
    ...(o.extra || {}),
  });
}

export const M = {
  stone: std(0xe9e4d9, { r: 0.60 }),        // 米白洞石
  stoneWarm: std(0xdcd5c6, { r: 0.64 }),    // 石材暖调（缝后底板）
  joint: std(0x9a9384, { r: 0.85 }),        // 板缝阴影底
  coat: std(0xf5f3ee, { r: 0.80 }),         // 米白涂料
  coatShade: std(0xdfdbd1, { r: 0.82 }),    // 涂料阴影面

  metal: std(0x373c44, { r: 0.34, m: 0.72 }),      // 深灰铝板（框/压顶/包边）
  metalLite: std(0xa4abb5, { r: 0.32, m: 0.62 }),  // 浅灰铝（雨棚底/格栅封边）
  steel: std(0x6e757f, { r: 0.40, m: 0.55 }),      // 不锈钢（栏杆/立柱）

  wood: std(0x8d6c46, { r: 0.68 }),         // 木饰面（格栅）
  woodDark: std(0x6d5236, { r: 0.70 }),     // 木深色（格栅侧面）

  glass: new THREE.MeshStandardMaterial({   // 外门窗玻璃：深色镜面，强反射天空
    color: 0x2c3d50, roughness: 0.05, metalness: 0.28,
    transparent: true, opacity: 0.74, envMapIntensity: 3.0,
  }),
  glassRail: new THREE.MeshStandardMaterial({ // 栏板玻璃
    color: 0xbcd6e4, roughness: 0.04, metalness: 0.0,
    transparent: true, opacity: 0.20, envMapIntensity: 2.0,
  }),

  dark: std(0x353b44, { r: 0.60 }),         // 内胆（洞口里看到的室内，不用纯黑）
  conc: std(0xc3bfb7, { r: 0.88 }),         // 混凝土（地坪/台阶/女儿墙内侧）
  concDark: std(0xa8a49c, { r: 0.90 }),     // 台阶踢面 / 散水
  gravel: std(0x8e8a81, { r: 0.94 }),       // 散水卵石
};

/* ---------------- 程序化天空（PBR 环境光） ----------------
   等距柱状投影：上半天空 / 下半地面 / 一处太阳亮斑。
   直接作为 scene.environment，three 会自动做 PMREM 卷积。
--------------------------------------------------------- */
export function makeSky() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');

  // 天空：晴朗上午，天顶蓝 → 地平线冷白（保证建筑显得干净、较新）
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0.00, '#3f7cbc');
  sky.addColorStop(0.42, '#87b3dd');
  sky.addColorStop(0.78, '#c6dcec');
  sky.addColorStop(1.00, '#eef4f8');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 256);

  // 太阳亮斑（东南偏上，给建筑一个明确的主光方向）
  const sun = g.createRadialGradient(700, 150, 4, 700, 150, 130);
  sun.addColorStop(0.00, 'rgba(255,252,240,1)');
  sun.addColorStop(0.12, 'rgba(255,246,222,0.92)');
  sun.addColorStop(0.40, 'rgba(240,230,205,0.28)');
  sun.addColorStop(1.00, 'rgba(230,225,210,0)');
  g.fillStyle = sun;
  g.fillRect(560, 10, 290, 290);

  // 地面：草坪灰绿，比天空暗一档
  const gr = g.createLinearGradient(0, 256, 0, 512);
  gr.addColorStop(0.00, '#a9ae9b');
  gr.addColorStop(0.35, '#8b907d');
  gr.addColorStop(1.00, '#6b6f61');
  g.fillStyle = gr;
  g.fillRect(0, 256, 1024, 256);

  // 地平线雾带
  const hz = g.createLinearGradient(0, 236, 0, 276);
  hz.addColorStop(0, 'rgba(232,240,246,0)');
  hz.addColorStop(0.5, 'rgba(232,240,246,0.55)');
  hz.addColorStop(1, 'rgba(232,240,246,0)');
  g.fillStyle = hz;
  g.fillRect(0, 236, 1024, 40);

  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- 光伏贴图（单晶硅 + 细栅线 + 边框） ---------------- */
export function pvTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0e1628';
  g.fillRect(0, 0, 256, 256);
  const n = 6, cell = 256 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? '#19233e' : '#141d34';
      g.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
      g.strokeStyle = 'rgba(158,182,226,0.20)';
      g.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        const y = j * cell + 2 + (cell - 4) * k / 4;
        g.beginPath(); g.moveTo(i * cell + 2, y); g.lineTo(i * cell + 2 + cell - 4, y); g.stroke();
      }
      // 主栅（汇流带）
      g.strokeStyle = 'rgba(190,205,235,0.30)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(i * cell + 2, j * cell + cell / 2); g.lineTo(i * cell + 2 + cell - 4, j * cell + cell / 2); g.stroke();
    }
  }
  g.strokeStyle = '#9aa1ab'; g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 246);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- 门牌 / 标识贴图 ---------------- */
export function signTexture(lines = ['VILLA', 'No. 168']) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  // 拉丝不锈钢底
  const bg = g.createLinearGradient(0, 0, 512, 256);
  bg.addColorStop(0, '#8f96a0'); bg.addColorStop(0.5, '#c3c9d1'); bg.addColorStop(1, '#7d848d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.lineWidth = Math.random() * 1.6;
    const y = Math.random() * 256;
    g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
  }
  // 内凹刻字区
  g.fillStyle = 'rgba(30,34,40,0.90)';
  g.fillRect(28, 28, 456, 200);
  g.fillStyle = '#f2f5f8';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 84px "Helvetica Neue", Arial, sans-serif';
  g.fillText(lines[0], 256, 100);
  g.font = '44px "Helvetica Neue", Arial, sans-serif';
  g.fillStyle = '#c8d0da';
  g.fillText(lines[1] || '', 256, 178);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- 基础几何 ---------------- */
export function box(w, h, d, mat, x, y, z, parent, opts = {}) {
  const g = opts.bevel
    ? chamferBoxGeometry(w, h, d, opts.bevel)
    : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.recv !== false;
  if (opts.name) m.name = opts.name;
  (parent || null) && parent.add(m);
  return m;
}

/** 带四周倒角的板：Shape(矩形) + Extrude(带 bevel)，用于压顶/窗台/雨棚板 */
export function chamferBoxGeometry(w, h, d, r = 0.02) {
  const s = new THREE.Shape();
  const hw = w / 2 - r, hh = h / 2 - r;
  s.moveTo(-hw - r, -hh);
  s.lineTo(-hw - r, hh);
  s.quadraticCurveTo(-hw - r, hh + r, -hw, hh + r);
  s.lineTo(hw, hh + r);
  s.quadraticCurveTo(hw + r, hh + r, hw + r, hh);
  s.lineTo(hw + r, -hh);
  s.quadraticCurveTo(hw + r, -hh - r, hw, -hh - r);
  s.lineTo(-hw, -hh - r);
  s.quadraticCurveTo(-hw - r, -hh - r, -hw - r, -hh);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, d - r * 2),
    bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 2,
  });
  g.translate(0, 0, -d / 2 + r);
  g.computeVertexNormals();
  return g;
}

/** 带倒角的板件（默认沿 z 为厚度方向） */
export function slab(w, h, d, mat, x, y, z, parent, r = 0.02, opts = {}) {
  return box(w, h, d, mat, x, y, z, parent, { ...opts, bevel: r });
}

/** 批量实例：同几何同材质的重复构件（格栅条 / 百叶 / 光伏 / 栏杆柱）
 *  list 项：{ x, y, z, rx?, ry?, rz?, sx?, sy?, sz? } */
export function instanced(geo, mat, list, parent, name) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  list.forEach((t, i) => {
    e.set(t.rx || 0, t.ry || 0, t.rz || 0);
    q.setFromEuler(e);
    v.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    m4.compose(new THREE.Vector3(t.x, t.y, t.z), q, v);
    im.setMatrixAt(i, m4);
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = true; im.receiveShadow = true;
  im.name = name || '批量构件';
  parent.add(im);
  return im;
}

/* ---------------- 四个朝向的放置器 ----------------
   局部坐标：x=沿墙 u，y=高度，z=0 为墙面外皮，+z 指向室外。
   墙体本身占据局部 z ∈ [-thick, 0]。
------------------------------------------------- */
export function makeDir(side, baseCoord) {
  const conf = {
    south: { rotY: 0,          at: 1  },  // 外皮 z = base，+z 朝南
    north: { rotY: Math.PI,    at: -1 },  // 外皮 z = base，+z 朝北（世界 -z）
    east:  { rotY: Math.PI / 2, at: 1  },  // 外皮 x = base，+z 朝东（世界 +x）
    west:  { rotY: -Math.PI / 2, at: -1 }, // 外皮 x = base，+z 朝西（世界 -x）
  }[side];

  const axial = (side === 'south' || side === 'north') ? 'z' : 'x';

  return {
    side,
    rotY: conf.rotY,
    base: baseCoord,
    /** 把 obj 放到该立面上：u 沿墙、y 高度、out 为向室外偏移（可负=向内） */
    put(obj, parent, u, y, out = 0) {
      obj.rotation.y = conf.rotY;
      if (axial === 'z') obj.position.set(u, y, baseCoord + conf.at * out);
      else obj.position.set(baseCoord + conf.at * out, y, u);
      parent.add(obj);
      return obj;
    },
    /** 世界坐标换算（用于标注投影） */
    toWorld(u, y, out = 0) {
      if (side === 'south') return new THREE.Vector3(u, y, baseCoord + out);
      if (side === 'north') return new THREE.Vector3(-u, y, baseCoord - out);
      if (side === 'east') return new THREE.Vector3(baseCoord + out, y, -u);
      return new THREE.Vector3(baseCoord - out, y, u);
    },
  };
}

/* ---------------- 墙板：Shape 挖洞 + 倒角 ---------------- */
export function wallPanel({
  uSpan, ySpan, holes = [], mat, thick, dir, root, name, joint = 0.012,
}) {
  const [u0, u1] = uSpan, [v0, v1] = ySpan;
  const s = new THREE.Shape();
  s.moveTo(u0, v0); s.lineTo(u1, v0); s.lineTo(u1, v1); s.lineTo(u0, v1); s.closePath();
  for (const h of holes) {
    const [a, b] = h.u, [c, d] = h.y;
    const ha = Math.max(a, u0), hb = Math.min(b, u1);
    const hc = Math.max(c, v0), hd = Math.min(d, v1);
    if (hb - ha < 0.02 || hd - hc < 0.02) continue;
    const p = new THREE.Path();
    p.moveTo(ha, hc); p.lineTo(hb, hc); p.lineTo(hb, hd); p.lineTo(ha, hd); p.closePath();
    s.holes.push(p);
  }
  // 挤出总长 = depth + 2*bevelThickness = thick；平移后外皮落在局部 z=0
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thick - 2 * joint,
    bevelEnabled: true, bevelThickness: joint, bevelSize: joint,
    bevelSegments: 1, curveSegments: 1,
  });
  g.translate(0, 0, -(thick - joint));
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.rotation.y = dir.rotY;
  if (dir.side === 'south' || dir.side === 'north') mesh.position.set(0, 0, dir.base);
  else mesh.position.set(dir.base, 0, 0);
  root.add(mesh);
  return mesh;
}

/** 带真实板缝的立面：先铺一层深色底板，再按开间分块留缝 */
export function facade({
  uSpan, ySpan, holes, mat, thick, dir, root, name,
  splits, gap = 0.030, jointMat = M.joint, joint = 0.006,
}) {
  const G = new THREE.Group();
  G.name = name;
  // 深色底板（缝里看到的就是它）——向内退 8mm，避免与面板共面
  const back = wallPanel({
    uSpan, ySpan, holes, mat: jointMat, thick, dir, root: G,
    name: `${name}-缝底`, joint: 0.002,
  });
  const off = 0.008;
  if (dir.side === 'south') back.position.z -= off;
  else if (dir.side === 'north') back.position.z += off;
  else if (dir.side === 'east') back.position.x -= off;
  else back.position.x += off;
  // 分块面板
  const segs = [];
  for (let i = 0; i < splits.length - 1; i++) {
    segs.push([splits[i] + gap / 2, splits[i + 1] - gap / 2]);
  }
  segs.forEach(([a, b], i) => {
    wallPanel({
      uSpan: [a, b], ySpan, holes, mat, thick, dir, root: G,
      name: `${name}-板${i + 1}`, joint,
    });
  });
  root.add(G);
  return G;
}

/* ---------------- 灯光：静态 PBR ---------------- */
export function setupLights(scene, opts = {}) {
  const sunAz = opts.sunAz ?? 135 * Math.PI / 180;  // 东南
  const sunEl = opts.sunEl ?? 42 * Math.PI / 180;
  const dist = 46;
  const sun = new THREE.DirectionalLight(0xfff4e2, opts.sunI ?? 2.6);
  sun.position.set(
    Math.cos(sunEl) * Math.sin(sunAz) * dist,
    Math.sin(sunEl) * dist,
    Math.cos(sunEl) * Math.cos(sunAz) * dist,
  );
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.shadowMap ?? 2048, opts.shadowMap ?? 2048);
  const s = opts.shadowSpan ?? 26;
  const cam = sun.shadow.camera;
  cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s;
  cam.near = 1; cam.far = 120;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 3, 0);
  scene.add(sun); scene.add(sun.target);

  // 天空补光（冷）+ 地面反弹（暖）
  const hemi = new THREE.HemisphereLight(0xbcd8f0, 0x6c6a5e, opts.hemiI ?? 0.55);
  scene.add(hemi);

  // 环境反射
  const sky = makeSky();
  scene.environment = sky;
  scene.environmentIntensity = opts.envI ?? 0.85;
  if (opts.background !== false) scene.background = sky;

  return { sun, hemi, env: sky };
}
