// 检测"开局闪错档位"：页面切到视频模式的那一刻，currentTime 是不是已经在目标档位
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

  // 在页面加载前注入采样器：每 16ms 记录一次 state，抓住第一次进入 video 模式的瞬间
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__samples = [];
      const t0 = performance.now();
      const timer = setInterval(() => {
        const st = document.getElementById('stage');
        const v = document.getElementById('vid');
        if (!st || !v) return;
        const hasVideo = st.classList.contains('video');
        window.__samples.push({ dt: Math.round(performance.now() - t0), hasVideo, t: +(v.currentTime || 0).toFixed(2), rs: v.readyState });
        if (window.__samples.length > 400) clearInterval(timer);
      }, 16);
    `
  });

  await send("Page.navigate", { url: BASE });
  await sleep(3000);

  const r = await send("Runtime.evaluate", { expression: `(() => {
    const s = window.__samples || [];
    const firstVideo = s.find(x => x.hasVideo);
    const before = s.filter(x => !x.hasVideo).slice(-3);
    return JSON.stringify({ total: s.length, firstVideo, before }, null, 1);
  })()`, returnByValue: true });
  console.log(r.result.value);
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
