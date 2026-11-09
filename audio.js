/* Web Audio synthesizer for the Euler's Disk rolling-rim acoustic chirp. */
let audioCtx = null,
  masterGain = null,
  voiceGain = null,
  subOsc = null,
   metallicOsc = null,
  formantFilter = null,
  metallicWave = null,
  soundEnabled = true,
  snapPlayed = false;

function ensureAudio() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  if (!audioCtx) {
    audioCtx = new C();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.22;
    masterGain.connect(audioCtx.destination);

    voiceGain = audioCtx.createGain();
    voiceGain.gain.value = 0;

    formantFilter = audioCtx.createBiquadFilter();
    formantFilter.type = "peaking";
    formantFilter.Q.value = 2.2;
    formantFilter.gain.value = 8;

    // Harmonic series of a rigid rim rolling on a hard plate
    const real = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
      imag = new Float32Array([0, 1.0, 0.68, 0.48, 0.32, 0.22, 0.14, 0.09, 0.05]);
    metallicWave = audioCtx.createPeriodicWave(real, imag, { disableNormalization: false });

    subOsc = audioCtx.createOscillator();
    subOsc.type = "triangle";
    metallicOsc = audioCtx.createOscillator();
    metallicOsc.setPeriodicWave(metallicWave);

    const subGain = audioCtx.createGain();
    subGain.gain.value = 0.45;
    const metalGain = audioCtx.createGain();
    metalGain.gain.value = 0.55;

    subOsc.connect(subGain).connect(formantFilter);
    metallicOsc.connect(metalGain).connect(formantFilter);
    formantFilter.connect(voiceGain).connect(masterGain);

    subOsc.start();
    metallicOsc.start();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function updateChirpAudio(sample, playing, volumePct) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  masterGain.gain.setTargetAtTime(volumePct / 100, now, 0.02);
  if (!playing || !soundEnabled || sample.collapsed) {
    voiceGain.gain.setTargetAtTime(0, now, 0.015);
    if (sample.collapsed && playing && soundEnabled && !snapPlayed) {
      snapPlayed = true;
      triggerCollapseSnap();
    }
    return;
  }
  snapPlayed = false;
  // Fundamental rattle frequency f = Ω / 2π; scale harmonics smoothly
  const f = Math.max(4, Math.min(1600, sample.freq));
  subOsc.frequency.setTargetAtTime(Math.max(24, f * 2), now, 0.012);
  metallicOsc.frequency.setTargetAtTime(Math.max(32, f * 4), now, 0.012);
  formantFilter.frequency.setTargetAtTime(Math.min(4800, 180 + f * 9), now, 0.015);
  // Acoustic radiation intensifies as the rim-table gap narrows
  const intensity = Math.min(0.45, 0.08 + 0.26 * Math.min(1, Math.sqrt(f / 45)));
  voiceGain.gain.setTargetAtTime(intensity, now, 0.015);
}

function triggerCollapseSnap() {
  if (!audioCtx || !soundEnabled) return;
  const now = audioCtx.currentTime,
    osc = audioCtx.createOscillator(),
    g = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(340, now);
  osc.frequency.exponentialRampToValueAtTime(68, now + 0.065);
  g.gain.setValueAtTime(0.32, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
  osc.connect(g).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.08);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

function silenceAudio() {
  if (!audioCtx || !voiceGain) return;
  voiceGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.012);
}
