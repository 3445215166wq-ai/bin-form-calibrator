// 把分享图画布按原分辨率导出，检查排版
const fs = require("fs");
const path = require("path");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_sh3";
const TIER = process.argv[5] || "6";
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = t.find(x => x.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pend = new Map(); let id = 0;
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true })).result.value;

  await send("Page.navigate", { url: `${BASE}?t=${TIER}` });
  await sleep(2600);
  await ev(`document.getElementById('btnShare').click()`);
  await sleep(900);
  const dataUrl = await ev(`document.querySelector('#sheetPv canvas').toDataURL('image/png')`);
  const b64 = String(dataUrl).split(",")[1];
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, `card-t${TIER}.png`);
  fs.writeFileSync(f, Buffer.from(b64, "base64"));
  console.log("已导出:", f, (Buffer.from(b64, "base64").length / 1024).toFixed(0) + " KB");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
