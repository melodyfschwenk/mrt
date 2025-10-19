// config.js - UPDATED FOR ALL ANGLE PAIR COMBINATIONS
window.MRT_CONFIG = {
  SHEETS_URL: 'https://script.google.com/macros/s/AKfycbySbIYESXF74p4QXK7BfKyLo8rLWXiMKa5b0jKB66DYLXGK6ZmptUSZmALr7w9ME15Tag/exec', // <-- replace this line

  // ===== Design =====
  ANGLES: [0, 30, 60, 90, 120, 150, 180],
  
  // NEW SETTINGS FOR ALL PAIRS:
  USE_ALL_ANGLE_PAIRS: true,  // Set to false to revert to same-angle only
  TRIALS_PER_PAIR: 2,         // How many times each angle pair appears before shuffling & capping
  MAIN_TRIAL_CAP: 140,        // Hard cap on the number of main trials (mirrored so it stays even)
  
  // ORIGINAL SETTING (used only if USE_ALL_ANGLE_PAIRS is false):
  TRIALS_PER_ANGLE_PER_COND: 10, // For same-angle only mode
  
  PRACTICE_TRIALS: 12,
  FIXATION_MS: 700,
  MAX_RT_MS: 3500,
  ITI_MS: 350,

  // ===== Fullscreen & sizing =====
  CANVAS_FILL_FRAC: 0.9,         // fraction of the shorter viewport side used for canvas
  LETTER_SIZE_MODE: 'pt',        // 'pt' | 'scale'
  LETTER_PT: 18,                 // if 'pt'
  LETTER_SCALE: 0.20,            // if 'scale' (fraction of canvas side)
  LETTER_SEPARATION_FRAC: 0.22,  // fraction of canvas width between letter centers (↓ = closer)

  FONT_FAMILY: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  FONT_WEIGHT: '900',
  LETTER_MARGIN_PX: 2,

  // ===== Appearance =====
  BG: '#000',
  FG: '#fff',

  // ===== Misc =====
  VERSION: 'mrt-v2.0-all-pairs',  // Updated version
};

/* 
CONFIGURATION NOTES:

With USE_ALL_ANGLE_PAIRS = true:
- Total angle pairs: 7 × 7 = 49 unique combinations
- Each pair appears in both 'same' and 'mirror' conditions
- TRIALS_PER_PAIR controls repetitions **before** the cap is applied
- MAIN_TRIAL_CAP trims the shuffled list to an even number of trials (default 140)

To reduce experiment length, you could:
1. Reduce TRIALS_PER_PAIR to 1 (98 trials before capping)
2. Use fewer angles (e.g., [0, 45, 90, 135, 180] = 5 angles)
3. Lower MAIN_TRIAL_CAP if you need fewer than 140 trials

Logged data now includes:
- left_angle: rotation of left letter
- right_angle: rotation of right letter
- angle_diff: angular difference between them (0–180°)
- This allows analysis of RT/accuracy as a function of angular disparity
*/
