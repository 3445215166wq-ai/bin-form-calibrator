// 验证弹幕样式多样性 + 震动无开关
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

  await send("Page.navigate", { url: BASE + "?t=6" });
  await sleep(2600);

  console.log("开关按钮:", await ev(`[...document.querySelectorAll('.tg')].map(b=>b.textContent.trim()).join(' | ')`));
  console.log("默认状态:", await ev(`JSON.stringify({sound:document.getElementById('tgSound').classList.contains('on'),danmu:document.getElementById('tgDanmu').classList.contains('on')})`));

  // 震动是否已不受音效开关影响
  console.log("震动钩子(音效开/关都能调):", await ev(`(() => {
    let calls = [];
    const orig = navigator.vibrate;
    navigator.vibrate = v => { calls.push(v); return true; };
    const k = document.getElementById('knob');
    k.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    document.getElementById('tgSound').click();               // 关音效
    k.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
    document.getElementById('tgSound').click();               // 开回来
    navigator.vibrate = orig;
    return JSON.stringify(calls);
  })()`));

  // 开弹幕，采样 9 秒，统计样式与配色
  await ev(`document.getElementById('tgDanmu').click()`);
  const seen = new Set(), colors = new Set(), anims = new Set();
  let maxCount = 0;
  for (let i = 0; i < 45; i++) {
    await sleep(200);
    const st = await ev(`(() => {
      const a = [...document.querySelectorAll('#danmu span')];
      return JSON.stringify({
        n: a.length,
        k: a.map(s=>s.className||'plain'),
        c: a.map(s=>getComputedStyle(s).color),
        an: a.map(s=>getComputedStyle(s).animationName)
      });
    })()`);
    const o = JSON.parse(st);
    o.k.forEach(x => seen.add(x)); o.c.forEach(x => colors.add(x)); o.an.forEach(x => anims.add(x));
    maxCount = Math.max(maxCount, o.n);
  }
  console.log("出现过的样式类:", [...seen].join(", ") || "(无)");
  console.log("出现过的动画:", [...anims].join(", ") || "(无)");
  console.log("出现过的颜色数:", colors.size, [...colors].slice(0, 8).join(" "));
  console.log("同屏最大弹幕数:", maxCount);

  // 隐藏档：骂声不应出现 top/big（否则盖字幕）
  for (const k of ["b", "i", "n"]) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: "Key" + k.toUpperCase(), text: k });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: "Key" + k.toUpperCase() });
    await sleep(50);
  }
  await sleep(1400);
  console.log("隐藏档期间:", await ev(`(() => {
    const a = [...document.querySelectorAll('#danmu span')];
    return JSON.stringify({ on: document.getElementById('secret').classList.contains('on'),
      n: a.length, bigOrTop: a.filter(s=>/big|top/.test(s.className)).length });
  })()`));
  await sleep(4600);
  console.log("隐藏档自动收起:", await ev(`!document.getElementById('secret').classList.contains('on')`));

  console.log("控制台错误:", logs.length ? logs.slice(0, 6) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
