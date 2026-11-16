const fs = require("fs");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_s";
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
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${n}`, Buffer.from(s.data, "base64")); };

  await send("Page.navigate", { url: BASE + "?t=5" });
  await sleep(2200);
  await ev(`localStorage.removeItem('bs.danmu'); location.reload()`);
  await sleep(2600);
  await ev(`(() => { const g = document.getElementById('tgDanmu'); if (!g.classList.contains('on')) g.click(); })()`);

  // 等弹幕铺开，连拍几张，抓不同样式同时出现的画面
  await sleep(5200);
  await shot("dm-a.png");
  await sleep(2600);
  await shot("dm-b.png");
  await sleep(3200);
  await shot("dm-c.png");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
