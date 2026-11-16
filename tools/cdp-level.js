// 测量页面真实输出电平：把 AnalyserNode 插到 destination 前面，读峰值/RMS
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
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  });
  await send("Page.enable"); await send("Runtime.enable");

  // 在 destination 前插一个分析节点
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      (function(){
        const orig = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function(dest){
          try {
            if (dest && dest.constructor && dest.constructor.name === 'AudioDestinationNode') {
              const ctx = this.context;
              if (!ctx.__an) {
                ctx.__an = ctx.createAnalyser();
                ctx.__an.fftSize = 2048;
                orig.call(ctx.__an, dest);
                window.__an = ctx.__an;
              }
              return orig.call(this, ctx.__an);
            }
          } catch(e) {}
          return orig.apply(this, arguments);
        };
        window.__measure = function (ms) {
          return new Promise(function(res){
            const an = window.__an;
            if (!an) return res({ err: 'no analyser' });
            const buf = new Float32Array(an.fftSize);
            let peak = 0, sum = 0, n = 0;
            const t0 = performance.now();
            (function loop(){
              an.getFloatTimeDomainData(buf);
              for (let i = 0; i < buf.length; i++) {
                const v = Math.abs(buf[i]);
                if (v > peak) peak = v;
                sum += buf[i] * buf[i];
              }
              n += buf.length;
              if (performance.now() - t0 < ms) requestAnimationFrame(loop);
              else res({ peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4) });
            })();
          });
        };
      })();
    `
  });

  await send("Page.navigate", { url: BASE + "?t=3" });
  await sleep(2000);
  await send("Runtime.evaluate", { expression: "localStorage.removeItem('bs.danmu'); localStorage.removeItem('bs.sound'); location.reload()" });
  await sleep(2600);

  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? "EXC:" + (r.exceptionDetails.exception || {}).description : r.result.value;
  };

  // 先确认分析节点有没有接上、音频图有没有真的在跑
  await ev(`document.getElementById('tgSound').click()`);   // 关掉再开，触发一次 blip
  await sleep(300);
  await ev(`document.getElementById('tgSound').click()`);
  await sleep(200);
  console.log("分析节点存在:", await ev(`!!window.__an`), " ctx 状态:", await ev(`window.__an ? window.__an.context.state : '-'`));

  // ① 普通档音效
  await ev(`document.querySelectorAll('.stop')[2].click()`);
  const m1 = await ev(`window.__measure(500)`);
  console.log("① 普通档单音:", JSON.stringify(m1));

  // ② 最后一档"圣光啊"
  await ev(`document.querySelectorAll('.stop')[6].click()`);
  const m2 = await ev(`window.__measure(2400)`);
  console.log("② 圣光「啊」  :", JSON.stringify(m2));

  // ③ 人声鼎沸
  await ev(`document.getElementById('tgDanmu').click()`);
  await sleep(2000);
  const m3 = await ev(`window.__measure(1500)`);
  console.log("③ 人声鼎沸    :", JSON.stringify(m3), " 开关:", await ev(`JSON.stringify({s:document.getElementById('tgSound').classList.contains('on'),d:document.getElementById('tgDanmu').classList.contains('on')})`));

  const errs = logs.slice(0, 4);
  console.log("错误:", errs.length ? errs : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
