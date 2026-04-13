/**
 * Intro camera timeline configuration.
 * Tweak these values to adjust the intro sequence timing and feel.
 * All durations in seconds unless marked (ms).
 *
 * Camera positions extracted from pins.glb Cam-0-1 / Cam-0-2 / Cam-0-3
 * and hardcoded here so the app never needs pins.glb at runtime.
 *
 * Flow:
 *   1. Camera placed at skyCam (Cam-0-1) → splash fades out
 *   2. Camera flies from skyCam → beachCam (Cam-0-2)
 *   3. "Explore Island" button appears — waits for user click
 *   4. Camera flies from beachCam → overviewCam (Cam-0-3)
 *   5. User gains orbit control, pin-1 appears
 */
export const INTRO_TIMELINE = {

  // ── Intro camera positions (ArcRotateCamera params) ──────
  // Extracted from pins.glb Cam-0-1, Cam-0-2, Cam-0-3.
  skyCam: {
    alpha: 1.4635,
    beta: 1.5091,
    radius: 30.0,
    target: { x: 23.330, y: 50, z: -37.303 },
  },
  beachCam: {
    alpha: 1.4635,
    beta: 1.5091,
    radius: 29.636,
    target: { x: 23.330, y: 0, z: -37.303 },
  },
  overviewCam: {
    alpha: 0.9608,
    beta: 1.2438,
    radius: 66.605,
    target: { x: -6.719, y: 0, z: -10.066 },
  },

  // ── Phase 1: Splash fade ─────────────────────────────────
  splash: {
    fadeDuration: 1200,             // ms — CSS opacity transition for splash overlay
  },

  // ── Phase 2: Sky → Beach (skyCam → beachCam) ─────────────
  skyToBeach: {
    delay: 0,                     // ms — pause after splash finishes fading
    duration: 3.0,                  // seconds — camera fly duration
    easing: 'expo.Out',         // GSAP easing string
    arc: false,                     // no radius arc — smooth straight pull-down
  },

  // ── Phase 3: "Explore" button ─────────────────────────────
  exploreButton: {
    label: 'Explore Island',        // button text
  },

  // ── Phase 4: Beach → Overview (beachCam → overviewCam) ────
  beachToOverview: {
    duration: 5,                  // seconds
    easing: 'circ.inOut',
    arc: false,                      // radius arc for dramatic island reveal
  },

  // ── Phase 5: Pin visit return button ──────────────────────
  returnButton: {
    label: 'Back to Island',
  },
}
