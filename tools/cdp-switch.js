// 验证新的档位切换线：肌肉/爆衣应留在「夺冠」，最右端才是「贾科斯」
const fs = require("fs");
const path = require("path");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_v";
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

  const ps = [0.75, 0.80, 0.85, 0.90, 0.94, 0.96, 0.98, 1.0];
  for (const p of ps) {
    await send("Page.navigate", { url: `${BASE}?p=${p}` });
    await sleep(1500);
    const info = await ev(`(function(){
      var v = document.getElementById('vid');
      var s = document.getElementById('stage').getBoundingClientRect();
      return JSON.stringify({ t: +v.currentTime.toFixed(2),
        tier: document.getElementById('tname').textContent,
        active: (document.querySelector('.stop.on .num')||{}).textContent,
        clip: { x:Math.round(s.x), y:Math.round(s.y), width:Math.round(s.width), height:Math.round(s.height), scale:1 } });
    })()`);
    const o = JSON.parse(info);
    console.log(`p=${p.toFixed(2)}  t=${o.t}s  ${o.tier}  (亮的是第 ${o.active} 格)`);
    const s = await send("Page.captureScreenshot", { format: "png", clip: o.clip });
    fs.writeFileSync(path.join(OUT, `p${String(Math.round(p * 100)).padStart(3, "0")}.png`), Buffer.from(s.data, "base64"));
  }
  console.log("错误:", logs.length ? logs.slice(0, 4) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
