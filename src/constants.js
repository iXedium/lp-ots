/**
 * Single source of truth for all scene settings.
 * Toggle features with the `enabled` booleans.
 * Tweak numbers here — nothing is hard-coded in the modules.
 */
export const SETTINGS = {

  // ── Camera ───────────────────────────────────────────────────
  camera: {
    initialAlpha: Math.PI / 2,            // face AWAY from sun for blue sky
    initialBeta: 1.0,                   // ~57° from zenith
    initialRadius: 80,

    // Elevation: 15°–60° from horizontal
    lowerBetaLimit: -30 * (Math.PI / 180), // highest view  (60° elevation)
    upperBetaLimit: 75 * (Math.PI / 180), // lowest view   (15° elevation)

    lowerRadiusLimit: 10,
    upperRadiusLimit: 250,
    wheelPrecision: 3,                  // lower = faster zoom
    pinchPrecision: 8,
    panningSensibility: 200,              // RMB to pan; higher = slower
    minZ: 0.1,
  },

  // ── Sky ──────────────────────────────────────────────────────
  sky: {
    enabled: true,
    // Gradient sky colors (top → horizon)
    topColor: { r: 0.12, g: 0.40, b: 0.82 },   // vivid tropical blue
    horizonColor: { r: 0.60, g: 0.82, b: 0.95 },   // warm light horizon
    // Sun glow (bloom picks this up for cinematic flare)
    sunPosition: { x: 100, y: 500, z: 300 },
    sunColor: { r: 1.0, g: 0.95, b: 0.8 },
    sunIntensity: 1.5,
    sunSize: 256,                                // higher = tighter glow
    // Gradient control
    exponent: 0.6,                                // controls blue gradient spread
    skyboxSize: 3000,
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
      enabled: true,
      threshold: 0.3,
      weight: 0.35,
      kernel: 64,
      scale: 0.5,
    },

    imageProcessing: {
      contrast: 1.3,
      exposure: 1.15,
      toneMappingEnabled: true,
      toneMappingType: 0,             // 0 = standard (better color), 1 = ACES
      saturationBoost: 80,            // ColorCurves globalSaturation
    },

    fxaa: true,

    sharpen: {
      enabled: true,
      edgeAmount: 0.15,
    },
  },

  // ── Pool water material ──────────────────────────────────────
  water: {
    enabled: false,
    modelName: 'pool-water',              // GLB filename (sans extension)
    color: { r: 0.01, g: 0.55, b: 0.68 },
    windForce: -3,
    waveHeight: 0.015,
    waveLength: 0.08,
    bumpHeight: 0.25,
    colorBlendFactor: 0.25,
    renderTargetSize: 128,                // px — keep low for iPad
  },

  // ── Shoreline foam ──────────────────────────────────────────
  shorelineFoam: {
  "enabled": true,
  "modelName": "water",
  "deepColor": {
    "r": 0,
    "g": 0.15,
    "b": 0.4,
    "a": 1
  },
  "shallowColor": {
    "r": 0.15,
    "g": 0.7,
    "b": 0.71,
    "a": 0.55
  },
  "foamColor": {
    "r": 0.78,
    "g": 0.87,
    "b": 0.87,
    "a": 0.65
  },
  "maxDepth": 2.5,
  "shorePower": 1.4,
  "foamEdgeWidth": 0.55
},

  // ── PILMI (Per-Instance Lightmap Integration) ────────────────
  pilmi: {
    lightmap: true,   // toggle baked lightmap on PILMI models
    ao: false,  // toggle ambient occlusion on PILMI models
    lightmapIntensity: 1.0,    // 0..2 slider range
    aoIntensity: 1.0,    // 0..2 slider range
  },

  // ── Render-on-demand ─────────────────────────────────────────
  renderOnDemand: {
    cooldownMs: 500,           // ms to keep rendering after last interaction
  },

  // ── Materials ────────────────────────────────────────────────
  materials: {
    emissiveIntensity: 10,     // multiplier for emissive color/texture on all PBR materials
    // Normal map strength (bumpTexture.level). 1.0 = full; reduce to 0.5–0.8 if too harsh.
    normalMapStrength: 1.0,

    // Set true only if your normal maps were exported in DirectX convention (Y-down).
    // Blender GLTF and baked exports default to OpenGL (Y-up) — keep false for those.
    normalMapInvertY: false,
    normalMapInvertX: true,

    // Lightmap texture level. 1.0 = full additive contribution.
    // When a lightmap is present, IBL is reduced to bakedEnvironmentIntensity so
    // the baked lighting is the sole diffuse source (no double-contribution from IBL).
    lightmapStrength: 1.0,

    // Per-material environment (IBL) intensity when a lightmap texture is applied.
    // 0.0 = IBL off (lightmap only, correct for fully pre-baked Blender scenes).
    // Increase to 0.1–0.3 if you want some IBL specular reflections on lit objects.
    lightmapEnvironmentIntensity: 0.0,  },

  // ── Splash screen ───────────────────────────────────────────
  splash: {
    messageIntervalMs: 4000,   // rotate fun messages every N ms
  },

  // ── Lighting / shadows ───────────────────────────────────────
  lighting: {
    enabled: false,
    ambientIntensity: 0.45,
    sunDirection: { x: -0.7, y: -1.0, z: -0.45 },
    sunPosition: { x: 180, y: 260, z: 140 },
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
