// 验证视频拖动模式：currentTime 是否跟手、位置是否真的变、拖拽帧率
// 注意：不要用 Emulation.setDeviceMetricsOverride 改 DPR——它会让 CDP 的鼠标坐标
// 与页面 CSS 坐标错位，测出来的是"什么都没发生"的假数据。
const fs = require("fs");
const PORT = process.argv[2] || "9380";
const BASE = process.argv[3];
const OUT = process.argv[4] || "_s";

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  const send = (m, p = {}) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method: m, params: p }));
  });
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });
  await send("Page.enable"); await send("Runtime.enable");

  const ev = async e => {
    const r = await send("Runtime.evaluate", { expression: e, returnByValue: true });
    if (r.exceptionDetails) return "EXC:" + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
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
  await sleep(2600);

  for (let i = 0; i < 40; i++) {
    if (await ev(`document.getElementById('stage').classList.contains('video')`)) break;
    await sleep(150);
  }
  console.log("环境:", await ev(`JSON.stringify({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight })`));
  console.log("模式:", await ev(`JSON.stringify({
    cls: document.getElementById('stage').className,
    dur: document.getElementById('vid').duration,
    cv: document.getElementById('cv').width + 'x' + document.getElementById('cv').height
  })`));

  const geo = JSON.parse(await ev(`(() => {
    const r = document.getElementById('rheostat').getBoundingClientRect();
    return JSON.stringify({ rx: r.x, rw: r.width, ry: r.y + r.height/2, bottom: r.bottom, vh: innerHeight });
  })()`));
  console.log("滑条:", geo);
  if (geo.ry > geo.vh) { console.log("!! 滑条在视口外，测试无效"); process.exit(2); }

  const dur = +await ev(`document.getElementById('vid').duration`);
  const anchorsRaw = await ev(`document.getElementById('stage').dataset.anchors || ''`);
  const anchors = anchorsRaw && anchorsRaw !== "linear" ? anchorsRaw.split(",").map(Number) : null;
  console.log("视频时长:", dur, "s", "锚点:", anchors ? anchors.join(" / ") : "线性等分");

  /* 逐点点击，断言 p 与 currentTime 真的变 */
  const tierTargets = [0, 25, 50, 75, 100];
  let bad = 0;
  for (let i = 0; i < tierTargets.length; i++) {
    const target = tierTargets[i];
    const x = geo.rx + 18 + (geo.rw - 36) * target / 100;
    await mouse("mousePressed", x, geo.ry);
    await mouse("mouseReleased", x, geo.ry);
    await sleep(450);
    const st = JSON.parse(await ev(`JSON.stringify({
      pct: document.getElementById('pct').textContent,
      t: +document.getElementById('vid').currentTime.toFixed(3),
      name: document.getElementById('tname').textContent
    })`));
    const expectT = anchors ? anchors[i] : +(dur * target / 100).toFixed(2);
    const okP = st.pct === target + "%";
    const okT = Math.abs(st.t - expectT) < 0.15;
    if (!okP || !okT) bad++;
    console.log(`点 ${String(target).padStart(3)}% -> pct=${st.pct} t=${st.t}s (期望≈${expectT}s) ${okP && okT ? "OK" : "❌"} ${st.name}`);
    await shot(`v${target}.png`);
  }

  /* 拖拽帧率（同时断言 currentTime 在跟） */
  await ev(`(() => { window.__frames=[]; window.__rec=true;
    (function loop(t){ if(!window.__rec) return; window.__frames.push(t); requestAnimationFrame(loop); })(performance.now()); return 1; })()`);
  await sleep(220);

  const span = geo.rw - 36;
  const startX = geo.rx + 18;
  await mouse("mousePressed", startX, geo.ry);
  const times = [];
  for (let i = 1; i <= 110; i++) {
    const x = geo.rx + 18 + span * (i / 110);
    await mouse("mouseMoved", x, geo.ry);
    await sleep(9);
    if (i % 20 === 0) times.push(await ev(`+document.getElementById('vid').currentTime.toFixed(2)`));
  }
  await shot("v-drag.png");
  await mouse("mouseReleased", geo.rx + 18 + span, geo.ry);
  await sleep(250);

  const stats = JSON.parse(await ev(`(() => {
    window.__rec = false;
    const f = window.__frames, d = [], slow = [];
    for (let i = 1; i < f.length; i++) { const v = f[i]-f[i-1]; d.push(v); if (v > 20) slow.push(i+':'+v.toFixed(0)); }
    const s = d.slice().sort((a,b)=>a-b);
    const q = p => s[Math.min(s.length-1, Math.floor(s.length*p))];
    return JSON.stringify({ frames: d.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length-1].toFixed(1), over20: slow.length, slowAt: slow.slice(0,5) });
  })()`));
  console.log("拖拽中 currentTime 采样:", times.join(" -> "));
  console.log("拖拽帧率:", stats);
  console.log(bad === 0 ? "全部档位校验通过" : `有 ${bad} 个档位没对齐`);
  ws.close();
}
main().catch(e => { console.error("ERR", e.message); process.exit(1); });
