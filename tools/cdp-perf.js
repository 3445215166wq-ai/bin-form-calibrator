// 模拟真实拖拽，同时测量帧间隔，量化"丝滑"
const fs = require("fs");
const PORT = process.argv[2] || "9351";
const BASE = process.argv[3];
const OUT = process.argv[4] || "_s";

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find(t => t.type === "page");
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
  // 注意：不要用 Emulation.setDeviceMetricsOverride 改 DPR——它会让鼠标坐标和页面坐标错位。
  // 要测 2 倍屏请用 --force-device-scale-factor=2 + 双倍窗口尺寸启动。

  const evalJS = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;
  const shot = async name => {
    const s = await send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, "base64"));
  };
  const mouse = (type, x, y) => send("Input.dispatchMouseEvent", {
    type, x, y, button: type === "mouseReleased" ? "none" : "left",
    buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1
  });

  await send("Page.navigate", { url: BASE });
  await sleep(2200);

  /* headless 的视口可能只有两三百像素高，滑条在视口外的话鼠标根本点不到（会静默变成"没拖"）。
     先把它滚进可视区再测。 */
  await evalJS(`window.scrollBy(0, document.getElementById('rheostat').getBoundingClientRect().top - 60)`);
  await sleep(250);

  console.log("初始:", await evalJS(`JSON.stringify({
    src: [...document.querySelectorAll('#layers img')].map(i => i.src.split('/').pop()),
    natural: [...document.querySelectorAll('#layers img')].map(i => i.naturalWidth),
    vis: [...document.querySelectorAll('#layers img')].map(i => i.style.visibility || 'visible')
  })`));

  const geo = JSON.parse(await evalJS(`(() => {
    const k = document.getElementById('knob').getBoundingClientRect();
    const r = document.getElementById('rheostat').getBoundingClientRect();
    return JSON.stringify({ kx: k.x + k.width/2, ky: k.y + k.height/2, rx: r.x, rw: r.width });
  })()`));

  // 装帧率探针
  await evalJS(`(() => {
    window.__frames = []; window.__rec = true;
    (function loop(t){ if(!window.__rec) return; window.__frames.push(t); requestAnimationFrame(loop); })(performance.now());
    return 1;
  })()`);
  await sleep(250);                     // 让探针先稳定几帧

  // 先慢后快地来回拖
  await mouse("mousePressed", geo.kx, geo.ky);
  const span = geo.rw - 36;
  const steps = 120;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const x = geo.rx + 18 + span * (0.5 - 0.5 * Math.cos(k * Math.PI * 4)); // 来回两趟
    await mouse("mouseMoved", x, geo.ky);
    await sleep(9);
  }
  const midShot = await shot("perf-mid.png");
  await mouse("mouseReleased", geo.rx + 18 + span * 0.02, geo.ky);
  await sleep(300);

  const stats = JSON.parse(await evalJS(`(() => {
    window.__rec = false;
    const f = window.__frames;
    const d = [], slow = [];
    for (let i = 1; i < f.length; i++) {
      const v = f[i] - f[i-1];
      d.push(v);
      if (v > 20) slow.push(i + ":" + v.toFixed(0) + "ms");
    }
    const s = d.slice().sort((a,b)=>a-b);
    const q = p => s[Math.min(s.length-1, Math.floor(s.length*p))];
    return JSON.stringify({
      frames: d.length,
      fps: +(1000 / (d.reduce((a,b)=>a+b,0)/d.length)).toFixed(1),
      median: +q(0.5).toFixed(1),
      p95: +q(0.95).toFixed(1),
      max: +s[s.length-1].toFixed(1),
      over20ms: slow.length,
      slowAt: slow.slice(0, 6)
    });
  })()`));
  console.log("拖拽帧率:", stats);

  // 松手后是否停在原地（不该吸附回去）
  const landed = await evalJS(`document.getElementById('pct').textContent + ' / ' + document.getElementById('tname').textContent`);
  console.log("松手位置:", landed);
  await shot("perf-end.png");
  ws.close();
}
main().catch(e => { console.error("ERR", e.message); process.exit(1); });
