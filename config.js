// config.js
window.MRT_CONFIG = {
  SHEETS_URL: 'https://script.google.com/macros/s/AKfycbySbIYESXF74p4QXK7BfKyLo8rLWXiMKa5b0jKB66DYLXGK6ZmptUSZmALr7w9ME15Tag/exec', // <-- replace this line
 
  ANGLES: [0, 30, 60, 90, 120, 150, 180],

  TRIALS_PER_ANGLE_PER_COND: 10,

  PRACTICE_TRIALS: 10,

  MAX_RT_MS: 3500,


  // Fullscreen + sizing options

  LETTER_SIZE_MODE: 'scale',   // 'pt' | 'scale'

  LETTER_PT: 12,               // used if LETTER_SIZE_MODE === 'pt'

  LETTER_SCALE: 0.18,          // 18% of the canvas side (used if 'scale')

  FONT_FAMILY: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",

  FONT_WEIGHT: 'bold',

  LETTER_MARGIN_PX: 3,         // tiny nudge so rotated glyphs don’t kiss edges


  BG: '#000',

  FG: '#fff',

  VERSION: 'mrt-v1.1-fullscreen'

};

