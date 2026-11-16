// 验证新的真素材人声：只在夺冠/贾科斯响、离开就淡出、有声音
const PORT = process.argv[2], BASE = process.argv[3];
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
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__n = { buf: 0 };
      (function(){
        const P = AudioContext.prototype, oB = P.createBufferSource;
        P.createBufferSource = function(){ window.__n.buf++; return oB.call(this); };
        const orig = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function(dest){
          try {
            if (dest && dest.constructor && dest.constructor.name === 'AudioDestinationNode') {
              const ctx = this.context;
              if (!ctx.__an) { ctx.__an = ctx.createAnalyser(); ctx.__an.fftSize = 2048; orig.call(ctx.__an, dest); window.__an = ctx.__an; }
              return orig.call(this, ctx.__an);
            }
          } catch(e) {}
          return orig.apply(this, arguments);
        };
        window.__measure = function (ms) {
          return new Promise(function(res){
            const an = window.__an; if (!an) return res({ err:'no analyser' });
            const buf = new Float32Array(an.fftSize); let peak = 0, sum = 0, n = 0;
            const t0 = performance.now();
            (function loop(){
              an.getFloatTimeDomainData(buf);
              for (let i=0;i<buf.length;i++){ const v=Math.abs(buf[i]); if(v>peak)peak=v; sum+=buf[i]*buf[i]; }
              n += buf.length;
              if (performance.now()-t0 < ms) requestAnimationFrame(loop);
              else res({ peak:+peak.toFixed(3), rms:+Math.sqrt(sum/n).toFixed(4) });
            })();
          });
        };
      })();
    `
  });
  await send("Page.navigate", { url: BASE + "?t=3" });
  await sleep(2200);
  await send("Runtime.evaluate", { expression: "localStorage.removeItem('bs.danmu'); localStorage.removeItem('bs.sound'); location.reload()" });
  await sleep(3000);
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? "EXC:" + (r.exceptionDetails.exception || {}).description : r.result.value;
  };

  // 模拟一次按下（触发用户手势 + 预加载），然后逐档检查
  await ev(`(function(){
    var knob=document.getElementById('knob'), track=document.getElementById('rheostat');
    var r=track.getBoundingClientRect(), k=knob.getBoundingClientRect();
    window.__g={x0:k.x+k.width/2,y0:k.y+k.height/2,left:r.x+18,span:r.width-36};
    window.__press=function(){ knob.dispatchEvent(new PointerEvent('pointerdown',{clientX:__g.x0,clientY:__g.y0,bubbles:true,cancelable:true})); };
    window.__moveTo=function(f){ window.dispatchEvent(new PointerEvent('pointermove',{clientX:__g.left+__g.span*f,clientY:__g.y0,bubbles:true,cancelable:true})); };
    window.__release=function(f){ window.dispatchEvent(new PointerEvent('pointerup',{clientX:__g.left+__g.span*f,clientY:__g.y0,bubbles:true})); };
    return 'ok';
  })()`);
  await ev(`window.__press()`);
  await sleep(600);
  await ev(`window.__release(0.33)`);
  await sleep(1500);
  console.log("人声素材加载:", await ev(`document.querySelector('script') ? 'ok' : '-'`));
  console.log("资源下载记录:", await ev(`JSON.stringify(performance.getEntriesByType('resource').filter(e=>e.name.includes('crowd')).map(e=>e.name.split('/').pop()+':'+Math.round(e.transferSize/1024)+'KB'))`));

  for (const [label, idx] of [["第3档 稚嫩", 2], ["第4档 先锋赛", 3], ["第5档 反思", 4], ["第6档 夺冠", 5], ["第7档 贾科斯", 6]]) {
    await ev(`document.querySelectorAll('.stop')[${idx}].click()`);
    await sleep(1800);
    const m = await ev(`window.__measure(900)`);
    console.log(`${label}: 电平 ${JSON.stringify(m)}  音源数 ${await ev(`window.__n.buf`)}`);
  }

  // 离开高档位 → 应淡出
  await ev(`document.querySelectorAll('.stop')[2].click()`);
  await sleep(1800);
  console.log("回到第 3 档后（应接近静音）:", JSON.stringify(await ev(`window.__measure(900)`)));

  // 关音效 → 也不该有
  await ev(`document.querySelectorAll('.stop')[6].click()`);
  await sleep(1500);
  const on = await ev(`window.__measure(700)`);
  await ev(`document.getElementById('tgSound').click()`);
  await sleep(1500);
  const off = await ev(`window.__measure(700)`);
  console.log("贾科斯档 音效开:", JSON.stringify(on), " → 关音效后:", JSON.stringify(off));
  console.log("错误:", logs.length ? logs.slice(0, 5) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
