const http = require('node:http');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', short: 'p' },
    dir:  { type: 'string', short: 'd' },
    host: { type: 'string', default: '127.0.0.1' },
  },
});

const PORT = Number(values.port ?? process.env.PORT ?? 8080);
const HOST = values.host;
const PUBLIC_DIR = path.join(__dirname, 'public');
const RES_DIR = path.resolve(values.dir ?? positionals[0] ?? process.env.RES_DIR ?? path.join(PUBLIC_DIR, 'res'));
let RESOURCES = [];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mkv':  'video/x-matroska',
  '.mov':  'video/quicktime',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
  '.m4a':  'audio/mp4',
  '.aac':  'audio/aac',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
  '.vtt':  'text/vtt',
  '.srt':  'text/plain; charset=utf-8',
};

const extensions = [
  { type: 'video', exts: ['.mp4', '.webm', '.ogg', '.mkv', '.mov', '.avi', '.wmv', '.flv'] },
  { type: 'audio', exts: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus'] },
  { type: 'image', exts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff'] },
  { type: 'subtitles', exts : ['.srt', '.vtt', '.ass', '.sub'] }
];

function logger(req, code) {
  const forwaded = req.headers['x-forwarded-for'];
  let ip = forwaded ? forwaded.split(',')[0].trim() : req.socket.remoteAddress;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);

  const datetime = new Date();
  const date = datetime.toLocaleDateString('en-US');
  const time = datetime.toLocaleTimeString('en-US');

  const format = `${ip} - - [${date} ${time}] "${req.method} ${req.url} HTTP/${req.httpVersion}" ${code} -`;
  if (code < 400) console.log(format);
  else console.error(format);
}

async function getFileList(dir = RES_DIR) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    const results = await Promise.all(
      entries.map(async (entry) => {
        const fpath = path.join(dir, entry.name);

        if (entry.isDirectory()) return getFileList(fpath); // returns an array
        if (!entry.isFile()) return [];

        const stats = await fs.stat(fpath);
        const ext = path.extname(entry.name).toLowerCase();
        const type = extensions.find((i) => i.exts.includes(ext))?.type ?? "unknown";

        // URL-style path relative to RES_DIR, e.g. "res/images/cat.png"
        const rel = path.relative(RES_DIR, fpath).split(path.sep).map(encodeURIComponent).join('/');
        
        return [
          {
            label: `${path.parse(entry.name).name.toUpperCase()} ${type} file`,
            name: entry.name,
            src: `res/${rel}`,
            description: `last modified ${new Date(stats.mtimeMs).toLocaleDateString("en-US")}`,
          },
        ];
      })
    );

    return results.flat(); // merge all the arrays into one
  } catch (err) {
    console.error(err);
    return [];
  }
}

function resolveInside(base, rel) {
  const full = path.join(base, rel);
  return full.startsWith(base + path.sep) ? full : null;
}

async function service(req, resp) {
  const send = (code, body, type = 'text/plain') => {
    resp.writeHead(code, { 'Content-Type': type });
    logger(req, code);
    resp.end(body);
  };

  if (req.method !== 'GET') return send(405, 'Method Not Allowed');

  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return send(400, 'Bad Request');
  }
  if (urlPath.includes('\0')) return send(400, 'Bad Request');

  if (urlPath === '/media-list') {
    return send(200, JSON.stringify({ media: RESOURCES }), 'application/json');
  }

  // Pick which folder this URL maps to
  let base = PUBLIC_DIR;
  if (urlPath === '/') urlPath = '/index.html';
  else if (urlPath.startsWith('/res/')) {
    base = RES_DIR;
    urlPath = urlPath.slice('/res'.length); // "/res/a/b.mp4" -> "/a/b.mp4"
  }

  const file = resolveInside(base, urlPath);
  if (!file) return send(403, 'Forbidden');

  let stats;
  try {
    stats = await fs.stat(file);
  } catch {
    return send(404, '404 Not Found');
  }
  if (!stats.isFile()) return send(404, '404 Not Found');

  const ext = path.extname(file).toLowerCase();
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
  };

  let code = 200;
  let streamOpts = {};
  const range = req.headers.range;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start, end;
    if (m && (m[1] || m[2])) {
      if (m[1] === '') {                       // suffix range: last N bytes
        start = Math.max(stats.size - Number(m[2]), 0);
        end = stats.size - 1;
      } else {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), stats.size - 1) : stats.size - 1;
      }
    }
    if (start === undefined || start > end || start >= stats.size) {
      resp.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
      logger(req, 416);
      return resp.end();
    }
    code = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
    headers['Content-Length'] = end - start + 1;
    streamOpts = { start, end };
  } else {
    headers['Content-Length'] = stats.size;
  }

  resp.writeHead(code, headers);
  logger(req, code);

  const stream = createReadStream(file, streamOpts);
  stream.on('error', (err) => {
    console.error(err);
    resp.destroy(); // headers already sent, so just drop the connection
  });
  resp.on('close', () => stream.destroy()); // stop reading if the client leaves
  stream.pipe(resp);
}

async function main() {
  try {
    const st = await fs.stat(RES_DIR);
    if (!st.isDirectory()) throw new Error('not a directory');
  } catch {
    console.error(`Invalid directory: ${RES_DIR}`);
    process.exit(1);
  }

  RESOURCES = await getFileList();

  http.createServer(service).listen(PORT, HOST, () => {
    console.log('--- config ---');
    console.log(` PUBLIC_DIR=${PUBLIC_DIR}`);
    console.log(` RES_DIR=${RES_DIR}`);
    console.log(` URL=http://localhost:${PORT}`);
    console.log(` RES_LEN=${RESOURCES.length}`);
    console.log('Server running ...\n--- requests ---');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

