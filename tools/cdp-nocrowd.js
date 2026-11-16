// 验证：开弹幕不再产生任何循环底噪；其他音效正常
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
      window.__n = { buf: 0, osc: 0 };
      (function(){
        const P = AudioContext.prototype;
        const oO = P.createOscillator, oB = P.createBufferSource;
        P.createOscillator = function(){ window.__n.osc++; return oO.call(this); };
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
  await sleep(2600);
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? "EXC:" + (r.exceptionDetails.exception || {}).description : r.result.value;
  };

  console.log("① 开弹幕前，静置 1.5 秒:", JSON.stringify(await ev(`window.__measure(1500)`)));
  await ev(`window.__n = { buf: 0, osc: 0 }`);
  await ev(`document.getElementById('tgDanmu').click()`);      // 开弹幕
  await sleep(2500);
  const n = await ev(`JSON.stringify(window.__n)`);
  const m = await ev(`window.__measure(1500)`);
  console.log("② 开弹幕 2.5 秒后：新音源 =", n, " 电平 =", JSON.stringify(m));
  console.log("   弹幕在跑吗:", await ev(`document.querySelectorAll('#danmu span').length`) + " 条  | 开关:", await ev(`JSON.stringify({d:document.getElementById('tgDanmu').classList.contains('on')})`));

  // 档位音效还在不在
  await ev(`window.__n = { buf: 0, osc: 0 }`);
  await ev(`document.querySelectorAll('.stop')[6].click()`);
  await sleep(700);
  console.log("③ 点第 7 格（圣光啊）后 新振荡器:", await ev(`window.__n.osc`), " 电平:", JSON.stringify(await ev(`window.__measure(1200)`)));
  await sleep(2500);
  console.log("④ 圣光放完 2.5 秒后（应归零）:", JSON.stringify(await ev(`window.__measure(800)`)));
  console.log("错误:", logs.length ? logs.slice(0, 5) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
