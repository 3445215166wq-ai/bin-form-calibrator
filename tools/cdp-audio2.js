// 验证音效重做：混响不再叠加（声音不会越来越大）、人声"啊"的共振峰、总限幅、人群音量
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
      window.__a = { osc: [], bq: [], conv: 0, convOut: 0, comp: 0, buf: 0 };
      (function(){
        const P = AudioContext.prototype;
        const oOsc = P.createOscillator, oBq = P.createBiquadFilter, oConv = P.createConvolver,
              oComp = P.createDynamicsCompressor, oBuf = P.createBufferSource;
        const cons = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function(dest){
          if (this instanceof ConvolverNode) window.__a.convOut++;
          return cons.apply(this, arguments);
        };
        P.createOscillator = function(){ const n = oOsc.call(this); const st = n.start.bind(n);
          n.start = function(){ window.__a.osc.push({ type: n.type, f: Math.round(n.frequency.value*100)/100 }); return st.apply(n, arguments); }; return n; };
        P.createBiquadFilter = function(){ const n = oBq.call(this); const t0 = n.type;
          let saved = { type: t0, f: n.frequency.value, q: n.Q.value };
          window.__a.bq.push(saved);
          return n; };
        P.createConvolver = function(){ window.__a.conv++; return oConv.call(this); };
        P.createDynamicsCompressor = function(){ window.__a.comp++; return oComp.call(this); };
        P.createBufferSource = function(){ window.__a.buf++; return oBuf.call(this); };
      })();
    `
  });

  await send("Page.navigate", { url: BASE + "?t=3" });
  await sleep(2000);
  await send("Runtime.evaluate", { expression: "localStorage.removeItem('bs.danmu'); localStorage.removeItem('bs.sound'); location.reload()" });
  await sleep(2800);

  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? "EXC:" + (r.exceptionDetails.exception || {}).description : r.result.value;
  };

  // 连续播放最后一档 5 次，看混响出口连接数会不会增长
  await ev(`window.__a = { osc: [], bq: [], conv: 0, convOut: 0, comp: 0, buf: 0 }`);
  for (let i = 0; i < 5; i++) {
    await ev(`document.querySelectorAll('.stop')[(window.__t = (window.__t===6?2:6))].click()`);
    await sleep(260);
  }
  console.log("播放 5 次（最后档与普通档交替）后：");
  console.log("  卷积混响节点数:", await ev(`window.__a.conv`), "（应为 1）");
  console.log("  混响出口连接数:", await ev(`window.__a.convOut`), "（应为 1，不再随播放次数增长）");
  console.log("  限幅器节点数:", await ev(`window.__a.comp`), "（应为 1）");

  // 单独看最后一档的"啊"共振峰与声带
  await ev(`document.querySelectorAll('.stop')[2].click()`); await sleep(200);
  await ev(`window.__a = { osc: [], bq: [], conv: 0, convOut: 0, comp: 0, buf: 0 }`);
  await ev(`document.querySelectorAll('.stop')[6].click()`);
  await sleep(600);
  console.log("\n最后一档的音源：");
  console.log("  sawtooth 声带:", await ev(`JSON.stringify(window.__a.osc.filter(o=>o.type==='sawtooth').map(o=>o.f))`));
  console.log("  颤音/正弦:", await ev(`JSON.stringify(window.__a.osc.filter(o=>o.type!=='sawtooth').map(o=>o.type+':'+o.f))`));
  console.log("  滤波器:", await ev(`JSON.stringify(window.__a.bq)`));

  // 人群音量
  await ev(`window.__a = { osc: [], bq: [], conv: 0, convOut: 0, comp: 0, buf: 0 }`);
  await ev(`document.getElementById('tgDanmu').click()`);
  await sleep(900);
  console.log("\n开弹幕：bufferSource", await ev(`window.__a.buf`), " 带通", await ev(`window.__a.bq.length`));
  console.log("开关状态:", await ev(`JSON.stringify({s:document.getElementById('tgSound').classList.contains('on'),d:document.getElementById('tgDanmu').classList.contains('on')})`));
  console.log("错误:", logs.length ? logs.slice(0, 6) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
