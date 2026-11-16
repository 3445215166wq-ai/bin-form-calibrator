const fs = require("fs");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_s";
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
  const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true })).result.value;
  const shot = async n => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${n}`, Buffer.from(s.data, "base64")); };

  // 夺冠档：偏金色弹幕
  await send("Page.navigate", { url: BASE + "?t=7" });
  await sleep(2200);
  await ev(`localStorage.setItem('bs.danmu','1'); location.reload()`);
  await sleep(3000);
  await sleep(4200);
  await shot("dm-champ.png");
  console.log("夺冠档弹幕数:", await ev(`document.querySelectorAll('#danmu span').length`));

  // 隐藏档骂声
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "b", code: "KeyB", text: "b" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "b", code: "KeyB" });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "i", code: "KeyI", text: "i" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "i", code: "KeyI" });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "n", code: "KeyN", text: "n" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "n", code: "KeyN" });
  await sleep(1600);
  await shot("dm-secret.png");
  console.log("隐藏档:", await ev(`JSON.stringify({on:document.getElementById('secret').classList.contains('on'),n:document.querySelectorAll('#danmu span').length,leak:document.querySelectorAll('#danmu span.big,#danmu span.top').length})`));
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
