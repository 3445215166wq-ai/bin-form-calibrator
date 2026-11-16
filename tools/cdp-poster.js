// 线上复核：九宫格海报能否导出（file:// 时代这里是被浏览器拦的）
const fs = require("fs");
const path = require("path");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_cb";
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = t.find(x => x.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pend = new Map(); let id = 0;
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.addEventListener("open", r));
  const logs = [];
  ws.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") logs.push("EXC " + (m.params.exceptionDetails.exception || {}).description);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  });
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true })).result.value;

  const dl = path.resolve(OUT, "poster");
  fs.rmSync(dl, { recursive: true, force: true });
  fs.mkdirSync(dl, { recursive: true });
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dl });

  await send("Page.navigate", { url: BASE + "?t=6" });
  await sleep(3000);
  console.log("档位:", await ev(`document.getElementById('tname').textContent`));
  await ev(`document.getElementById('btnPoster').click()`);
  await sleep(3000);
  console.log("海报 toast:", await ev(`document.getElementById('toast').textContent`));
  const files = fs.existsSync(dl) ? fs.readdirSync(dl) : [];
  console.log("下载:", files.length ? files : "（无）");
  // 顺便量一下线上首屏与拖动
  console.log("视频缓冲:", await ev(`(function(){var b=document.getElementById('vid').buffered;return b.length?b.end(0).toFixed(2)+'s':'0'})()`));
  console.log("错误:", logs.length ? logs.slice(0, 4) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
