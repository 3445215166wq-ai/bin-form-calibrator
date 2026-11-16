// 用 CDP 驱动真实时序的 Chrome 截图（避免 virtual-time 的光栅化竞态）
const fs = require("fs");

const PORT = process.argv[2] || "9333";
const BASE = process.argv[3];
const OUT = process.argv[4] || "_s";
const points = (process.argv[5] || "0,25,50,75,100").split(",");
const waitMs = +(process.argv[6] || 1600);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  let targets;
  for (let i = 0; i < 30; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (targets.some(t => t.type === "page")) break;
    } catch { }
    await sleep(300);
  }
  const page = targets.find(t => t.type === "page");
  if (!page) throw new Error("no page target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });

  await send("Page.enable");
  await send("Runtime.enable");

  fs.mkdirSync(OUT, { recursive: true });

  for (const p of points) {
    const sep = BASE.includes("?") ? "&" : "?";
    const url = `${BASE}${sep}p=${p}`;
    await send("Page.navigate", { url });
    await sleep(waitMs);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = `${OUT}/c${p}.png`;
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));

    // 顺便回报页面真实状态，避免"看着有图其实没图"
    const st = await send("Runtime.evaluate", {
      expression: `(() => {
        const imgs=[...document.querySelectorAll('#layers img')];
        const stage=document.getElementById('stage');
        return JSON.stringify({
          status: document.getElementById('status').textContent,
          tag: document.getElementById('tag').textContent,
          mode: stage.dataset.mode || (stage.classList.contains('video') ? 'video' : 'images'),
          frame: stage.dataset.frame || null,
          imgs: imgs.length,
          visible: imgs.filter(i => +i.style.opacity > 0.01).map(i => i.src.split('/').pop() + '@' + i.style.opacity)
        });
      })()`,
      returnByValue: true
    });
    console.log(`p=${p}`, "->", st.result.value);
  }
  ws.close();
}

main().catch(e => { console.error("ERR", e.message); process.exit(1); });
