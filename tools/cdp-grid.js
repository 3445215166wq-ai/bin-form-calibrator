// 逐格截图：验证"刻度帧 = 该档标准姿势"，以及档位之间的过渡是否合理
const fs = require("fs");
const path = require("path");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_probe/grid";
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
  fs.mkdirSync(OUT, { recursive: true });

  // 先把画面裁到只剩 stage，省得拼图全是 UI
  const clip = JSON.parse(await ev(`(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return JSON.stringify({x:r.x,y:r.y,width:r.width,height:r.height,scale:1});
  })()`).then ? "{}" : "{}");

  const rows = [];
  for (let i = 0; i <= 12; i++) {
    const p = i / 12;
    await send("Page.navigate", { url: `${BASE}?p=${p.toFixed(4)}` });
    await sleep(1500);
    const info = JSON.parse(await ev(`(() => {
      const v = document.getElementById('vid');
      const s = document.getElementById('stage').getBoundingClientRect();
      return JSON.stringify({ t: v.currentTime, tier: document.getElementById('tname').textContent,
        pct: document.getElementById('pct').textContent, tag: document.getElementById('tag').textContent,
        clip: { x: Math.round(s.x), y: Math.round(s.y), width: Math.round(s.width), height: Math.round(s.height), scale: 1 } });
    })()`));
    const s = await send("Page.captureScreenshot", { format: "png", clip: info.clip });
    const name = `${OUT}/p${String(i).padStart(2, "0")}.png`;
    fs.writeFileSync(name, Buffer.from(s.data, "base64"));
    rows.push({ p: +p.toFixed(3), t: +info.t.toFixed(2), tier: info.tier, tag: info.tag });
  }
  rows.forEach(r => console.log(`p=${r.p.toFixed(3)}  t=${r.t.toFixed(2)}s  ${r.tier}`));
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
