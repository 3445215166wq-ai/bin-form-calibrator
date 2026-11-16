// 诊断 3：不读像素（读回太贵、会干扰测量），改成 hook drawImage 数"到底画了几帧"
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

  await send("Page.navigate", { url: BASE });
  await sleep(3200);

  const out = await ev(`(function(){
    return new Promise(function(done){
      var v = document.getElementById('vid');
      var knob = document.getElementById('knob'), track = document.getElementById('rheostat');
      var r = track.getBoundingClientRect(), k = knob.getBoundingClientRect();
      var x0 = k.x + k.width/2, y0 = k.y + k.height/2;
      var left = r.x + 18, span = r.width - 36;

      var T0 = performance.now();
      var log = { seeks: 0, landed: 0, draws: 0, drawTimes: [] };

      // hook drawImage：只数画到 #cv 上的次数
      var orig = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(){
        if (this.canvas && this.canvas.id === 'cv') { log.draws++; log.drawTimes.push(Math.round(performance.now()-T0)); }
        return orig.apply(this, arguments);
      };

      v.addEventListener('seeking', function(){ log.seeks++; });
      v.addEventListener('seeked', function(){ log.landed++; });

      knob.dispatchEvent(new PointerEvent('pointerdown', { clientX: x0, clientY: y0, bubbles: true, cancelable: true }));
      var DRAG_MS = 350;
      var tStart = performance.now();
      function frame(){
        var f = Math.min(1, (performance.now() - tStart) / DRAG_MS);
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: left + span * f, clientY: y0, bubbles: true, cancelable: true }));
        if (f < 1) requestAnimationFrame(frame);
        else {
          log.dragMs = Math.round(performance.now() - tStart);
          log.seeksAtEnd = log.seeks; log.landedAtEnd = log.landed; log.drawsAtEnd = log.draws;
          window.dispatchEvent(new PointerEvent('pointerup', { clientX: left + span, clientY: y0, bubbles: true }));
          setTimeout(function(){
            CanvasRenderingContext2D.prototype.drawImage = orig;
            log.finalCt = +v.currentTime.toFixed(2);
            done(JSON.stringify(log));
          }, 800);
        }
      }
      requestAnimationFrame(frame);
    });
  })()`);

  const d = JSON.parse(out);
  console.log(`拖动 ${d.dragMs}ms：seek 发起 ${d.seeksAtEnd} / 落地 ${d.landedAtEnd} / 实际绘制 ${d.drawsAtEnd} 帧`);
  console.log(`松手后追加：seek ${d.seeks - d.seeksAtEnd} / 落地 ${d.landed - d.landedAtEnd} / 绘制 ${d.draws - d.drawsAtEnd}`);
  console.log(`最终 currentTime = ${d.finalCt}s`);
  console.log("绘制间隔(ms):", d.drawTimes.slice(0, 24).join(" "));
  const gaps = d.drawTimes.slice(1, 24).map((x, i) => x - d.drawTimes[i]);
  console.log("间隔序列:", gaps.join(" "));
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
