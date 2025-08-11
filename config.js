// config.js
window.MRT_CONFIG = {
  SHEETS_URL: 'https://script.google.com/macros/s/AKfycbySbIYESXF74p4QXK7BfKyLo8rLWXiMKa5b0jKB66DYLXGK6ZmptUSZmALr7w9ME15Tag/exec', // <-- replace this line
  ANGLES: [0, 30, 60, 90, 120, 150, 180],
  TRIALS_PER_ANGLE_PER_COND: 10,
  PRACTICE_TRIALS: 10,
  MAX_RT_MS: 3500,

  // ⬇️ Smaller text: 12 pt ≈ 16 px
  FONT_PT: 12,
  FONT_WEIGHT: 'bold',
  FONT_FAMILY: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',

  // optional: small safety margin so rotated glyphs don’t kiss the edge
  LETTER_MARGIN_PX: 4,

  BG: '#000',
  FG: '#fff',
  VERSION: 'mrt-v1.0'
};


