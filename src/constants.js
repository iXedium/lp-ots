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
    upperRadiusLimit: 500,
    wheelPrecision: 3,                  // lower = faster zoom
    pinchPrecision: 8,
    panningSensibility: 200,              // RMB to pan; higher = slower
    angularSensibilityX: 1500,            // orbit rotation slowness (X); higher = more deliberate (mobile-friendly)
    angularSensibilityY: 1500,            // orbit rotation slowness (Y); higher = more deliberate (mobile-friendly)
    minZ: 0.1,

    // WASD + QE drone control speed (world units per second)
    droneSpeed: 15,

    // Dev mode limits (looser for free exploration)
    dev_lowerBetaLimit: 0,
    dev_upperBetaLimit: Math.PI,
    dev_lowerRadiusLimit: 1,
    dev_upperRadiusLimit: 200,
  },

  // ── Fly-to camera animations ─────────────────────────────────
  flyTo: {
    defaultDuration: 5.0,               // seconds (longer = smoother)
    easing: 'power2.inOut',             // GSAP ease string
    // Smart arc — only adds radius swell when the angular distance is large.
    // The swell follows the same easing as the angle tween so the peak
    // occurs at the spatial midpoint of the orbit, not at a fixed time.
    arcAngleThreshold: 0.5,             // radians — minimum angle change to trigger arc
    arcSensitivity: 0.1,              // how much angle change maps to swell (lower = gentler)
    arcMaxSwell: 0.3,                  // maximum swell as fraction of max(startR, endR)
  },

  // ── Intro sequence (timing config in introTimeline.js) ──────
  // These are fallback camera positions only — used if pins.glb cameras aren't found.
  intro: {
    skyCamera: {
      alpha: Math.PI / 2,
      beta: 0.15,
      radius: 5,
      target: { x: 0, y: 0, z: 0 },
    },
    beachCloseupShot: {
      alpha: -1.2,
      beta: 1.05,
      radius: 12,
      target: { x: 0, y: 0.5, z: 0 },
    },
  },

  // ── Orbit overview shot ──────────────────────────────────────
  orbit: {
    alpha: Math.PI / 2,
    beta: 1.0,
    radius: 80,
    target: { x: 0, y: 0, z: 0 },
  },

  // ── Pins ─────────────────────────────────────────────────────
  pins: {
    bobbingAmplitude: 0.08,             // world units
    bobbingSpeed: 1.4,                  // cycles per second
    rotationSpeed: 0.4,                 // radians per second
    defaultHitScreenRadius: 52,         // pixels — tap detection radius (fallback)
    defaultHitBoxSize: { x: 3, y: 6, z: 3 },  // world units — invisible click box per pin
    meshScale: 1.0,                     // scale multiplier for pin mesh (pin.glb is small)
    metallic: 0.0,                      // PBR metalness (0 = dielectric, 1 = metal)
    roughness: 0.6,                     // PBR roughness (0 = mirror, 1 = matte)
    animatePins: false,                  // true = bobbing+rotation, false = static billboard-Y
    lightIntensity: 0,                // pin directional light intensity
    // Directional light direction/position extracted from pins.glb light-dir
    lightDirection: { x: -0.5264, y: 0.6270, z: 0.5743 },
    lightPosition: { x: -26.319, y: 31.350, z: 28.714 },
    // Environment (IBL) contribution to pin materials (0 = no env reflections)
    environmentIntensity: 1.0,
    // Ambient color added to all pin materials (subtle fill light)
    ambientColor: { r: 0.15, g: 0.15, b: 0.2 },
    // Status colors — diffuse color per pin state
    statusColors: {
      invisible: { r: 0.3, g: 0.3, b: 0.3 },
      disabled:  { r: 0.25, g: 0.25, b: 0.28 },
      locked:    { r: 0.45, g: 0.45, b: 0.48 },
      normal:    { r: 0.9, g: 0.15, b: 0.15 },
      active:    { r: 0.95, g: 0.75, b: 0.1 },
      completed: { r: 0.15, g: 0.75, b: 0.25 },
    },
    // Emissive multiplier per status (fraction of diffuse → emissive)
    statusEmissiveScale: {
      invisible: 0,
      disabled:  0,
      locked:    0,
      normal:    0.0,
      active:    0,
      completed: 0,
    },  },

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
    density: 0.0028,                      // very low — near objects stay clear
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
