// 极简静态服务器：node tools/serve.js [port]
const http = require("http"), fs = require("fs"), path = require("path"), url = require("url");
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2] || 8099);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".zip": "application/zip"
};
http.createServer((req, res) => {
  let p = decodeURIComponent(url.parse(req.url).pathname);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream",
      "Content-Length": st.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(f).pipe(res);
  });
}).listen(PORT, () => console.log("serving " + ROOT + " on http://127.0.0.1:" + PORT));
