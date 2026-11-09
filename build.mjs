// Сборка index.html: three.js (IIFE) + src/*.js -> один самодостаточный файл
// Запуск: node build.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const dir = path.dirname(fileURLToPath(import.meta.url));
const three = fs.readFileSync(path.join(dir, 'vendor', 'three.module.min.js'), 'utf8');
const ei = three.lastIndexOf('export{');
const exp = three.slice(ei + 7, three.indexOf('}', ei));
const body = three.slice(0, ei);
const pairs = exp.split(',').map(s => {
  const m = s.trim().split(/\s+as\s+/);
  return m.length === 2 ? `${m[1]}:${m[0]}` : `${m[0]}:${m[0]}`;
});
const threeIIFE = `const THREE=(function(){${body}\nreturn {${pairs.join(',')}};})();`;

const srcDir = path.join(dir, 'src');
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();
const app = files.map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join(srcDir, f), 'utf8')).join('\n');
if (/<\/script/i.test(app)) throw new Error('app contains </script');

// синтаксическая проверка (во временной папке)
const tmp = path.join(os.tmpdir(), 'burevestnik_check.js');
fs.writeFileSync(tmp, `(async function(){'use strict';\n${app}\n})`);
try { execSync(`node --check "${tmp}"`, { stdio: 'pipe' }); }
catch (e) { console.error(String(e.stderr || e)); process.exit(1); }
finally { fs.rmSync(tmp, { force: true }); }

const tpl = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');
const out = tpl.replace('/*__THREE__*/', () => threeIIFE).replace('/*__APP__*/', () => app);
const outPath = path.join(dir, 'index.html');
fs.writeFileSync(outPath, out);
console.log('ok', files.length, 'files,', (out.length / 1024).toFixed(0), 'KB ->', outPath);
