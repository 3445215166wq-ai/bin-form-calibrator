// 在页面里用 jsQR 反解"分享图里的二维码"，确认真的能扫出来
const fs = require("fs");
const path = require("path");
const PORT = process.argv[2], BASE = process.argv[3];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const jsqrSrc = fs.readFileSync(path.join(process.env.TEMP, "qrtest", "node_modules", "jsqr", "dist", "jsQR.js"), "utf8");

(async () => {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = t.find(x => x.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pend = new Map(); let id = 0;
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return "EXC: " + (r.exceptionDetails.exception || {}).description;
    return r.result.value;
  };

  await send("Page.navigate", { url: BASE + "?t=6" });
  await sleep(2800);

  // 注入 jsQR
  const inj = await ev(jsqrSrc + "\n; typeof jsQR === 'function' ? 'ok' : 'missing'");
  console.log("注入 jsQR:", inj);

  await ev(`document.getElementById('btnShare').click()`);
  await sleep(1000);

  const res = await ev(`(function () {
    var c = document.querySelector('#sheetPv canvas');
    if (!c) return 'no canvas';
    var g = c.getContext('2d');
    // 二维码在卡片右下角：box(698, B+24, 154) 且内部居中，取大一点的范围再解
    var regions = [
      [690, 826, 172, 172],
      [690, 820, 200, 200],
      [660, 800, 260, 260]
    ];
    for (var i = 0; i < regions.length; i++) {
      var R = regions[i];
      var d = g.getImageData(R[0], R[1], R[2], R[3]);
      var out = jsQR(d.data, R[2], R[3]);
      if (out && out.data) return 'DECODED:' + out.data;
    }
    return 'FAILED';
  })()`);
  console.log("卡片里的二维码解码:", res);
  console.log("期望:", await ev(`document.getElementById('sheetUrl').value`));
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
