// Construit dist/LiftPlanner.html : application complète en UN fichier, utilisable hors-ligne
// (double-clic, file://), pdf.js inclus. Aucune dépendance : node tools/build-standalone.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'js/ui/main.js');

const modules = new Map(); // abs path -> { code, deps }
const order = [];

function parse(file, stack = []) {
  if (modules.has(file)) return;
  if (stack.includes(file)) throw new Error(`Import circulaire : ${[...stack, file].map((f) => relative(ROOT, f)).join(' → ')}`);
  let src = readFileSync(file, 'utf8');
  const deps = [];
  const header = [];
  const id = (p) => JSON.stringify(relative(ROOT, p));
  src = src.replace(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/gs, (_, names, spec) => {
    const dep = resolve(dirname(file), spec);
    deps.push(dep);
    const binds = names
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/\s+as\s+/, ': '));
    header.push(`const { ${binds.join(', ')} } = __m[${id(dep)}];`);
    return '';
  });
  src = src.replace(/import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"];?/g, (_, ns, spec) => {
    const dep = resolve(dirname(file), spec);
    deps.push(dep);
    header.push(`const ${ns} = __m[${id(dep)}];`);
    return '';
  });
  if (/^\s*import\s/m.test(src)) throw new Error(`Import non géré dans ${relative(ROOT, file)}`);
  const exported = [];
  src = src.replace(/^export\s+(async\s+function|function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, name) => {
    exported.push(name);
    return `${kw} ${name}`;
  });
  src = src.replace(/^export\s*\{([^}]*)\};?/gm, (_, names) => {
    names.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => exported.push(n));
    return '';
  });
  if (/^export\s/m.test(src)) throw new Error(`Export non géré dans ${relative(ROOT, file)}`);
  stack.push(file);
  deps.forEach((d) => parse(d, stack));
  stack.pop();
  modules.set(file, { header, src, exported });
  order.push(file);
}

parse(ENTRY);

const bundle = order
  .map((f) => {
    const m = modules.get(f);
    const name = JSON.stringify(relative(ROOT, f));
    return `// ---- ${relative(ROOT, f)}\n__m[${name}] = (() => {\n${m.header.join('\n')}\n${m.src}\nreturn { ${[...new Set(m.exported)].join(', ')} };\n})();`;
  })
  .join('\n\n');

const css = readFileSync(join(ROOT, 'css/app.css'), 'utf8');
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');
const pdfjs = b64('vendor/pdfjs/pdf.min.mjs');
const worker = b64('vendor/pdfjs/pdf.worker.min.mjs');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const boot = `
<script>
(function(){
  function blobUrl(b64){ var s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return URL.createObjectURL(new Blob([u], { type: 'text/javascript' })); }
  window.__PDFJS_URL = blobUrl(document.getElementById('pdfjs-b64').textContent.trim());
  window.__PDFJS_WORKER_URL = blobUrl(document.getElementById('pdfjs-worker-b64').textContent.trim());
})();
</script>`;

html = html
  .replace(/<link rel="stylesheet" href="css\/app.css" \/>/, `<style>\n${css}\n</style>`)
  .replace(
    /<script type="module" src="js\/ui\/main.js"><\/script>/,
    `<script type="text/plain" id="pdfjs-b64">${pdfjs}</script>\n<script type="text/plain" id="pdfjs-worker-b64">${worker}</script>\n${boot}\n<script type="module">\n// LiftPlanner v${pkg.version} — version autonome générée par tools/build-standalone.mjs\nconst __m = {};\n${bundle.replace(/<\/script/gi, '<\\/script')}\n</script>`,
  );

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/LiftPlanner.html'), html);
console.log(`dist/LiftPlanner.html — ${(html.length / 1024).toFixed(0)} Ko, ${order.length} modules`);
