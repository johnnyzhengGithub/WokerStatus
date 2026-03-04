const http = require('http');
const { readFileSync, existsSync } = require('fs');
const { join, extname } = require('path');

const dashboard = require('./api/dashboard');
const presenceUpdate = require('./api/presence/update');
const tasks = require('./api/tasks/index');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

function wrapRes(res) {
  return {
    status(code) { res.statusCode = code; return this; },
    setHeader: (...args) => res.setHeader(...args),
    json(obj) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); },
    send(text) { res.end(text); }
  };
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url.startsWith('/api/')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
      const r = wrapRes(res);
      if (url === '/api/dashboard') return dashboard(req, r);
      if (url === '/api/presence/update') return presenceUpdate(req, r);
      if (url === '/api/tasks') return tasks(req, r);
      return r.status(404).json({ error: 'not found' });
    });
    return;
  }

  const file = url === '/' ? '/index.html' : (url === '/dashboard' ? '/dashboard.html' : url);
  const filePath = join(process.cwd(), file);
  if (!existsSync(filePath)) {
    res.statusCode = 404;
    return res.end('Not Found');
  }

  const ext = extname(filePath);
  res.setHeader('content-type', mime[ext] || 'text/plain; charset=utf-8');
  res.end(readFileSync(filePath));
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`preview at http://localhost:${port}`));
