// config.js
window.MRT_CONFIG = {
  SHEETS_URL: 'https://script.google.com/macros/s/AKfycbySbIYESXF74p4QXK7BfKyLo8rLWXiMKa5b0jKB66DYLXGK6ZmptUSZmALr7w9ME15Tag/exec', // <-- replace this line
 
   // ===== Design =====
  ANGLES: [0, 30, 60, 90, 120, 150, 180],
  TRIALS_PER_ANGLE_PER_COND: 10, // 10 × 7 × 2 = 140 trials
  PRACTICE_TRIALS: 12,           // 8–12 recommended
  FIXATION_MS: 700,
  MAX_RT_MS: 3500,
  ITI_MS: 350,

  // ===== Fullscreen & sizing =====
  LETTER_SIZE_MODE: 'pt',  // 'pt' | 'scale'
  LETTER_PT: 12,           // if 'pt'
  LETTER_SCALE: 0.18,      // if 'scale' (fraction of canvas side)
  FONT_FAMILY: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  FONT_WEIGHT: '900',
  LETTER_MARGIN_PX: 2,

  // ===== Appearance =====
  BG: '#000',
  FG: '#fff',

  // ===== Misc =====
  VERSION: 'mrt-v1.2-fullscreen',
};

