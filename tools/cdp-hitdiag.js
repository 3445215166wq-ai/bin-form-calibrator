// 诊断：真实鼠标事件到底落在哪个元素上
const PORT = process.argv[2], BASE = process.argv[3];
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
  const mouse = (type, x, y, extra) => send("Input.dispatchMouseEvent", Object.assign({
    type, x, y, button: type === "mouseReleased" ? "none" : "left",
    buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1
  }, extra || {}));

  await send("Page.navigate", { url: BASE });
  await sleep(2600);

  await ev(`window.__log = [];
    ['pointerdown','mousedown','mouseup','click'].forEach(function(k){
      document.addEventListener(k, function(e){
        var el = e.target;
        window.__log.push(k + ':' + (el.tagName||'?') + '.' + (el.className && el.className.baseVal === undefined ? el.className : '') + (el.querySelector && el.querySelector('.num') ? '[#'+el.querySelector('.num').textContent+']' : ''));
      }, true);
    }); 'ok'`);

  const rect = JSON.parse(await ev(`(function(){
    var s=document.querySelectorAll('.stop')[4];
    var r=s.getBoundingClientRect();
    return JSON.stringify({x:r.x+r.width/2, y:r.y+r.height/2, top:r.top, h:r.height});
  })()`));
  console.log("第 5 格中心:", rect);

  await mouse("mouseMoved", rect.x, rect.y);
  await mouse("mousePressed", rect.x, rect.y);
  await sleep(60);
  await mouse("mouseReleased", rect.x, rect.y);
  await sleep(500);
  console.log("事件序列:", await ev(`JSON.stringify(window.__log)`));
  console.log("结果:", await ev(`document.getElementById('pct').textContent + ' ' + document.getElementById('tname').textContent`));
  console.log("elementFromPoint:", await ev(`(function(){
    var el=document.elementFromPoint(${rect.x}, ${rect.y});
    return el ? el.tagName + '.' + (el.className||'') : 'null';
  })()`));
  ws.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
