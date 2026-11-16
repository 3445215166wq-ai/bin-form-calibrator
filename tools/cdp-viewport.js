// 量一下视口大小 + 命中测试
const PORT = process.argv[2];
(async () => {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = t.find(x => x.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pend = new Map(); let id = 0;
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  await send("Runtime.enable");
  const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true })).result.value;

  console.log(await ev(`JSON.stringify({
    iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
    sy: scrollY, docH: document.documentElement.scrollHeight,
    stopsTop: Math.round(document.getElementById('stops').getBoundingClientRect().top),
    btnTop: Math.round(document.querySelector('.controls').getBoundingClientRect().top)
  })`));
  console.log("at(228,593):", await ev(`(function(){var e=document.elementFromPoint(228,593);return e?e.tagName+"."+e.className:"null"})()`));
  console.log("at(228,300):", await ev(`(function(){var e=document.elementFromPoint(228,300);return e?e.tagName+"."+e.className:"null"})()`));
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
