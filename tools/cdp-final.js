// 最终外观检查：整页截图（临时 override 视口，截完立刻清掉，避免影响鼠标坐标）
const fs = require("fs");
const path = require("path");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_chk";
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
  const shot = async name => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, "base64"));
  };
  const mouse = (type, x, y) => send("Input.dispatchMouseEvent", {
    type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1
  });

  await send("Page.navigate", { url: BASE + "?t=6" });
  await sleep(2600);

  // 1) 刻度段是否铺满且不重叠
  console.log("刻度段:", await ev(`JSON.stringify(Array.from(document.querySelectorAll('.stop')).map(function(s){
    var r=s.getBoundingClientRect(); return {n:s.querySelector('.num').textContent, x:Math.round(r.x), w:Math.round(r.width)};
  }))`));

  // 2) 两格之间点一下，应该落到最近的一档（不跳空）
  await ev(`window.scrollBy(0, document.getElementById('stops').getBoundingClientRect().top - 60)`);
  await sleep(200);
  const gaps = JSON.parse(await ev(`JSON.stringify((function(){
    var a=Array.from(document.querySelectorAll('.stop')).map(function(s){var r=s.getBoundingClientRect();return r.x+r.width;});
    var b=Array.from(document.querySelectorAll('.stop')).map(function(s){var r=s.getBoundingClientRect();return r.x;});
    var out=[];
    for(var i=0;i<b.length;i++){var r=document.querySelectorAll('.stop')[i].getBoundingClientRect();out.push({x:Math.round(b[i]+2), y:Math.round(r.y+r.height/2)});}
    return out;
  })())`));
  for (const g of gaps) {
    await mouse("mouseMoved", g.x, g.y);
    await mouse("mousePressed", g.x, g.y);
    await mouse("mouseReleased", g.x, g.y);
    await sleep(360);
  }
  console.log("逐格左边缘点完:", await ev(`document.getElementById('pct').textContent + ' ' + document.getElementById('tname').textContent`));

  // 3) 滑条本体（刻度行上方）仍是自由拖拽位置
  const tube = JSON.parse(await ev(`(function(){
    var r=document.getElementById('rheostat').getBoundingClientRect();
    return JSON.stringify({x:Math.round(r.x+r.width*0.41), y:Math.round(r.y+10)});
  })()`));
  await mouse("mouseMoved", tube.x, tube.y);
  await mouse("mousePressed", tube.x, tube.y);
  await sleep(60);
  await mouse("mouseMoved", tube.x + 1, tube.y);
  await mouse("mouseReleased", tube.x + 1, tube.y);
  await sleep(400);
  console.log("点滑条 41% 处:", await ev(`document.getElementById('pct').textContent`), "(应为约 41%，不被吸附)");

  // 4) 整页外观
  await ev(`window.scrollTo(0,0)`);
  await sleep(200);
  await send("Emulation.setDeviceMetricsOverride", { width: 421, height: 884, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  await shot("layout.png");
  await send("Emulation.clearDeviceMetricsOverride");
  await sleep(300);

  console.log("错误:", logs.length ? logs.slice(0, 5) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
