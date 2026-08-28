import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const project = new URL('../../', import.meta.url);

function text(path) {
  return fs.readFileSync(new URL(path, project), 'utf8');
}

function pngDimensions(path) {
  const bytes = fs.readFileSync(new URL(path, project));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('web app manifest is installable from a GitHub Pages subpath', () => {
  const manifest = JSON.parse(text('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'landscape');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '1024x1024' && icon.purpose === 'maskable'));
});

test('PWA icons have their declared raster dimensions', () => {
  assert.deepEqual(pngDimensions('assets/icons/icon-192.png'), { width: 192, height: 192 });
  assert.deepEqual(pngDimensions('assets/icons/icon-512.png'), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions('assets/icons/maskable-icon-512.png'), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions('assets/icons/maskable-icon-1024.png'), { width: 1024, height: 1024 });
  assert.deepEqual(pngDimensions('assets/icons/apple-touch-icon.png'), { width: 180, height: 180 });
});

test('page metadata and service worker cover install, activation, navigation and offline shell', () => {
  const html = text('index.html');
  const worker = text('sw.js');
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(worker, /addEventListener\('install'/);
  assert.match(worker, /addEventListener\('activate'/);
  assert.match(worker, /addEventListener\('fetch'/);
  assert.match(worker, /networkFirstNavigation/);
  assert.match(worker, /PWA_PRECACHE_START/);
  const registration = text('src/pwa/register-service-worker.js');
  assert.match(registration, /dataset\.pwaStatus = 'ready'/);
  assert.match(registration, /addEventListener\('controllerchange'/);
  assert.match(registration, /location\.reload\(\)/);
});

test('release version cache-busts the page shell and service worker together', () => {
  const version = JSON.parse(text('package.json')).version;
  const html = text('index.html');
  const worker = text('sw.js');
  assert.match(html, new RegExp(`styles\\.css\\?v=${version.replaceAll('.', '\\.')}`));
  assert.match(html, new RegExp(`src/app\\.js\\?v=${version.replaceAll('.', '\\.')}`));
  assert.match(worker, new RegExp(`CACHE_VERSION = '${version.replaceAll('.', '\\.')}';`));
});

test('growing booster art is copied but excluded from install-time precache', () => {
  const buildScript = text('scripts/build-pages.mjs');
  assert.match(buildScript, /assets\/images\/booster\//);
  assert.match(buildScript, /assets\/images\/showcase\//);
  assert.match(buildScript, /assets\/images\/showcase-fusions\//);
  assert.match(buildScript, /startsWith/);
  assert.match(buildScript, /special-fusion-atlas-v1\.webp/);
  assert.match(buildScript, /blue-drill-v2\.webp/);
});
