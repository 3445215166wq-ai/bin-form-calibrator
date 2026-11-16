// 把刻度滚进可视区再点，排除 headless 视口太小的干扰
const PORT = process.argv[2], BASE = process.argv[3];
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
  /* 注意：mouseReleased 必须写 button:"left" + buttons:0，
     用 button:"none" 时 Chrome 会直接把这次释放丢掉，click 永远不触发（踩过一次）。 */
  const mouse = (type, x, y) => send("Input.dispatchMouseEvent", {
    type, x, y, button: "left",
    buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1
  });

  await send("Page.navigate", { url: BASE });
  await sleep(2600);

  console.log("视口:", await ev(`innerWidth + 'x' + innerHeight + ' dpr' + devicePixelRatio + ' docH' + document.documentElement.scrollHeight`));

  // 把刻度滚到视口里
  await ev(`(function(){
    var r = document.getElementById('stops').getBoundingClientRect();
    window.scrollBy(0, r.top - 60);
  })()`);
  await sleep(300);
  console.log("滚动后 stops.top:", await ev(`Math.round(document.getElementById('stops').getBoundingClientRect().top)`));
  console.log("命中测试:", await ev(`(function(){
    var s = document.querySelectorAll('.stop')[4], r = s.getBoundingClientRect();
    var e = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
    return e ? e.tagName + '.' + e.className : 'null';
  })()`));

  const rects = JSON.parse(await ev(`JSON.stringify(Array.from(document.querySelectorAll('.stop')).map(function(s){
    var r=s.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
  }))`));
  console.log("各格中心 y:", rects.map(r => r.y).join(","));

  for (const i of [4, 0, 6, 2, 5, 1, 3]) {
    await mouse("mouseMoved", rects[i].x, rects[i].y);
    await mouse("mousePressed", rects[i].x, rects[i].y);
    await sleep(40);
    await mouse("mouseReleased", rects[i].x, rects[i].y);
    await sleep(500);
    console.log("  点第" + (i + 1) + "格 →",
      await ev(`document.getElementById('pct').textContent + ' ' + document.getElementById('tname').textContent`),
      "| 金圈:", await ev(`document.querySelectorAll('.stop')[${i}].classList.contains('hit')`));
  }
  console.log("滑片与刻度对齐:", await ev(`(function(){
    var k=document.getElementById('knob').getBoundingClientRect(), kc=k.x+k.width/2;
    return JSON.stringify({active:document.querySelector('.stop.on .num').textContent,
      off:Math.round((document.querySelector('.stop.on').getBoundingClientRect().x + document.querySelector('.stop.on').getBoundingClientRect().width/2 - kc)*10)/10});
  })()`));
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
