// 分享预览外观检查：三个档位各截一张，顺便确认二维码还能扫
const fs = require("fs");
const path = require("path");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_sh3";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jsqrSrc = fs.readFileSync(path.join(process.env.TEMP, "qrtest", "node_modules", "jsqr", "dist", "jsQR.js"), "utf8");
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
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? "EXC:" + (r.exceptionDetails.exception || {}).description : r.result.value;
  };
  fs.mkdirSync(OUT, { recursive: true });

  await send("Page.navigate", { url: BASE + "?t=3" });
  await sleep(2800);
  await ev(jsqrSrc + "\n; 'ok'");

  for (const tier of [3, 6, 7]) {
    await send("Page.navigate", { url: `${BASE}?t=${tier}` });
    await sleep(2400);
    await ev(jsqrSrc + "\n; 'ok'");        // 每次导航都会清掉上下文，必须重注入
    await ev(`document.getElementById('btnShare').click()`);
    await sleep(900);
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, `sheet-t${tier}.png`), Buffer.from(s.data, "base64"));

    const qr = await ev(`(function () {
      var c = document.querySelector('#sheetPv canvas'); if (!c) return 'no canvas';
      var g = c.getContext('2d');
      var regions = [[670,810,220,220],[650,790,260,260],[620,770,300,300]];
      for (var i=0;i<regions.length;i++){var R=regions[i];var d=g.getImageData(R[0],R[1],R[2],R[3]);var o=jsQR(d.data,R[2],R[3]);if(o&&o.data)return 'OK:'+o.data;}
      return 'FAILED';
    })()`);
    console.log(`?t=${tier}  档名:`, await ev(`document.getElementById('sheetUrl').value`));
    console.log(`   二维码: ${String(qr).slice(0, 90)}`);
    console.log(`   档位文字:`, await ev(`(function(){var c=document.querySelector('#sheetPv canvas');return c? c.width+'x'+c.height : '-'})()`));
    await ev(`document.getElementById('sheetClose').click()`);
    await sleep(300);
  }
  console.log("错误:", logs.length ? logs.slice(0, 4) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
