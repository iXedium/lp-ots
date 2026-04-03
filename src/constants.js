/**
 * Single source of truth for all scene settings.
 * Toggle features with the `enabled` booleans.
 * Tweak numbers here — nothing is hard-coded in the modules.
 */
export const SETTINGS = {

  // ── Camera ───────────────────────────────────────────────────
  camera: {
    initialAlpha:  Math.PI / 2,            // face AWAY from sun for blue sky
    initialBeta:   1.0,                   // ~57° from zenith
    initialRadius: 80,

    // Elevation: 15°–60° from horizontal
    lowerBetaLimit: 30  * (Math.PI / 180), // highest view  (60° elevation)
    upperBetaLimit: 75  * (Math.PI / 180), // lowest view   (15° elevation)

    lowerRadiusLimit: 20,
    upperRadiusLimit: 250,
    wheelPrecision:   3,                  // lower = faster zoom
    pinchPrecision:   8,
    panningSensibility: 200,              // RMB to pan; higher = slower
    minZ: 0.1,
  },

  // ── Sky ──────────────────────────────────────────────────────
  sky: {
    enabled: true,
    // Gradient sky colors (top → horizon)
    topColor:     { r: 0.12, g: 0.40, b: 0.82 },   // vivid tropical blue
    horizonColor: { r: 0.60, g: 0.82, b: 0.95 },   // warm light horizon
    // Sun glow (bloom picks this up for cinematic flare)
    sunPosition:  { x: 100, y: 500, z: 300 },
    sunColor:     { r: 1.0, g: 0.95, b: 0.8 },
    sunIntensity: 1.5,
    sunSize:      256,                                // higher = tighter glow
    // Gradient control
    exponent:     0.6,                                // controls blue gradient spread
    skyboxSize:   3000,
  },

  // ── Fog (horizon haze only) ──────────────────────────────────
  fog: {
    enabled: false,
    density: 0.0008,                      // very low — near objects stay clear
    color: { r: 0.60, g: 0.82, b: 0.95 }, // matches sky horizon for seamless blending
  },

  // ── Post-processing (DefaultRenderingPipeline) ───────────────
  postProcessing: {
    enabled: true,

    bloom: {
      enabled:   false,
      threshold: 0.8,
      weight:    0.35,
      kernel:    64,
      scale:     0.5,
    },

    imageProcessing: {
      contrast:            1.3,
      exposure:            1.15,
      toneMappingEnabled:  true,
      toneMappingType:     1,             // 0 = standard (better color), 1 = ACES
      saturationBoost:     50,            // ColorCurves globalSaturation
    },

    fxaa: true,

    sharpen: {
      enabled:    true,
      edgeAmount: 0.15,
    },
  },

  // ── Pool water material ──────────────────────────────────────
  water: {
    enabled: false,
    modelName: 'pool-water',              // GLB filename (sans extension)
    color:     { r: 0.01, g: 0.55, b: 0.68 },
    windForce:       -3,
    waveHeight:      0.015,
    waveLength:      0.08,
    bumpHeight:      0.25,
    colorBlendFactor: 0.25,
    renderTargetSize: 128,                // px — keep low for iPad
  },

  // ── PILMI test controls ─────────────────────────────────────
  pilmi: {
    modelName: 'deli-int-shelves',
  },

  // ── Lighting / shadows ───────────────────────────────────────
  lighting: {
    enabled: true,
    ambientIntensity: 0.45,
    sunDirection: { x: -0.7, y: -1.0, z: -0.45 },
    sunPosition:  { x: 180, y: 260, z: 140 },
    sunIntensity: 3.2,
    shadowMapSize: 2048,
    shadowBias: 0.00008,
    normalBias: 0.01,
    darkness: 0.25,
  },

  // ── HUD / Performance overlay ────────────────────────────────
  hud: {
    enabled: true,
    collapsedByDefault: true,
  },
}
