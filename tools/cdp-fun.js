// 验证新加的搞耍功能：弹幕开关 / 隐藏档 / 海报 / 音效上下文
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
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push("ERR: " + m.params.args.map(a => a.value ?? a.description).join(" "));
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  });
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async x => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails ? ("EXC:" + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)) : r.result.value;
  };

  await send("Page.navigate", { url: BASE });
  await sleep(2500);

  console.log("初始开关状态:", await ev(`JSON.stringify({
    sound: document.getElementById('tgSound').classList.contains('on'),
    danmu: document.getElementById('tgDanmu').classList.contains('on')
  })`));

  // 开弹幕
  await ev(`document.getElementById('tgDanmu').click()`);
  await sleep(1800);
  console.log("开弹幕后弹幕条数:", await ev(`document.querySelectorAll('#danmu span').length`));

  // 拖到最后一档，检查音效/震动钩子没报错
  await ev(`(() => { const k=document.getElementById('knob'); k.focus();
    for (let i=0;i<12;i++) k.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})); })()`);
  await sleep(600);
  console.log("当前档:", await ev(`document.getElementById('tname').textContent`));

  // 隐藏档：键盘敲 bin
  for (const k of ["b","i","n"]) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: "Key" + k.toUpperCase(), text: k });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: "Key" + k.toUpperCase() });
    await sleep(60);
  }
  await sleep(400);
  console.log("隐藏档是否弹出:", await ev(`document.getElementById('secret').classList.contains('on')`));
  console.log("隐藏档期间弹幕:", await ev(`document.querySelectorAll('#danmu span').length`));
  await sleep(5600);
  console.log("隐藏档自动关闭:", await ev(`!document.getElementById('secret').classList.contains('on')`));

  // 海报（file:// 下预期被浏览器拦，看是否优雅提示）
  await ev(`document.getElementById('btnPoster').click()`);
  await sleep(1200);
  console.log("海报结果提示:", await ev(`document.getElementById('toast').textContent`));

  console.log("控制台错误:", logs.length ? logs.slice(0, 6) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
