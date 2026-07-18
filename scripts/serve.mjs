import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('site');
const port = Number(process.env.PORT ?? 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  let file = join(root, relative || 'index.html');
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('404');
    return;
  }
  response.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': extname(file) === '.json' ? 'no-cache' : 'public, max-age=300'
  });
  createReadStream(file).pipe(response);
}).listen(port, () => console.log(`http://localhost:${port}`));
