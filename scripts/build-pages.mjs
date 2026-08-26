import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outputRoot = path.join(projectRoot, 'dist');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const publicEntries = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'assets', 'src', '.nojekyll'];

function copyEntry(source, destination) {
  const stats = fs.statSync(source);
  if (stats.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const child of fs.readdirSync(source)) copyEntry(path.join(source, child), path.join(destination, child));
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

if (outputRoot === projectRoot || !outputRoot.startsWith(`${projectRoot}${path.sep}`)) {
  throw new Error('Refusing to build outside the project dist directory');
}
fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

for (const entry of publicEntries) {
  const source = path.join(projectRoot, entry);
  if (!fs.existsSync(source)) throw new Error(`Missing public entry: ${entry}`);
  copyEntry(source, path.join(outputRoot, entry));
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  });
}

// GitHub Pages can cache a transitive ES module independently from app.js.
// Version every relative module edge in the deploy artifact while leaving the
// Node-testable source tree untouched.
for (const file of filesUnder(path.join(outputRoot, 'src')).filter((entry) => entry.endsWith('.js'))) {
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace(
    /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+\.js)\2/g,
    (match, prefix, quote, specifier) => `${prefix}${quote}${specifier}?v=${version}${quote}`,
  );
  source = source.replace(
    /new URL\((['"])(\.\/master-data\.json)\1,\s*import\.meta\.url\)/g,
    `new URL('./master-data.json?v=${version}', import.meta.url)`,
  );
  fs.writeFileSync(file, source);
}

const indexPath = path.join(outputRoot, 'index.html');
const index = fs.readFileSync(indexPath, 'utf8').replace(/\?v=[\w.-]+/g, `?v=${version}`);
fs.writeFileSync(indexPath, index);

let outputFiles = filesUnder(outputRoot);
const cacheUrls = ['./', ...outputFiles
  .filter((file) => {
    const relative = path.relative(outputRoot, file).replaceAll('\\', '/');
    if (['sw.js', '.nojekyll'].includes(relative)) return false;
    // Booster/showcase art is relatively large and keeps growing. The service
    // worker still caches it on first use, but a fresh PWA install does not
    // download every future card illustration up front.
    return !relative.startsWith('assets/images/booster/')
      && !relative.startsWith('assets/images/showcase/')
      // Runtime uses the corrected standalone fusion cells. Keep the two
      // source atlases deployable for traceability without preloading them.
      && !['assets/images/special-fusion-atlas-v1.webp', 'assets/images/blue-drill-v2.webp'].includes(relative);
  })
  .map((file) => `./${path.relative(outputRoot, file).replaceAll('\\', '/')}`)]
  .filter((url, index, list) => list.indexOf(url) === index);
const workerPath = path.join(outputRoot, 'sw.js');
let worker = fs.readFileSync(workerPath, 'utf8')
  .replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${version}';`)
  .replace(
    /\/\* PWA_PRECACHE_START \*\/[\s\S]*?\/\* PWA_PRECACHE_END \*\//,
    `/* PWA_PRECACHE_START */\n${cacheUrls.map((url) => `  ${JSON.stringify(url)}`).join(',\n')}\n  /* PWA_PRECACHE_END */`,
  );
fs.writeFileSync(workerPath, worker);

outputFiles = filesUnder(outputRoot);
const bytes = outputFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`Built GitHub Pages artifact: dist (${outputFiles.length} files, ${bytes} bytes, v${version})`);
