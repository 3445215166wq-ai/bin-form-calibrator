// 诊断：快速拖动时视频到底有没有在换帧
// 分别在页面里记录 seeking/seeked 时间线，并每 16ms 采样画面像素，看画面是否真的变化
const fs = require("fs");
const path = require("path");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_sc";
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
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? "EXC:" + (r.exceptionDetails.exception || {}).description : r.result.value;
  };
  const mouse = (type, x, y) => send("Input.dispatchMouseEvent", {
    type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1
  });

  await send("Page.navigate", { url: BASE + "?t=3" });
  await sleep(3000);
  await ev(`window.scrollBy(0, document.getElementById('rheostat').getBoundingClientRect().top - 120)`);
  await sleep(400);

  // 装探针：seek 事件时间线 + 画面像素签名
  await ev(`(function(){
    window.__d = { seeking: [], seeked: [], samples: [] };
    var v = document.getElementById('vid');
    v.addEventListener('seeking', function(){ window.__d.seeking.push(performance.now()); });
    v.addEventListener('seeked', function(){ window.__d.seeked.push(performance.now()); });
    var cv = document.getElementById('cv'), g = cv.getContext('2d');
    window.__sample = function(tag){
      var sig = '';
      try {
        var pts = [[0.5,0.3],[0.5,0.5],[0.3,0.6]];
        for (var i=0;i<pts.length;i++){
          var d = g.getImageData(Math.floor(cv.width*pts[i][0]), Math.floor(cv.height*pts[i][1]), 1, 1).data;
          sig += d[0]+','+d[1]+','+d[2]+';';
        }
      } catch(e) { sig = 'ERR'; }
      window.__d.samples.push({ t: Math.round(performance.now()), tag: tag, ct: +v.currentTime.toFixed(2), sig: sig });
    };
    window.__t0 = performance.now();
    return 'ok';
  })()`);

  const geo = JSON.parse(await ev(`(function(){
    var k = document.getElementById('knob').getBoundingClientRect();
    var r = document.getElementById('rheostat').getBoundingClientRect();
    return JSON.stringify({kx:k.x+k.width/2, ky:k.y+k.height/2, rx:r.x, rw:r.width});
  })()`));

  // 采样循环（页面内，每 16ms）
  await ev(`window.__smp = setInterval(function(){ window.__sample('drag'); }, 16)`);

  // 快拖：12 步走完整条，每步 16ms（模拟"滑得快"）
  await mouse("mousePressed", geo.kx, geo.ky);
  for (let i = 1; i <= 14; i++) {
    const x = geo.rx + 18 + (geo.rw - 36) * (i / 14);
    await mouse("mouseMoved", x, geo.ky);
    await sleep(16);
  }
  const tDragEnd = await ev(`Math.round(performance.now() - window.__t0)`);
  // 松手后继续采样 1.2s，看"停下才跳"的现象
  await mouse("mouseReleased", geo.rx + 18 + (geo.rw - 36), geo.ky);
  await sleep(1200);
  await ev(`clearInterval(window.__smp)`);

  const d = JSON.parse(await ev(`JSON.stringify(window.__d)`));
  const t0 = d.samples.length ? d.samples[0].t : 0;

  function summarize(label, arr) {
    const inDrag = arr.filter(x => x - t0 <= tDragEnd).length;
    console.log(`${label}: 拖动中 ${inDrag} 次 / 松手后 ${arr.length - inDrag} 次 / 共 ${arr.length}`);
  }
  console.log("=== 拖动阶段 0 ~", tDragEnd, "ms ===");
  summarize("seeking 事件", d.seeking);
  summarize("seeked  事件", d.seeked);

  const before = d.samples.filter(s => s.t - t0 <= tDragEnd);
  const after = d.samples.filter(s => s.t - t0 > tDragEnd);
  const sigBefore = new Set(before.map(s => s.sig));
  const sigAfter = new Set(after.map(s => s.sig));
  console.log(`采样（每16ms）：拖动中 ${before.length} 个点，画面不同状态 ${sigBefore.size} 种`);
  console.log(`                松手后 ${after.length} 个点，画面不同状态 ${sigAfter.size} 种`);
  console.log("拖动中 currentTime 序列:", before.map(s => s.ct).join(" "));
  console.log("拖动中画面签名变化次数:", [...before].filter((s, i, a) => i > 0 && s.sig !== a[i - 1].sig).length);
  console.log("松手后画面签名变化次数:", [...after].filter((s, i, a) => i > 0 && s.sig !== a[i - 1].sig).length);
  console.log("松手后前 12 个采样 ct:", after.slice(0, 12).map(s => s.ct).join(" "));
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
