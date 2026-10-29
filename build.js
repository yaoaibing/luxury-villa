/* ============================================================
   build.js · 把 index.html + src/* + vendor/three 打包成一个
   零外部依赖的单文件 villa.html（可直接双击 / 可直接托管）
   ------------------------------------------------------------
   做法：three 包进独立 IIFE 并 return 出 THREE 命名空间；
   core / detail / model / 页面脚本去掉 import 与 export，
   统一放进同一作用域，互相直接可见。
   ============================================================ */
const fs = require('fs');
const path = require('path');

const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const W = (p, s) => fs.writeFileSync(path.join(__dirname, p), s, 'utf8');

/* ---- 1. three：export {...} → return {...}，并隔离在 IIFE 内 ---- */
let three = R('vendor/three.module.js');
const i = three.lastIndexOf('\nexport {');
if (i < 0) throw new Error('找不到 three 的 export 语句');
const threeBody = three.slice(0, i);
const listRaw = three.slice(i).replace(/^\s*export\s*\{/, '').replace(/\};?\s*$/, '');
const entries = listRaw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const m = s.split(/\s+as\s+/);
  return m.length === 2 ? `${m[1].trim()}: ${m[0].trim()}` : `${s}: ${s}`;
});
const threePart =
  'const THREE = (function () {\n' + threeBody + '\nreturn { ' + entries.join(', ') + ' };\n})();\n';

/* ---- 2. 业务模块：去掉 import / export ---- */
const strip = (src) => src
  .replace(/^[ \t]*import\s+[^;]*?;[ \t]*$/gm, '')
  .replace(/^export\s+/gm, '');

const srcPart = ['src/core.js', 'src/detail.js', 'src/model.js']
  .map((f) => `/* ===== ${f} ===== */\n` + strip(R(f))).join('\n\n');

/* ---- 3. 页面内联脚本（模板为源码版 dev.html） ---- */
const html = R('dev.html');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) throw new Error('dev.html 里找不到 module script');
const mainPart = strip(m[1]);

/* ---- 4. 组装 ---- */
const bundle = [
  '/* ===== vendor/three.module.js (r' + (three.match(/REVISION\s*=\s*'([^']+)'/) || [, '?'])[1] + ') ===== */',
  threePart,
  srcPart,
  '/* ===== dev.html 内联脚本 ===== */',
  mainPart,
].join('\n');

const out = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace(m[0], () => '<script type="module">\n(function () {\n' + bundle + '\n})();\n</script>');

W('index.html', out);   // 单文件成品 = Pages 入口（零外部依赖）

const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(0) + ' KB';
console.log('已生成 index.html（单文件成品）  ' + kb(out));
console.log('  外部引用检查: src="./ -> ' + (out.match(/src="\.\//g) || []).length
  + ' 条, importmap -> ' + (out.match(/importmap/g) || []).length + ' 条');
