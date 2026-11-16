// 诊断 2：在页面内用 rAF 模拟真实的快拖（约 60 步/秒），看画面到底在不在变
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
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? "EXC:" + (r.exceptionDetails.exception || {}).description : r.result.value;
  };

  await send("Page.navigate", { url: BASE + "?t=3" });
  await sleep(3200);

  const out = await ev(`(function(){
    return new Promise(function(done){
      var v = document.getElementById('vid');
      var cv = document.getElementById('cv'), g = cv.getContext('2d');
      var knob = document.getElementById('knob'), track = document.getElementById('rheostat');
      var r = track.getBoundingClientRect(), k = knob.getBoundingClientRect();
      var x0 = k.x + k.width/2, y0 = k.y + k.height/2;
      var left = r.x + 18, span = r.width - 36;

      var T0 = performance.now();
      var log = { seeking: [], seeked: [], samples: [] };
      v.addEventListener('seeking', function(){ log.seeking.push(performance.now() - T0); });
      v.addEventListener('seeked', function(){ log.seeked.push(performance.now() - T0); });

      function sig(){
        try {
          var pts = [[0.5,0.3],[0.5,0.55],[0.32,0.62]], s = '';
          for (var i=0;i<pts.length;i++){
            var d = g.getImageData(Math.floor(cv.width*pts[i][0]), Math.floor(cv.height*pts[i][1]), 1, 1).data;
            s += d[0]+'_'+d[1]+'_'+d[2]+';';
          }
          return s;
        } catch(e){ return 'ERR'; }
      }

      var smp = setInterval(function(){
        log.samples.push({ t: Math.round(performance.now()-T0), ct: +v.currentTime.toFixed(2), s: sig() });
      }, 16);

      knob.dispatchEvent(new PointerEvent('pointerdown', { clientX: x0, clientY: y0, bubbles: true, cancelable: true }));
      var DRAG_MS = 350;
      var tStart = performance.now();
      function frame(){
        var f = Math.min(1, (performance.now() - tStart) / DRAG_MS);
        var x = left + span * f;
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y0, bubbles: true, cancelable: true }));
        if (f < 1) requestAnimationFrame(frame);
        else {
          log.tDragEnd = Math.round(performance.now() - T0);
          window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y0, bubbles: true }));
          setTimeout(function(){
            clearInterval(smp);
            log.totalSamples = log.samples.length;
            done(JSON.stringify(log));
          }, 900);
        }
      }
      requestAnimationFrame(frame);
    });
  })()`);

  const d = JSON.parse(out);
  const edge = d.tDragEnd + 1;
  const cnt = arr => {
    const a = arr.filter(x => x <= edge).length;
    return `拖动中 ${a} 次 / 之后 ${arr.length - a} 次`;
  };
  const before = d.samples.filter(s => s.t <= edge);
  const after = d.samples.filter(s => s.t > edge);
  const sigB = new Set(before.map(s => s.s)), sigA = new Set(after.map(s => s.s));

  console.log("拖动时长:", d.tDragEnd, "ms");
  console.log("seeking:", cnt(d.seeking));
  console.log("seeked :", cnt(d.seeked));
  console.log(`拖动中采样 ${before.length} 点 → 画面不同状态 ${sigB.size} 种`);
  console.log(`松手后采样 ${after.length} 点 -> 画面不同状态 ${sigA.size} 种`);
  console.log("拖动中 currentTime:", before.map(s => s.ct).join(" "));
  console.log("拖动中 seeked 时刻(ms):", d.seeked.filter(x => x <= edge).map(x => Math.round(x)).join(" "));
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
