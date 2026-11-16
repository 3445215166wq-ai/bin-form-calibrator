// 定点复核：把页面停在指定档位，截整页图 + 报当前秒数
const fs = require("fs");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_probe/shot";
const TIERS = (process.argv[5] || "3,6").split(",").map(Number);
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
  fs.mkdirSync(OUT, { recursive: true });

  for (const tier of TIERS) {
    await send("Page.navigate", { url: `${BASE}?t=${tier}` });
    await sleep(2200);
    const info = await ev(`(() => {
      const v = document.getElementById('vid');
      return JSON.stringify({ t: +v.currentTime.toFixed(2), tier: document.getElementById('tname').textContent,
        pct: document.getElementById('pct').textContent });
    })()`);
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(`${OUT}/tier-${tier}.png`, Buffer.from(s.data, "base64"));
    console.log(`?t=${tier} →`, info);
  }
  console.log("错误:", logs.length ? logs.slice(0, 4) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
