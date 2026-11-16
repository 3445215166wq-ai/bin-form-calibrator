// 验证：分享预览弹层 / 二维码 / 确认后才保存 / 海报已移除
const fs = require("fs");
const path = require("path");
const PORT = process.argv[2], BASE = process.argv[3], OUT = process.argv[4] || "_sh";
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
  const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;
  fs.mkdirSync(OUT, { recursive: true });
  const shot = async n => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, n), Buffer.from(s.data, "base64"));
  };

  const dl = path.resolve(OUT, "dl");
  fs.rmSync(dl, { recursive: true, force: true });
  fs.mkdirSync(dl, { recursive: true });
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dl });

  await send("Page.navigate", { url: BASE + "?t=6" });
  await sleep(3000);

  console.log("按钮:", await ev(`Array.from(document.querySelectorAll('.controls .btn')).map(b=>b.textContent.trim()).join(' | ')`));
  console.log("弹层初始:", await ev(`document.getElementById('sheet').classList.contains('on')`));

  await ev(`document.getElementById('btnShare').click()`);
  await sleep(900);
  console.log("点分享后 —— 弹层:", await ev(`document.getElementById('sheet').classList.contains('on')`));
  console.log("  预览里有没有 canvas:", await ev(`!!document.querySelector('#sheetPv canvas')`));
  console.log("  网址框:", await ev(`document.getElementById('sheetUrl').value`));
  console.log("  此时有没有偷偷下载:", (fs.readdirSync(dl).length ? fs.readdirSync(dl) : "没有（正确）") + "");
  await shot("sheet.png");

  // 取消 → 不应下载
  await ev(`document.getElementById('sheetCancel').click()`);
  await sleep(600);
  console.log("点取消后 —— 弹层:", await ev(`document.getElementById('sheet').classList.contains('on')`), "| 下载:", fs.readdirSync(dl).length);

  // 再打开 → 保存
  await ev(`document.getElementById('btnShare').click()`);
  await sleep(900);
  await ev(`document.getElementById('sheetSave').click()`);
  await sleep(2000);
  console.log("点保存后 —— 弹层:", await ev(`document.getElementById('sheet').classList.contains('on')`), "| 下载:", fs.readdirSync(dl));
  console.log("  toast:", await ev(`document.getElementById('toast').textContent`));

  // Esc 关闭
  await ev(`document.getElementById('btnShare').click()`);
  await sleep(700);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await sleep(400);
  console.log("Esc 关闭:", await ev(`!document.getElementById('sheet').classList.contains('on')`));

  console.log("错误:", logs.length ? logs.slice(0, 5) : "（无）");
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
