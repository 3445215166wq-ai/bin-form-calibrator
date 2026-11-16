// 验证：分享按钮出图 / 刻度点击跳档 / 按钮数量
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
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push("ERR " + m.params.args.map(a => a.value ?? a.description).join(" "));
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  });
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;
  const shot = async name => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(s.data, "base64"));
  };
  const mouse = (type, x, y) => send("Input.dispatchMouseEvent", {
    type, x, y, button: type === "mouseReleased" ? "none" : "left",
    buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1
  });

  const dl = path.resolve(OUT, "dl");
  fs.mkdirSync(dl, { recursive: true });
  fs.rmSync(dl, { recursive: true, force: true });
  fs.mkdirSync(dl, { recursive: true });
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dl });

  await send("Page.navigate", { url: BASE });
  await sleep(2600);

  console.log("按钮:", await ev(`Array.from(document.querySelectorAll('.controls .btn')).map(b=>b.textContent.trim()).join(' | ')`));
  console.log("刻度元素:", await ev(`JSON.stringify(Array.from(document.querySelectorAll('.stop')).map(function(s){
    var r=s.getBoundingClientRect();
    return {n:s.querySelector('.num').textContent, w:Math.round(r.width), h:Math.round(r.height)};
  }))`));

  // 逐个点刻度中心，检查是否精确跳到该档
  const rects = JSON.parse(await ev(`JSON.stringify(Array.from(document.querySelectorAll('.stop')).map(function(s){
    var r=s.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2};
  }))`));
  const seq = [4, 0, 6, 2, 5, 1, 3];
  const got = [];
  for (const i of seq) {
    await mouse("mousePressed", rects[i].x, rects[i].y);
    await mouse("mouseReleased", rects[i].x, rects[i].y);
    await sleep(420);
    got.push(i + "→" + (await ev(`document.getElementById('pct').textContent + ' ' + document.getElementById('tname').textContent`)));
  }
  got.forEach(g => console.log("  点", g));

  // 点完后滑片是否真的落在刻度上（误差应 ~0）
  console.log("滑片对齐检查:", await ev(`(function(){
    var k=document.getElementById('knob').getBoundingClientRect();
    var kc=k.x+k.width/2;
    var arr=Array.from(document.querySelectorAll('.stop')).map(function(s){
      var r=s.getBoundingClientRect();
      return Math.round((r.x+r.width/2-kc)*10)/10;
    });
    return JSON.stringify({knobCenter:Math.round(kc*10)/10, offsets:arr, active:document.querySelector('.stop.on .num').textContent});
  })()`));

  // 同档再点一次也要有反馈
  console.log("原地点击命中金圈:", await ev(`(function(){
    var s=document.querySelector('.stop.on');
    s.click();
    return { hit: s.classList.contains('hit'), jumping: document.getElementById('rheostat').classList.contains('jumping') };
  })()`));

  // 未选中的相邻空白处点击应仍能拖（容器不吃点击）
  console.log("stops 容器 pointer-events:", await ev(`getComputedStyle(document.getElementById('stops')).pointerEvents + ' / 按钮 ' + getComputedStyle(document.querySelector('.stop')).pointerEvents`));

  // 分享出图
  await sleep(300);
  await ev(`document.getElementById('btnShare').click()`);
  await sleep(2200);
  const files = fs.existsSync(dl) ? fs.readdirSync(dl) : [];
  console.log("下载到:", files.length ? files : "（无）");
  console.log("toast:", await ev(`document.getElementById('toast').textContent`));

  await shot("after.png");
  console.log("错误:", logs.length ? logs.slice(0, 5) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
