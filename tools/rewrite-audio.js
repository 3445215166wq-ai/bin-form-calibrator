// 重写音效区块：加总输出总线（限幅 + 总音量）、修混响叠加 bug、加人声"啊"
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "index.html");
const L = fs.readFileSync(file, "utf8").split("\n");

// 1) 定位并替换「圣殿混响 + holyHah + blip」整块
const s = L.findIndex(l => l.includes("圣殿混响：现场造一段脉冲响应"));
const e = L.findIndex((l, i) => i > s && l.trim() === "}" && L[i - 1].includes("osc.stop(t0 + 0.14)"));
if (s < 0 || e < 0) throw new Error("定位失败 s=" + s + " e=" + e);
console.log("替换音频主区块：", s + 1, "~", e + 1, "行");

const block = `  /* ================= 音频总线（所有声音都从这里出） =================
     ① 总限幅 + 总音量：防止任何一路声音叠起来爆音
     ② 圣殿混响只建一次：以前每次播放都往同一个缓存卷积节点上挂一条新的湿声通路，
        连接会不断累加 —— 表现就是"声音越来越大"。现在改成一条常驻混响总线，
        每次播放只是往它的输入端送信号，增益只算一次。 */
  let bus = null;
  function masterBus(ac) {
    if (bus) return bus;
    const input = ac.createGain(); input.gain.value = 1;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 14;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    const out = ac.createGain(); out.gain.value = 0.5;      /* 总音量 */
    input.connect(comp); comp.connect(out); out.connect(ac.destination);
    bus = { input: input, comp: comp, out: out };
    return bus;
  }

  let rvBus = null;
  function reverbBus(ac) {
    if (rvBus) return rvBus;
    const len = Math.floor(ac.sampleRate * 2.4);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
      }
    }
    const conv = ac.createConvolver();
    conv.buffer = ir;
    conv.normalize = true;
    const wet = ac.createGain(); wet.gain.value = 0.4;
    conv.connect(wet); wet.connect(masterBus(ac).input);
    rvBus = { conv: conv, wet: wet };
    return rvBus;
  }

  /* 最后一档（贾科斯）：**圣光「啊——」**
     真正的"人声啊"用共振峰合成：锯齿波声带（带 5Hz 颤音）→ 三个并联带通共振峰
     （F1 730 / F2 1090 / F3 2440，就是元音 /a/ 的频谱包络）→ 混响。 */
  function holyHah() {
    const ac = audioCtx();
    if (!ac) return;
    const B = masterBus(ac), R = reverbBus(ac);
    const t0 = ac.currentTime;
    const DUR = 2.2;

    const out = ac.createGain(); out.gain.value = 1;
    const dry = ac.createGain(); dry.gain.value = 0.5;
    out.connect(dry); dry.connect(B.input);
    out.connect(R.conv);                       /* 只送一路进常驻混响 */

    /* 元音共振峰：三路并联，输出相加 */
    const vowel = ac.createGain(); vowel.gain.value = 1;
    [[730, 7, 1.0], [1090, 9, 0.5], [2440, 11, 0.22]].forEach(p => {
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = p[0]; bp.Q.value = p[1];
      const g = ac.createGain(); g.gain.value = p[2];
      vowel.connect(bp); bp.connect(g); g.connect(out);
    });

    /* 颤音：5.2Hz，±5Hz 加到每个声带的频率上，像人唱长音 */
    const vib = ac.createOscillator();
    vib.type = "sine"; vib.frequency.value = 5.2;
    const vibAmt = ac.createGain(); vibAmt.gain.value = 5;
    vib.connect(vibAmt);
    vib.start(t0); vib.stop(t0 + DUR);

    /* 声带：F3 / A3 / C4（比原来低一个八度，更像人声） */
    [174.61, 220.0, 261.63].forEach((f, i) => {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      vibAmt.connect(o.frequency);
      const g = ac.createGain();
      const peak = 0.075;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.20 + i * 0.05);
      g.gain.setValueAtTime(peak, t0 + 0.80);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + DUR);
      o.connect(g); g.connect(vowel);
      o.start(t0); o.stop(t0 + DUR + 0.05);
    });

    /* 底下垫一层很轻的正弦和弦，给厚度（不进共振峰，保持干净） */
    [349.23, 523.25].forEach(f => {
      const o = ac.createOscillator();
      o.type = "sine"; o.frequency.value = f;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.016, t0 + 0.3);
      g.gain.setValueAtTime(0.016, t0 + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + DUR);
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + DUR);
    });

    /* 顶部闪光 */
    [1568.0, 2093.0].forEach(f => {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f, t0 + 0.06);
      o.frequency.linearRampToValueAtTime(f * 1.012, t0 + DUR);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.007, t0 + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + DUR * 0.92);
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + DUR);
    });
  }

  /* 档位音阶：音高随档位递增；最后一档换圣光「啊」 */
  function blip(tier) {
    if (!pref.sound) return;
    const ac = audioCtx();
    if (!ac) return;
    if (tier === N - 1) { holyHah(); return; }
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "triangle";
    const f0 = 174 * Math.pow(2, tier / 7);
    osc.frequency.setValueAtTime(f0, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    osc.connect(g); g.connect(masterBus(ac).input);
    osc.start(t0);
    osc.stop(t0 + 0.14);
  }`;

L.splice(s, e - s + 1, ...block.split("\n"));

// 2) 人群音量调低 + 接到总总线
const out = [];
for (let i = 0; i < L.length; i++) {
  let l = L[i];
  if (l.includes("const CROWD_VOL = 0.055;")) l = l.replace("0.055", "0.028");
  if (l.includes("master.connect(ac.destination);")) l = l.replace("master.connect(ac.destination);", "master.connect(masterBus(ac).input);");
  if (l.includes("osc.connect(g); g.connect(ac.destination);")) l = l.replace("ac.destination", "masterBus(ac).input").replace("ac.destination", "masterBus(ac).input");
  out.push(l);
}
fs.writeFileSync(file, out.join("\n"), "utf8");
console.log("已写回 index.html");
