// 打开页面，捕获控制台错误 + 报告运行状态
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
    if (m.method === "Runtime.exceptionThrown") logs.push("EXC: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === "Runtime.consoleAPICalled") logs.push("LOG[" + m.params.type + "]: " + m.params.args.map(a => a.value ?? a.description).join(" "));
    if (m.method === "Log.entryAdded") logs.push("NET[" + m.params.entry.level + "]: " + m.params.entry.text + " " + (m.params.entry.url || ""));
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true });
    if (r.exceptionDetails) return "EXC:" + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send("Page.navigate", { url: BASE });
  await sleep(3000);
  console.log("状态:", await ev(`(() => {
    const v = document.getElementById('vid'), c = document.getElementById('cv'), st = document.getElementById('stage');
    return JSON.stringify({
      cls: st.className, mode: st.dataset.mode || null,
      vid: { src: v.src.split('/').pop(), readyState: v.readyState, networkState: v.networkState,
             err: v.error ? (v.error.code + ':' + v.error.message) : null,
             dur: v.duration, t: v.currentTime, vw: v.videoWidth, vh: v.videoHeight },
      cv: c.width + 'x' + c.height,
      pct: document.getElementById('pct').textContent
    });
  })()`));
  await sleep(1500);
  console.log("日志:", logs.length ? logs.slice(0, 10) : "（无错误）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
