const http = require('http');
const { readFileSync, existsSync, statSync } = require('fs');
const { join, extname, normalize } = require('path');

const dashboard = require('./api/dashboard');
const presenceUpdate = require('./api/presence/update');
const tasks = require('./api/tasks/index');
const games = require('./api/games');
const roleAction = require('./api/roles/act');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const ROOT_DIR = process.cwd();
const PUBLIC_DIR = join(ROOT_DIR, 'public');

function wrapRes(res) {
  return {
    status(code) {
      res.statusCode = code;
      return this;
    },
    setHeader: (...args) => res.setHeader(...args),
    json(obj) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(obj));
    },
    send(text) {
      res.end(text);
    }
  };
}

function resolveStaticPath(urlPath) {
  const safePath = normalize(urlPath).replace(/^([.][.][/\\])+/, '');
  const candidates = [
    join(ROOT_DIR, safePath),
    join(PUBLIC_DIR, safePath)
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const stat = statSync(candidate);
    if (stat.isFile()) return candidate;
  }

  return null;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.socket.destroy();
      }
    });

    req.on('end', () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch {
        req.body = {};
      }

      const r = wrapRes(res);

      if (url === '/api/dashboard') return dashboard(req, r);
      if (url === '/api/presence/update') return presenceUpdate(req, r);
      if (url === '/api/tasks') return tasks(req, r);
      if (url === '/api/games') return games(req, r);
      if (url === '/api/roles/act') return roleAction(req, r);

      return r.status(404).json({ error: 'not found' });
    });

    return;
  }

  const normalizedUrl =
    url === '/'
      ? '/index.html'
      : url === '/dashboard'
      ? '/dashboard.html'
      : url;

  const filePath = resolveStaticPath(normalizedUrl.startsWith('/') ? normalizedUrl.slice(1) : normalizedUrl);
  if (!filePath) {
    res.statusCode = 404;
    return res.end('Not Found');
  }

  const ext = extname(filePath).toLowerCase();
  res.setHeader('content-type', mime[ext] || 'text/plain; charset=utf-8');
  res.end(readFileSync(filePath));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`preview at http://localhost:${port}`);
});
