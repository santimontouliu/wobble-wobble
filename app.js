const elCache = new Map();
const $ = (id) => {
  if (!elCache.has(id)) elCache.set(id, document.getElementById(id));
  return elCache.get(id);
};

let state = { preset: "euler", radiusMm: 37.5, massG: 400, alpha0Deg: 18, rollingLoss: 0.35, airLoss: 0.25 };
let trajectory = simulateTrajectory(state), simTime = 0, currentSample = sampleTrajectory(trajectory, 0), playing = false, trialRows = [];

const sliderMap = [
  ["radius", "radiusMm", (v) => v.toFixed(1) + " mm"],
  ["mass", "massG", (v) => v.toFixed(0) + " g"],
  ["alpha0", "alpha0Deg", (v) => v.toFixed(1) + "°"],
  ["rollingLoss", "rollingLoss", (v) => v.toFixed(2) + "×"],
  ["airLoss", "airLoss", (v) => v.toFixed(2) + "×"]
];

function rebuildSimulation(keepPreset = false) {
  if (!keepPreset) state.preset = null;
  playing = false;
  simTime = 0;
  trajectory = simulateTrajectory(state);
  currentSample = sampleTrajectory(trajectory, 0);
  silenceAudio();
  $("spinBtn").textContent = "▶ Spin disk";
  $("status").textContent = `Ready · predicted collapse t_f = ${trajectory.tf.toFixed(2)} s`;
  for (const [id, key, fmt] of sliderMap) {
    $(id).value = state[key];
    $(id + "Val").textContent = fmt(state[key]);
  }
  updatePresetCard();
  updateReadouts();
  invalidateAll();
}

function updatePresetCard() {
  const p = PRESETS[state.preset];
  $("presetName").textContent = p ? p.name : "Custom specimen";
  $("presetWhy").textContent = p
    ? p.why
    : "Custom disk geometry and dissipation parameters. Compare collapse time t_f and power-law slope −n against standard specimens.";
  $("presetHear").textContent = p ? p.hear : "Listen for how changing R or surface losses shifts the starting rattle pitch and chirp duration.";
  $("presetIaTip").textContent = p ? p.iaTip : "Record this custom run in the IA Trial Table below to test your hypothesis.";
  document.querySelectorAll("[data-preset]").forEach((b) => {
    const active = b.dataset.preset === state.preset;
    b.classList.toggle("selected", active);
    b.setAttribute("aria-pressed", String(active));
  });
}

function updateReadouts() {
  const s = currentSample,
    deg = (s.alphaRad * 180) / Math.PI,
    rem = Math.max(0, trajectory.tf - s.t);
  $("readAlpha").textContent = deg.toFixed(2) + "°";
  $("readFreq").textContent = s.freq.toFixed(1) + " Hz";
  $("readOmega").textContent = `Ω = ${s.omega.toFixed(1)} rad/s`;
  $("readTf").textContent = trajectory.tf.toFixed(2) + " s";
  $("readRem").textContent = `t_f − t = ${rem.toFixed(2)} s`;
  $("readSlope").textContent = "−" + trajectory.chirpExponent.toFixed(3);
  $("readR2").textContent = `R² = ${trajectory.r2.toFixed(4)} · log-log fit`;
  $("peVal").textContent = s.pe.toFixed(2) + " mJ";
  $("keVal").textContent = s.ke.toFixed(2) + " mJ";
  $("totEVal").textContent = (s.pe + s.ke).toFixed(2) + " mJ";
  const eMax = Math.max(0.01, trajectory.peGrid[0] + trajectory.keGrid[0]);
  $("peBar").value = Math.min(100, (s.pe / eMax) * 100);
  $("keBar").value = Math.min(100, (s.ke / eMax) * 100);
  $("clock").textContent = `t = ${s.t.toFixed(2)} / ${trajectory.tf.toFixed(2)} s`;
}

for (const [id, key] of sliderMap) {
  $(id).oninput = () => {
    state[key] = +$(id).value;
    rebuildSimulation(false);
  };
}

document.querySelectorAll("[data-preset]").forEach((b) => {
  b.onclick = () => {
    const key = b.dataset.preset,
      p = PRESETS[key];
    Object.assign(state, {
      preset: key,
      radiusMm: p.radiusMm,
      massG: p.massG,
      alpha0Deg: p.alpha0Deg,
      rollingLoss: p.rollingLoss,
      airLoss: p.airLoss
    });
    rebuildSimulation(true);
  };
});

const experiments = {
  chirp: {
    preset: "euler",
    plotMode: "loglog",
    rate: "1",
    note: "Experiment 01 loaded: Notice how the curved f(t) blow-up becomes a straight line on the log₁₀(f) vs log₁₀(t_f − t) plot with slope −n."
  },
  radius: {
    preset: "euro",
    plotMode: "linear",
    rate: "0.5",
    note: "Experiment 02 loaded: Compare the 2 Euro coin (R = 12.9 mm) with the Chrome Disk (R = 37.5 mm). Smaller radius raises initial frequency (Ω ∝ R⁻¹/²). Log both trials below!"
  },
  surface: {
    preset: "damped",
    plotMode: "linear",
    rate: "1",
    note: "Experiment 03 loaded: Soft/felt surface increases rolling loss μ_r, cutting collapse time t_f dramatically and steepening the exponent n toward 1/3."
  },
  illusion: {
    preset: "medallion",
    plotMode: "linear",
    rate: "0.25",
    note: "Experiment 04 loaded: At ¼× slow motion, watch the dark dot on the disk face creep slowly at Ω(1 − cos α) while the cyan contact spark races around the rim!"
  }
};

document.querySelectorAll("[data-experiment]").forEach((b) => {
  b.onclick = () => {
    const ex = experiments[b.dataset.experiment],
      p = PRESETS[ex.preset];
    Object.assign(state, {
      preset: ex.preset,
      radiusMm: p.radiusMm,
      massG: p.massG,
      alpha0Deg: p.alpha0Deg,
      rollingLoss: p.rollingLoss,
      airLoss: p.airLoss
    });
    $("plotMode").value = ex.plotMode;
    $("rate").value = ex.rate;
    $("iaNote").textContent = ex.note;
    rebuildSimulation(true);
  };
});

$("spinBtn").onclick = () => {
  if (soundEnabled) ensureAudio();
  if (simTime >= trajectory.tf) simTime = 0;
  playing = !playing;
  $("spinBtn").textContent = playing ? "Ⅱ Pause" : "▶ Resume";
  $("status").textContent = playing ? "Spinning · rolling without slipping" : "Paused";
  updateChirpAudio(currentSample, playing, +$("volume").value);
  scheduleRender();
};

$("resetBtn").onclick = () => rebuildSimulation(Boolean(state.preset));
$("soundToggle").onchange = () => {
  soundEnabled = $("soundToggle").checked;
  if (soundEnabled && playing) ensureAudio();
  updateChirpAudio(currentSample, playing, +$("volume").value);
};
$("volume").oninput = () => {
  $("volumeOut").textContent = $("volume").value + "%";
  updateChirpAudio(currentSample, playing, +$("volume").value);
};
["showLocus", "showVectors", "showSpokes"].forEach((id) => {
  $(id).onchange = () => { dirty.stage = true; scheduleRender(); };
});
$("plotMode").onchange = () => { dirty.chirpPlot = true; scheduleRender(); };

// Direct pointer drag on stage before launch
let dragging = false, startX = 0, startY = 0, startR = 0, startA = 0;
const stageEl = $("stage");
stageEl.onpointerdown = (e) => {
  if (playing) return;
  dragging = true; startX = e.clientX; startY = e.clientY;
  startR = state.radiusMm; startA = state.alpha0Deg;
  stageEl.setPointerCapture(e.pointerId);
};
stageEl.onpointermove = (e) => {
  if (!dragging) return;
  state.radiusMm = Math.max(10, Math.min(50, +(startR + (e.clientX - startX) * 0.12).toFixed(1)));
  state.alpha0Deg = Math.max(3, Math.min(35, +(startA - (e.clientY - startY) * 0.12).toFixed(1)));
  rebuildSimulation(false);
};
stageEl.onpointerup = stageEl.onpointercancel = () => (dragging = false);

// IBDP IA Trial Logger & CSV Export
function renderTrials() {
  const tbody = $("trialBody");
  if (!trialRows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No trials logged yet. Click “+ Log current setup to IA table” to compare runs.</td></tr>`;
    return;
  }
  tbody.innerHTML = trialRows
    .map((r, i) => `<tr><td>#${i + 1}</td><td>${r.name}</td><td>${r.R} mm</td><td>${r.M} g</td><td>${r.a0}°</td><td><b>${r.tf} s</b></td><td><b>−${r.n}</b> (${r.r2})</td></tr>`)
    .join("");
}
$("logTrial").onclick = () => {
  trialRows.push({
    name: PRESETS[state.preset] ? PRESETS[state.preset].name : "Custom",
    R: state.radiusMm.toFixed(1),
    M: state.massG.toFixed(0),
    a0: state.alpha0Deg.toFixed(1),
    tf: trajectory.tf.toFixed(2),
    n: trajectory.chirpExponent.toFixed(3),
    r2: trajectory.r2.toFixed(4)
  });
  renderTrials();
};
$("clearTrials").onclick = () => { trialRows = []; renderTrials(); };

$("exportCsv").onclick = () => {
  const lines = ["time_s,time_remaining_s,tilt_deg,omega_rad_s,freq_hz,log10_rem_s,log10_freq_hz,pe_mJ,ke_mJ"];
  const step = Math.max(1, Math.floor(trajectory.N / 120));
  for (let i = 0; i < trajectory.N; i += step) {
    const t = trajectory.tGrid[i], rem = Math.max(1e-4, trajectory.tf - t), f = trajectory.freqGrid[i];
    lines.push([
      t.toFixed(4), rem.toFixed(4), ((trajectory.alphaGrid[i] * 180) / Math.PI).toFixed(3),
      trajectory.omegaGrid[i].toFixed(3), f.toFixed(3), Math.log10(rem).toFixed(4),
      Math.log10(f).toFixed(4), trajectory.peGrid[i].toFixed(4), trajectory.keGrid[i].toFixed(4)
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `euler-disk-ia-R${state.radiusMm}mm-a${state.alpha0Deg}deg.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// Accessible modal dialog with light-dismiss fallback
const guideDialog = $("guide");
$("helpBtn").onclick = () => guideDialog.showModal();
$("closeHelp").onclick = () => guideDialog.close();
if (!("closedBy" in HTMLDialogElement.prototype)) {
  guideDialog.addEventListener("click", (event) => {
    if (event.target !== guideDialog) return;
    const rect = guideDialog.getBoundingClientRect();
    if (rect.top <= event.clientY && event.clientY <= rect.top + rect.height && rect.left <= event.clientX && event.clientX <= rect.left + rect.width) return;
    guideDialog.close();
  });
}

window.addEventListener("pagehide", () => { playing = false; silenceAudio(); stopLoop(); });
rebuildSimulation(true);
renderTrials();
