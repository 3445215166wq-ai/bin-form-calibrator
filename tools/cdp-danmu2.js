// 长时间统计弹幕样式分布，确认每种样式都真的会出现
const PORT = process.argv[2], BASE = process.argv[3];
const DUR = Number(process.argv[4] || 24000);
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
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push("ERR: " + m.params.args.map(a => a.value ?? a.description).join(" "));
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  });
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? ("EXC:" + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)) : r.result.value;
  };

  await send("Page.navigate", { url: BASE + "?t=5" });
  await sleep(2500);
  await ev(`localStorage.removeItem('bs.danmu'); location.reload()`);
  await sleep(2500);
  await ev(`(() => { const g = document.getElementById('tgDanmu'); if (!g.classList.contains('on')) g.click(); return g.classList.contains('on'); })()`);
  await sleep(300);

  // 在页面内直接统计：拦截 appendChild，记录每次生成的样式
  await ev(`(() => {
    window.__stats = { cls:{}, anim:{}, col:{}, total:0, maxAlive:0 };
    const layer = document.getElementById('danmu');
    const orig = layer.appendChild.bind(layer);
    layer.appendChild = node => {
      const r = orig(node);
      // 计算样式必须等元素真的挂进文档后再读
      requestAnimationFrame(() => {
        const cs = getComputedStyle(node);
        const k = node.className || 'plain';
        window.__stats.cls[k] = (window.__stats.cls[k]||0)+1;
        window.__stats.anim[cs.animationName] = (window.__stats.anim[cs.animationName]||0)+1;
        const c = cs.color; window.__stats.col[c] = (window.__stats.col[c]||0)+1;
        window.__stats.total++;
        window.__stats.maxAlive = Math.max(window.__stats.maxAlive, layer.childElementCount);
      });
      return r;
    };
    return 'hooked';
  })()`);

  await sleep(DUR);
  const st = await ev(`JSON.stringify(window.__stats)`);
  const o = JSON.parse(st);
  console.log("总生成条数:", o.total, "| 同屏峰值:", o.maxAlive);
  console.log("样式分布:", JSON.stringify(o.cls));
  console.log("动画分布:", JSON.stringify(o.anim));
  console.log("颜色种类:", Object.keys(o.col).length);
  console.log("控制台错误:", logs.length ? logs.slice(0, 6) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
