// dist 冒烟测试：确认打包后的目录能正常跑（弹幕样式 / 开关文案 / 无报错）
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
  const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true })).result.value;

  await send("Page.navigate", { url: BASE });
  await sleep(2600);
  await ev("localStorage.setItem('bs.danmu','1')");
  await ev("location.reload()");
  await sleep(4200);

  console.log("标题:", await ev("document.querySelector('h1').textContent"));
  console.log("当前档:", await ev("document.getElementById('tname').textContent"));
  console.log("弹幕数:", await ev("document.querySelectorAll('#danmu span').length"));
  console.log("开关:", await ev("Array.from(document.querySelectorAll('.tg')).map(function(b){return b.textContent.trim();}).join(' | ')"));
  console.log("视频就绪:", await ev("(function(){var v=document.getElementById('vid');return v.readyState>=2;})()"));
  console.log("控制台错误:", logs.length ? logs.slice(0, 4) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
