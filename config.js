// config.js
window.MRT_CONFIG = {
  SHEETS_URL: 'PASTE_YOUR_WEB_APP_URL_HERE', // <-- replace this line

  // 7 angles, equal interval, includes 0 and 180
  ANGLES: [0, 30, 60, 90, 120, 150, 180],

  // Main task = 10 per angle per condition (same & mirror) = 140 trials total
  TRIALS_PER_ANGLE_PER_COND: 10,

  // Practice block (with brief feedback)
  PRACTICE_TRIALS: 10,

  // Max response time; "Too slow" in practice if exceeded
  MAX_RT_MS: 3500,

  // UI
  FONT: 'bold 160px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
  BG: '#000',     // black
  FG: '#fff',     // white
  VERSION: 'mrt-v1.0'
};
