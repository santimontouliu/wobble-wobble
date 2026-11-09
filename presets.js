/* Specimen & surface presets for the Euler's Disk & Wobbling Coin lab. */
const PRESETS = {
  euler: {
    name: "Chrome Euler’s Disk",
    radiusMm: 37.5,
    massG: 400,
    alpha0Deg: 18,
    rollingLoss: 0.35,
    airLoss: 0.25,
    why: "High mass and a polished mirror base minimize rolling contour losses, allowing the wobble to last over a minute and reach high-frequency acoustic chirps.",
    hear: "A low, rhythmic table-thump that accelerates into a piercing turbine whine before snapping flat.",
    iaTip: "Ideal benchmark for testing the power-law exponent n in log₁₀(f) vs log₁₀(t_f − t)."
  },
  euro: {
    name: "2 Euro / 50p Coin",
    radiusMm: 12.9,
    massG: 8.5,
    alpha0Deg: 20,
    rollingLoss: 0.75,
    airLoss: 0.35,
    why: "Standard circulation coin on a hard acrylic or glass desk. Smaller radius R increases the initial precession rate Ω ∝ R⁻¹/² but shortens total spin duration.",
    hear: "A brisk metallic rattle starting near 12 Hz and sweeping past 120 Hz in a few seconds.",
    iaTip: "Great for comparing coins of different radii R at fixed initial launch tilt α₀ using a smartphone slow-motion camera (240 fps)."
  },
  quarter: {
    name: "US Quarter",
    radiusMm: 12.1,
    massG: 5.67,
    alpha0Deg: 22,
    rollingLoss: 0.85,
    airLoss: 0.4,
    why: "A milled-edge cupronickel coin on a wooden table. Milled serrations and softer wood increase rolling contact dissipation μ_r.",
    hear: "Short, crisp clatter with a steeper energy decay and lower peak cutoff frequency.",
    iaTip: "Compare smooth-rimmed vs. milled-edge coins to investigate rim roughness in your IA evaluation."
  },
  medallion: {
    name: "Brass Medallion",
    radiusMm: 25.0,
    massG: 85,
    alpha0Deg: 15,
    rollingLoss: 0.48,
    airLoss: 0.28,
    why: "Intermediate laboratory brass disk (50 mm diameter). Balances easy hand-launching with a long, clean acoustic spectrogram.",
    hear: "Warm, resonant hum with clearly separated harmonics in the final 3 seconds before collapse.",
    iaTip: "Machined brass disks of varying thickness let you isolate mass M while keeping radius R constant."
  },
  damped: {
    name: "Soft / Felt Surface",
    radiusMm: 25.0,
    massG: 85,
    alpha0Deg: 20,
    rollingLoss: 1.9,
    airLoss: 0.28,
    why: "Simulates rolling on a compliant cardstock or cloth mat. Hysteretic deformation at the moving contact point dominates over air-film viscosity.",
    hear: "Brief, muted flutter that collapses early without a high-pitched singularity whine.",
    iaTip: "Changing the substrate (glass vs. acrylic vs. wood vs. paper) provides a strong independent variable for an IBDP IA."
  }
};
