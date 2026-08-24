import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const root = path.resolve(projectRoot, option('root', '.'));
if (root !== projectRoot && !root.startsWith(`${projectRoot}${path.sep}`)) throw new Error('Serve root must stay inside the project');
const port = Number(option('port', process.env.MC_DEV_PORT ?? 4173));
const rawBase = option('base', '/');
const basePath = `/${String(rawBase).replace(/^\/+|\/+$/g, '')}${rawBase === '/' ? '' : '/'}`;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (basePath !== '/' && pathname === basePath.slice(0, -1)) {
    response.writeHead(302, { location: basePath });
    response.end();
    return;
  }
  if (!pathname.startsWith(basePath)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const relativePath = pathname.slice(basePath.length);
  const requested = relativePath === '' ? 'index.html' : relativePath.replace(/^\/+/, '');
  const filePath = path.resolve(root, requested);
  const insideRoot = filePath === root || filePath.startsWith(`${root}${path.sep}`);
  if (!insideRoot || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Monster Construction: http://127.0.0.1:${port}${basePath}`);
});
