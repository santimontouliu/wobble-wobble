/* Demand-driven 3D stage & scientific plots with offscreen caching. */
const canvasIds = ["stage", "chirpPlot", "energyPlot"];
const canvases = canvasIds.map((id) => $(id));
const contexts = new Map(canvases.map((c) => [c.id, c.getContext("2d")]));
const visibleCanvases = new Set(canvasIds);
const stageBgCanvas = document.createElement("canvas"), stageBgCtx = stageBgCanvas.getContext("2d");

let dirty = { stage: true, chirpPlot: true, energyPlot: true }, rafId = 0, lastFrameTime = 0, stageBgKey = "";

function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; lastFrameTime = 0; }
function scheduleRender() {
  if (rafId || document.hidden) return;
  if ((playing && visibleCanvases.size > 0) || [...visibleCanvases].some((id) => dirty[id])) {
    rafId = requestAnimationFrame(frame);
  }
}
function invalidateAll() {
  dirty.stage = dirty.chirpPlot = dirty.energyPlot = true;
  drawAllDirty();
  scheduleRender();
}

const resizeObserver = new ResizeObserver((entries) => {
  for (const { target: c } of entries) {
    const b = c.getBoundingClientRect(), d = devicePixelRatio || 1;
    const w = Math.round(b.width * d), h = Math.round(b.height * d);
    if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) {
      c.width = w; c.height = h; dirty[c.id] = true;
    }
  }
  scheduleRender();
});
canvases.forEach((c) => resizeObserver.observe(c));

document.addEventListener("contentvisibilityautostatechange", (e) => {
  const t = e.target, c = t && (t.tagName === "CANVAS" ? t : t.querySelector && t.querySelector("canvas"));
  if (c && dirty[c.id] !== undefined) {
    if (e.skipped) visibleCanvases.delete(c.id);
    else { visibleCanvases.add(c.id); dirty[c.id] = true; }
    scheduleRender();
  }
}, { capture: true });

if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { visibleCanvases.add(e.target.id); dirty[e.target.id] = true; }
      else visibleCanvases.delete(e.target.id);
    }
    scheduleRender();
  }, { rootMargin: "200px" });
  canvases.forEach((c) => io.observe(c));
}
document.addEventListener("visibilitychange", scheduleRender);

function prepCanvas(id) {
  const c = $(id), ctx = contexts.get(id), d = devicePixelRatio || 1, b = c.getBoundingClientRect();
  const w = Math.max(200, b.width || c.clientWidth || 600);
  const h = Math.max(150, b.height || c.clientHeight || (id === "stage" ? 390 : 235));
  const pw = Math.round(w * d), ph = Math.round(h * d);
  if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return { ctx, w, h, d };
}

function ensureStageBackdrop(w, h, d) {
  const key = `${w}:${h}:${d}`;
  if (key === stageBgKey) return;
  stageBgKey = key;
  stageBgCanvas.width = Math.round(w * d); stageBgCanvas.height = Math.round(h * d);
  stageBgCtx.setTransform(d, 0, 0, d, 0, 0);
  const bg = stageBgCtx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#12100e"); bg.addColorStop(1, "#1e1a16");
  stageBgCtx.fillStyle = bg; stageBgCtx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.6, baseRx = Math.min(w * 0.42, 270), baseRy = baseRx * 0.36;
  const glow = stageBgCtx.createRadialGradient(cx, cy, baseRx * 0.1, cx, cy, baseRx * 1.15);
  glow.addColorStop(0, "#382f24"); glow.addColorStop(0.7, "#211c17"); glow.addColorStop(1, "#16131000");
  stageBgCtx.fillStyle = glow; stageBgCtx.beginPath();
  stageBgCtx.ellipse(cx, cy, baseRx * 1.15, baseRy * 1.15, 0, 0, Math.PI * 2); stageBgCtx.fill();
  stageBgCtx.strokeStyle = "#3d342b"; stageBgCtx.lineWidth = 1;
  for (const frac of [0.35, 0.65, 0.95]) {
    stageBgCtx.beginPath(); stageBgCtx.ellipse(cx, cy, baseRx * frac, baseRy * frac, 0, 0, Math.PI * 2); stageBgCtx.stroke();
  }
}

function drawArrow(ctx, x, y, dx, dy, color, label) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  const a = Math.atan2(dy, dx);
  ctx.beginPath(); ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - 7 * Math.cos(a - 0.4), y + dy - 7 * Math.sin(a - 0.4));
  ctx.lineTo(x + dx - 7 * Math.cos(a + 0.4), y + dy - 7 * Math.sin(a + 0.4)); ctx.fill();
  if (label) { ctx.font = "600 10px ui-monospace, monospace"; ctx.fillText(label, x + dx + 6, y + dy + 3); }
}

function drawStage() {
  const { ctx, w, h, d } = prepCanvas("stage");
  ensureStageBackdrop(w, h, d);
  ctx.drawImage(stageBgCanvas, 0, 0, w, h);
  const samp = currentSample, cx = w / 2, cy = h * 0.6, tiltCam = 0.38;
  const Rpx = Math.min(w, h) * (0.14 + (state.radiusMm - 10) * 0.0048);
  const alpha = samp.alphaRad, phi = samp.phase, zCm = Rpx * Math.sin(alpha), rProj = Rpx * Math.cos(alpha);
  const cpx = cx + rProj * Math.cos(phi), cpy = cy + rProj * Math.sin(phi) * tiltCam;

  if ($("showLocus").checked) {
    ctx.strokeStyle = "#f0b35a55"; ctx.setLineDash([3, 5]); ctx.beginPath();
    ctx.ellipse(cx, cy, rProj, rProj * tiltCam, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = "#09080788"; ctx.beginPath();
  ctx.ellipse(cx, cy + 4, Rpx * 0.96, Rpx * tiltCam * Math.cos(alpha * 0.7), 0, 0, Math.PI * 2); ctx.fill();

  const dcx = cx, dcy = cy - zCm * 0.92;
  const ny = -Math.sin(alpha) * Math.sin(phi) * tiltCam + Math.cos(alpha) * 0.92;
  const rot2D = Math.atan2(Math.sin(alpha) * Math.cos(phi), Math.cos(alpha)) * 0.55;
  const minorRy = Rpx * Math.max(0.14, Math.abs(ny) * 0.42);
  const thickness = Math.max(4, Math.min(12, state.massG * 0.02 + 4));

  ctx.save(); ctx.translate(dcx, dcy); ctx.rotate(rot2D);
  ctx.fillStyle = "#7a5832"; ctx.beginPath(); ctx.ellipse(0, thickness, Rpx, minorRy, 0, 0, Math.PI * 2); ctx.fill();
  const faceGrad = ctx.createLinearGradient(-Rpx, -minorRy, Rpx, minorRy);
  faceGrad.addColorStop(0, "#ffe0a3"); faceGrad.addColorStop(0.5, "#d89b48"); faceGrad.addColorStop(1, "#8c5f25");
  ctx.fillStyle = faceGrad; ctx.strokeStyle = "#fff1cf"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(0, 0, Rpx, minorRy, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  if ($("showSpokes").checked) {
    ctx.strokeStyle = "#4d331288"; ctx.lineWidth = 1.3;
    for (let k = 0; k < 6; k++) {
      const a = samp.rimPhase + (k * Math.PI) / 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * Rpx * 0.85, Math.sin(a) * minorRy * 0.85); ctx.stroke();
    }
    const mA = samp.rimPhase;
    ctx.fillStyle = "#2b1b08"; ctx.beginPath();
    ctx.arc(Math.cos(mA) * Rpx * 0.62, Math.sin(mA) * minorRy * 0.62, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = samp.collapsed ? "#9e9589" : "#7ce8ff";
  ctx.beginPath(); ctx.arc(cpx, cpy, samp.collapsed ? 3.5 : 5, 0, Math.PI * 2); ctx.fill();

  if ($("showVectors").checked && !samp.collapsed) {
    drawArrow(ctx, dcx, dcy, 0, -Math.min(95, 22 + samp.freq * 0.45), "#7ce8ff", "Ω (precession)");
    drawArrow(ctx, cpx, cpy, 0, -48, "#f0b35a", "N");
    drawArrow(ctx, dcx, dcy, 0, 42, "#ff8570", "Mg");
  }
  ctx.fillStyle = "#bfb5a8"; ctx.font = "10px ui-monospace, monospace";
  ctx.fillText(`α = ${((alpha * 180) / Math.PI).toFixed(2)}° · f = ${samp.freq.toFixed(1)} Hz · R = ${state.radiusMm.toFixed(1)} mm`, 18, h - 16);
}

function drawPlotFrame(id, yTopLabel, yBotLabel, xLeftLabel, xRightLabel) {
  const { ctx, w, h } = prepCanvas(id), L = 46, R = w - 18, T = 18, B = h - 26;
  ctx.clearRect(0, 0, w, h); ctx.strokeStyle = "#332d27"; ctx.lineWidth = 1; ctx.beginPath();
  for (let j = 0; j <= 4; j++) { const y = T + ((B - T) * j) / 4; ctx.moveTo(L, y); ctx.lineTo(R, y); }
  ctx.stroke(); ctx.fillStyle = "#a89f93"; ctx.font = "9px ui-monospace, monospace";
  ctx.fillText(yTopLabel, 4, T + 4); ctx.fillText(yBotLabel, 4, B + 2);
  ctx.fillText(xLeftLabel, L, B + 17); ctx.fillText(xRightLabel, R - ctx.measureText(xRightLabel).width, B + 17);
  return { ctx, L, R, T, B };
}

function drawChirpPlot() {
  const mode = $("plotMode").value, tf = Math.max(0.01, trajectory.tf);
  if (mode === "loglog") {
    const { ctx, L, R, T, B } = drawPlotFrame("chirpPlot", "2.4", "0.6", "log₁₀(t_f−t) [s]", "→ Collapse");
    const xMin = -2.0, xMax = Math.max(0.5, Math.ceil(Math.log10(tf) * 2) / 2), yMin = 0.6, yMax = 2.4;
    const mapX = (lx) => L + ((xMax - lx) / (xMax - xMin)) * (R - L);
    const mapY = (ly) => B - ((ly - yMin) / (yMax - yMin)) * (B - T);
    ctx.strokeStyle = "#7ce8ff88"; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]); ctx.beginPath();
    ctx.moveTo(mapX(xMax), mapY(trajectory.logIntercept - trajectory.chirpExponent * xMax));
    ctx.lineTo(mapX(xMin), mapY(trajectory.logIntercept - trajectory.chirpExponent * xMin));
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "#f0b35a"; ctx.lineWidth = 2; ctx.beginPath();
    let started = false;
    for (let i = 0; i < trajectory.N; i++) {
      const rem = tf - trajectory.tGrid[i];
      if (rem < 0.01) continue;
      const x = mapX(Math.log10(rem)), y = mapY(Math.log10(trajectory.freqGrid[i]));
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.fillStyle = "#7ce8ff";
    ctx.fillText(`Fit: slope −n = −${trajectory.chirpExponent.toFixed(3)} · R² = ${trajectory.r2.toFixed(4)}`, L + 8, T + 14);
    return;
  }
  const fMax = Math.min(260, Math.max(40, trajectory.freqGrid[trajectory.N - 1]));
  const { ctx, L, R, T, B } = drawPlotFrame("chirpPlot", `${fMax.toFixed(0)}Hz`, "0Hz", "0 s", `t_f = ${tf.toFixed(2)} s`);
  ctx.strokeStyle = "#7ce8ff"; ctx.lineWidth = 1.4; ctx.beginPath();
  const a0 = Math.max(0.05, trajectory.alphaGrid[0]);
  for (let i = 0; i < trajectory.N; i++) {
    const x = L + (trajectory.tGrid[i] / tf) * (R - L), y = B - (trajectory.alphaGrid[i] / a0) * (B - T);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = "#f0b35a"; ctx.lineWidth = 1.9; ctx.beginPath();
  for (let i = 0; i < trajectory.N; i++) {
    const x = L + (trajectory.tGrid[i] / tf) * (R - L), y = B - (Math.min(fMax, trajectory.freqGrid[i]) / fMax) * (B - T);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  const px = L + Math.min(1, simTime / tf) * (R - L);
  ctx.strokeStyle = "#ffffff66"; ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, B); ctx.stroke();
}

function drawEnergyPlot() {
  const tf = Math.max(0.01, trajectory.tf), eMax = Math.max(0.1, trajectory.peGrid[0] + trajectory.keGrid[0]);
  const { ctx, L, R, T, B } = drawPlotFrame("energyPlot", `${eMax.toFixed(1)}mJ`, "0mJ", "0 s", `${tf.toFixed(2)} s`);
  for (const [arr, color] of [[trajectory.peGrid, "#f0b35a"], [trajectory.keGrid, "#ff8570"]]) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.7; ctx.beginPath();
    for (let i = 0; i < trajectory.N; i++) {
      const x = L + (trajectory.tGrid[i] / tf) * (R - L), y = B - (arr[i] / eMax) * (B - T);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  const px = L + Math.min(1, simTime / tf) * (R - L);
  ctx.strokeStyle = "#ffffff66"; ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, B); ctx.stroke();
}

function drawAllDirty() {
  if (dirty.stage && visibleCanvases.has("stage")) { drawStage(); dirty.stage = false; }
  if (dirty.chirpPlot && visibleCanvases.has("chirpPlot")) { drawChirpPlot(); dirty.chirpPlot = false; }
  if (dirty.energyPlot && visibleCanvases.has("energyPlot")) { drawEnergyPlot(); dirty.energyPlot = false; }
}

function frame(now) {
  rafId = 0;
  if (document.hidden) return;
  if (playing) {
    const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.05) : 0;
    simTime += dt * +$("rate").value;
    if (simTime >= trajectory.tf) {
      simTime = trajectory.tf; playing = false;
      $("spinBtn").textContent = "↺ Spin again";
      $("status").textContent = "Collapsed flat · singularity reached";
    }
    currentSample = sampleTrajectory(trajectory, simTime);
    updateReadouts();
    updateChirpAudio(currentSample, playing, +$("volume").value);
    dirty.stage = dirty.chirpPlot = dirty.energyPlot = true;
  }
  lastFrameTime = now;
  drawAllDirty();
  if (playing) rafId = requestAnimationFrame(frame);
}

rebuildSimulation(true);
renderTrials();
