// 验证音效：最后一档"圣光和弦"、开弹幕"人声鼎沸"底噪（先清 localStorage 再测）
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
      window.__log = { osc: [], buf: [], conv: 0, bp: 0 };
      (function(){
        const P = AudioContext.prototype;
        const oOsc = P.createOscillator, oBuf = P.createBufferSource, oConv = P.createConvolver, oBp = P.createBiquadFilter;
        P.createOscillator = function(){ const n = oOsc.call(this); const st = n.start.bind(n);
          n.start = function(){
            let f = n.frequency.value;
            try { f = n.frequency.value; } catch(e){}
            window.__log.osc.push({ type: n.type, f: Math.round((f||0)*100)/100 }); return st.apply(n, arguments); }; return n; };
        P.createBufferSource = function(){ const n = oBuf.call(this); const st = n.start.bind(n);
          n.start = function(){ window.__log.buf.push({ rate: Math.round((n.playbackRate.value||1)*100)/100 }); return st.apply(n, arguments); }; return n; };
        P.createConvolver = function(){ window.__log.conv++; return oConv.call(this); };
        P.createBiquadFilter = function(){ const n = oBp.call(this);
          const ob = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(n), 'type');
          let t = 'lowpass';
          Object.defineProperty(n, 'type', { get(){ return t; },
            set(v){ t = v; if (v === 'bandpass') window.__log.bp++; }, configurable: true });
          return n; };
      })();
    `
  });

  await send("Page.navigate", { url: BASE + "?t=3" });
  await sleep(2200);
  // 清掉上一轮残留的开关状态
  await ev0(`localStorage.removeItem('bs.danmu'); localStorage.removeItem('bs.sound'); location.reload()`);
  await sleep(2800);

  async function ev0(x) { return send("Runtime.evaluate", { expression: x, returnByValue: true }); }
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? "EXC:" + (r.exceptionDetails.exception || {}).description : r.result.value;
  };

  console.log("初始开关:", await ev(`JSON.stringify({
    sound: document.getElementById('tgSound').classList.contains('on'),
    danmu: document.getElementById('tgDanmu').classList.contains('on')})`));

  // ① 最后一档
  await ev(`window.__log = { osc: [], buf: [], conv: 0, bp: 0 }`);
  await ev(`document.querySelectorAll('.stop')[6].click()`);
  await sleep(700);
  console.log("① 最后一档:", await ev(`document.getElementById('tname').textContent`));
  console.log("   和弦音高:", await ev(`JSON.stringify(window.__log.osc.filter(o=>o.type==='triangle').map(o=>o.f))`));
  console.log("   振荡器总数:", await ev(`window.__log.osc.length`), " 混响卷积:", await ev(`window.__log.conv`));

  // ② 普通档对比
  await ev(`window.__log = { osc: [], buf: [], conv: 0, bp: 0 }`);
  await ev(`document.querySelectorAll('.stop')[2].click()`);
  await sleep(400);
  console.log("② 普通档:", await ev(`document.getElementById('tname').textContent`),
              " 振荡器:", await ev(`window.__log.osc.length`), " 混响:", await ev(`window.__log.conv`));

  // ③ 开弹幕 → 人声鼎沸
  await ev(`window.__log = { osc: [], buf: [], conv: 0, bp: 0 }`);
  await ev(`document.getElementById('tgDanmu').click()`);
  await sleep(1000);
  console.log("③ 开弹幕 → on:", await ev(`document.getElementById('tgDanmu').classList.contains('on')`));
  console.log("   人群 bufferSource:", await ev(`window.__log.buf.length`),
              " 带通:", await ev(`window.__log.bp`),
              " LFO:", await ev(`window.__log.osc.length`),
              " 播放速率:", await ev(`JSON.stringify(window.__log.buf.map(b=>b.rate))`));
  console.log("   同屏弹幕:", await ev(`document.querySelectorAll('#danmu span').length`));

  // ④ 关弹幕 → 应停
  await ev(`window.__log = { osc: [], buf: [], conv: 0, bp: 0 }`);
  await ev(`document.getElementById('tgDanmu').click()`);
  await sleep(400);
  console.log("④ 关弹幕 → on:", await ev(`document.getElementById('tgDanmu').classList.contains('on')`));

  // ⑤ 关音效时人声也要停
  await ev(`document.getElementById('tgDanmu').click()`);   // 再开
  await sleep(600);
  await ev(`document.getElementById('tgSound').click()`);   // 关音效
  await sleep(500);
  console.log("⑤ 弹幕on/音效on:", await ev(`JSON.stringify({
    danmu: document.getElementById('tgDanmu').classList.contains('on'),
    sound: document.getElementById('tgSound').classList.contains('on')})`));

  console.log("错误:", logs.length ? logs.slice(0, 6) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
