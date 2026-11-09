/* Rigid-body rolling disk dynamics (Moffatt / rolling-contact hybrid model). */
const G = 9.80665;
const ALPHA_MIN_RAD = (0.38 * Math.PI) / 180; // Rim-flat collapse threshold (~0.38°)

function omegaFromAlpha(alphaRad, radiusM) {
  const s = Math.max(1e-4, Math.sin(alphaRad)),
    c = Math.cos(alphaRad);
  return Math.sqrt((4 * G) / (radiusM * s * (1 + 5 * c)));
}

function energiesFromAlpha(alphaRad, radiusM, massKg) {
  const s = Math.max(1e-4, Math.sin(alphaRad)),
    c = Math.cos(alphaRad),
    pe = massKg * G * radiusM * s,
    ke = (massKg * G * radiusM * s * (1 + c)) / (2 * (1 + 5 * c));
  return { pe, ke, total: pe + ke };
}

function dissipationRate(alphaRad, params) {
  const s = Math.max(1e-3, Math.sin(alphaRad)),
    massKg = params.massG / 1000,
    radiusM = params.radiusMm / 1000,
    inertiaScale = Math.pow(0.015 / massKg, 0.36) * Math.pow(0.018 / radiusM, 0.25),
    scale = massKg * G * radiusM * inertiaScale;
  // Rolling friction scales as α^(-1/2); thin-gap viscous air layer scales as α^(-2)
  const rollPower = 0.018 * params.rollingLoss * scale * Math.pow(s, -0.5);
  const airPower = 0.00018 * params.airLoss * scale * Math.pow(s, -2.0) * Math.pow(radiusM / 0.025, 0.5);
  return { rollPower, airPower, totalPower: rollPower + airPower };
}

function dAlphaDt(alphaRad, params) {
  const massKg = params.massG / 1000,
    radiusM = params.radiusMm / 1000,
    c = Math.cos(alphaRad),
    denom = 1 + 5 * c,
    // dE/dα = MgR * [cos α + (cos 2α + 5 cos α) / (2 * (1 + 5 cos α)^2)]
    dEdAlpha =
      massKg *
      G *
      radiusM *
      Math.max(0.2, c + (Math.cos(2 * alphaRad) + 5 * c) / (2 * denom * denom));
  const { totalPower } = dissipationRate(alphaRad, params);
  return -totalPower / dEdAlpha;
}

function simulateTrajectory(params, maxSamples = 600) {
  const alpha0 = (params.alpha0Deg * Math.PI) / 180,
    radiusM = params.radiusMm / 1000,
    massKg = params.massG / 1000;
  // First pass: adaptive RK4 to find collapse time t_f and dense state table
  const times = [0],
    alphas = [alpha0];
  let t = 0,
    a = alpha0,
    steps = 0;
  while (a > ALPHA_MIN_RAD && steps < 8000 && t < 300) {
    const rate = Math.abs(dAlphaDt(a, params)),
      dt = Math.max(1e-4, Math.min(0.025, (0.015 * a) / Math.max(rate, 1e-6)));
    const k1 = dAlphaDt(a, params),
      k2 = dAlphaDt(Math.max(ALPHA_MIN_RAD * 0.5, a + 0.5 * dt * k1), params),
      k3 = dAlphaDt(Math.max(ALPHA_MIN_RAD * 0.5, a + 0.5 * dt * k2), params),
      k4 = dAlphaDt(Math.max(ALPHA_MIN_RAD * 0.5, a + dt * k3), params);
    const nextA = a + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    if (nextA <= ALPHA_MIN_RAD) {
      const frac = (a - ALPHA_MIN_RAD) / Math.max(1e-9, a - nextA);
      t += dt * frac;
      a = ALPHA_MIN_RAD;
      times.push(t);
      alphas.push(a);
      break;
    }
    t += dt;
    a = nextA;
    times.push(t);
    alphas.push(a);
    steps++;
  }
  const tf = t;
  // Resample onto uniform grid + denser tail near t_f for accurate playback & log-log fit
  const N = maxSamples,
    tGrid = new Float64Array(N),
    alphaGrid = new Float64Array(N),
    omegaGrid = new Float64Array(N),
    freqGrid = new Float64Array(N),
    phaseGrid = new Float64Array(N),
    rimPhaseGrid = new Float64Array(N),
    peGrid = new Float64Array(N),
    keGrid = new Float64Array(N),
    powerGrid = new Float64Array(N);

  let idx = 0,
    phi = 0,
    psi = 0;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1),
      // Concentrate resolution near the singularity while keeping smooth early coverage
      ti = tf * (1 - Math.pow(1 - u, 1.65));
    tGrid[i] = ti;
    while (idx < times.length - 2 && times[idx + 1] < ti) idx++;
    const t0 = times[idx],
      t1 = times[idx + 1] || t0 + 1e-6,
      w = Math.max(0, Math.min(1, (ti - t0) / Math.max(1e-9, t1 - t0))),
      ai = alphas[idx] + w * ((alphas[idx + 1] ?? alphas[idx]) - alphas[idx]);
    alphaGrid[i] = ai;
    const om = omegaFromAlpha(ai, radiusM);
    omegaGrid[i] = om;
    freqGrid[i] = om / (2 * Math.PI);
    const en = energiesFromAlpha(ai, radiusM, massKg),
      diss = dissipationRate(ai, params);
    peGrid[i] = en.pe * 1000; // mJ
    keGrid[i] = en.ke * 1000; // mJ
    powerGrid[i] = diss.totalPower * 1000; // mW
    if (i > 0) {
      const dtStep = tGrid[i] - tGrid[i - 1],
        omAvg = 0.5 * (omegaGrid[i - 1] + om),
        aAvg = 0.5 * (alphaGrid[i - 1] + ai);
      phi += omAvg * dtStep;
      // Apparent face creep rate in lab frame: Ω(1 - cos α)
      psi += omAvg * (1 - Math.cos(aAvg)) * dtStep;
    }
    phaseGrid[i] = phi;
    rimPhaseGrid[i] = psi;
  }

  // Compute linear regression on log10(f) vs log10(tf - t) over the scaling regime
  let sumX = 0,
    sumY = 0,
    sumXX = 0,
    sumXY = 0,
    sumYY = 0,
    cnt = 0;
  for (let i = Math.floor(N * 0.1); i < N - 8; i++) {
    const rem = tf - tGrid[i];
    if (rem <= 0.015) continue;
    const x = Math.log10(rem),
      y = Math.log10(freqGrid[i]);
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumXY += x * y;
    sumYY += y * y;
    cnt++;
  }
  const denom = cnt * sumXX - sumX * sumX,
    slope = denom ? (cnt * sumXY - sumX * sumY) / denom : -0.25,
    intercept = cnt ? (sumY - slope * sumX) / cnt : 1,
    ssTot = cnt * sumYY - sumY * sumY,
    r2 = denom && ssTot ? Math.pow(cnt * sumXY - sumX * sumY, 2) / (denom * ssTot) : 1;

  return {
    tf,
    N,
    tGrid,
    alphaGrid,
    omegaGrid,
    freqGrid,
    phaseGrid,
    rimPhaseGrid,
    peGrid,
    keGrid,
    powerGrid,
    chirpExponent: -slope,
    logIntercept: intercept,
    r2: Math.min(1, Math.max(0, r2))
  };
}

function sampleTrajectory(traj, t) {
  if (t <= 0) {
    return {
      t: 0,
      alphaRad: traj.alphaGrid[0],
      omega: traj.omegaGrid[0],
      freq: traj.freqGrid[0],
      phase: 0,
      rimPhase: 0,
      pe: traj.peGrid[0],
      ke: traj.keGrid[0],
      power: traj.powerGrid[0],
      collapsed: false
    };
  }
  if (t >= traj.tf) {
    const last = traj.N - 1;
    return {
      t: traj.tf,
      alphaRad: 0,
      omega: 0,
      freq: 0,
      phase: traj.phaseGrid[last],
      rimPhase: traj.rimPhaseGrid[last],
      pe: 0,
      ke: 0,
      power: 0,
      collapsed: true
    };
  }
  // Binary search in tGrid
  let lo = 0,
    hi = traj.N - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (traj.tGrid[mid] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = traj.tGrid[lo],
    t1 = traj.tGrid[hi],
    u = Math.max(0, Math.min(1, (t - t0) / Math.max(1e-9, t1 - t0))),
    lerp = (arr) => arr[lo] + u * (arr[hi] - arr[lo]);
  return {
    t,
    alphaRad: lerp(traj.alphaGrid),
    omega: lerp(traj.omegaGrid),
    freq: lerp(traj.freqGrid),
    phase: lerp(traj.phaseGrid),
    rimPhase: lerp(traj.rimPhaseGrid),
    pe: lerp(traj.peGrid),
    ke: lerp(traj.keGrid),
    power: lerp(traj.powerGrid),
    collapsed: false
  };
}
