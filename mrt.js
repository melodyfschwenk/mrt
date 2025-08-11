// mrt.js

// --- helpers ---
const CFG = window.MRT_CONFIG;
const QS = new URLSearchParams(location.search);
const SESSION_CODE = QS.get('session') || null;
const PARTIC_FROM_PORTAL = QS.get('participant') || null;

function $(id){ return document.getElementById(id); }
function now(){ return performance.now(); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// deterministic RNG (seed = participant id)
function hashCode(str){ let h=0; for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i); h|=0;} return h>>>0; }
function mulberry32(a){ return function(){ var t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
function shuffle(arr, rnd){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

let PARTICIPANT_ID = null;
let PRACTICE = [];
let MAIN = [];
let allRows = [];

let state = {
  phase: 'welcome',  // welcome | practice | main | done
  trialIndex: 0,
  onset: null,
  waiting: false
};

// --- ID assignment ---
async function getParticipantId(){
  // Prefer portal-provided code
  if (SESSION_CODE) {
    const pid = PARTIC_FROM_PORTAL ? `${SESSION_CODE}-${PARTIC_FROM_PORTAL}` : SESSION_CODE;
    return pid;
  }

  // Try server-issued ID
  try {
    const res = await fetch(CFG.SHEETS_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify({ action:'nextIdLocked' })
    });
    // If CORS allows, parse; otherwise this may throw, and we'll fallback
    const json = await res.json();
    if (json.ok && json.id) return json.id;
  } catch(e){ /* ignore */ }

  // Fallback local
  return `MRT-local-${Date.now().toString(36)}`;
}

// --- trial building ---
// trial: { angle, cond:'same'|'mirror', leftIsMirror:boolean, leftAngle, rightAngle }
function buildMainTrials(pid){
  const rnd = mulberry32(hashCode(pid));
  const trials = [];
  const N = CFG.TRIALS_PER_ANGLE_PER_COND;

  for (const angle of CFG.ANGLES) {
    // SAME (non-mirror): both non-mirrored “R”, same angle
    for (let i=0;i<N;i++){
      const leftFirst = rnd() < 0.5; // visually order is the same here, but we randomize anyway
      trials.push({
        angle, cond:'same',
        leftIsMirror:false, leftAngle: angle, rightAngle: angle,
        leftFirst
      });
    }

    // MIRROR: exactly half left mirrored, half right mirrored
    for (let i=0;i<N;i++){
      const leftMirror = i < Math.floor(N/2); // balance
      trials.push({
        angle, cond:'mirror',
        leftIsMirror:leftMirror, leftAngle: angle, rightAngle: angle
      });
    }
  }
  return shuffle(trials, rnd);
}

function buildPracticeTrials(pid){
  const rnd = mulberry32(hashCode(pid) ^ 0xABCDEF);
  const pool = [];
  const P = CFG.PRACTICE_TRIALS;
  // build a small balanced set: equal same/mirror alternating angles
  for (let i=0;i<P;i++){
    const angle = CFG.ANGLES[i % CFG.ANGLES.length];
    const cond = (i % 2 === 0) ? 'same' : 'mirror';
    const leftIsMirror = cond === 'mirror' ? (rnd()<0.5) : false;
    pool.push({ angle, cond, leftIsMirror, leftAngle:angle, rightAngle:angle });
  }
  return shuffle(pool, rnd);
}

<!-- Fullscreen start overlay -->
<div id="fs-overlay" style="
  position:fixed; inset:0; background:#000; color:#fff; 
  display:flex; align-items:center; justify-content:center; 
  flex-direction:column; z-index:10000; text-align:center; padding:24px;">
  <h1 style="margin:0 0 12px; font:600 24px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial">Mental Rotation Task</h1>
  <p style="max-width:640px; margin:0 0 20px; color:#bbb;">
    You’ll see two <strong>R</strong> letters side by side. Decide if they are the <em>same</em> or a <em>mirror</em> image.
    The task will run in fullscreen to keep things consistent.
  </p>
  <button id="fs-start" style="padding:12px 22px; border-radius:8px; border:0; font-weight:700; cursor:pointer;">
    Start (Fullscreen)
  </button>
  <p style="margin-top:12px; font-size:12px; color:#888;">If fullscreen is blocked by your browser, we’ll still continue.</p>
</div>

// --- drawing ---
function drawR(ctx, angleDeg, mirror=false){
  const cw = ctx.canvas.width / (window.devicePixelRatio || 1);
  const ch = ctx.canvas.height / (window.devicePixelRatio || 1);

  // convert 12 pt to ~16 px at 96 dpi
  const pxFromPt = Math.round((window.MRT_CONFIG.FONT_PT || 12) * 96 / 72);
  const margin = window.MRT_CONFIG.LETTER_MARGIN_PX ?? 0;

  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // draw in CSS pixel space (we already scaled for HiDPI in init)
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(angleDeg * Math.PI / 180);
  if (mirror) ctx.scale(-1, 1);

  ctx.fillStyle = CFG.FG;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${CFG.FONT_WEIGHT || 'bold'} ${pxFromPt}px ${CFG.FONT_FAMILY}`;

  // tiny nudge to avoid edge clipping at some rotations
  ctx.translate(0, -margin);
  ctx.fillText('R', 0, 0);

  ctx.restore();
}


function renderTrial(t){
  const L = $('left').getContext('2d');
  const R = $('right').getContext('2d');
  // left canvas: mirrored? right canvas: mirrored?
  drawR(L, t.leftAngle, t.cond === 'mirror' && t.leftIsMirror);
  drawR(R, t.rightAngle, t.cond === 'mirror' && !t.leftIsMirror);
}

// --- scoring ---
function correctFor(t){
  // SAME means both non-mirror
  if (t.cond === 'same') return 'same';
  // MIRROR means one mirrored one not
  return 'mirror';
}

function responseLabel(key){
  if (key === 'ArrowLeft' || key === 'f' || key === 'F') return 'same';
  if (key === 'ArrowRight' || key === 'j' || key === 'J') return 'mirror';
  if (key === 'timeout') return 'none';
  return null;
}

// --- saving ---
async function saveTrialRow(row){
  try{
    await fetch(CFG.SHEETS_URL, {
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'saveTrial', ...row })
    });
  } catch(e){ /* ignore; could queue offline if needed */ }
}

async function saveSummary(participant_id, mean_rt, acc){
  try{
    await fetch(CFG.SHEETS_URL, {
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        action:'saveSummary',
        participant_id, session_code: SESSION_CODE || '',
        total_trials: allRows.filter(r=>r.phase==='main').length,
        mean_rt: Math.round(mean_rt),
        accuracy: Math.round(acc*1000)/10,
        timestamp: new Date().toISOString(),
        version: CFG.VERSION
      })
    });
  } catch(e){}
}

// --- flow ---
function setScreen(id){
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('active');
  $(id).classList.add('active');
}

function setProgress(i, total){
  $('progress').textContent = `${i}/${total}`;
}

let keyHandler = null;
let timeoutId = null;

function armKeys(handler){
  disarmKeys();
  keyHandler = (e)=>handler(e);
  document.addEventListener('keydown', keyHandler, { once:true });
}

function disarmKeys(){
  if (keyHandler) document.removeEventListener('keydown', keyHandler, { once:true });
  keyHandler = null;
}

function startTimeout(){
  stopTimeout();
  timeoutId = setTimeout(()=> handleResponse({ key:'timeout' }), CFG.MAX_RT_MS);
}
function stopTimeout(){
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = null;
}

async function nextTrial(){
  const list = (state.phase === 'practice') ? PRACTICE : MAIN;

  if (state.trialIndex >= list.length){
    if (state.phase === 'practice'){
      // move to main
      state.phase = 'main';
      state.trialIndex = 0;
      $('fb').textContent = '';
      runMain();
      return;
    } else {
      finish();
      return;
    }
  }

  const t = list[state.trialIndex];
  setProgress(state.trialIndex+1, list.length);
  renderTrial(t);
  state.onset = now();
  startTimeout();
  armKeys(handleResponse);
}

function logTrial(t, respKey, rt){
  const correct = correctFor(t);
  const response = responseLabel(respKey);
  const accuracy = (response && response === correct) ? 1 : 0;

  const row = {
    phase: state.phase,
    participant_id: PARTICIPANT_ID,
    session_code: SESSION_CODE || '',
    trial: state.trialIndex + 1,
    angle: t.angle,
    condition: t.cond,
    left_is_mirror: t.cond === 'mirror' ? t.leftIsMirror : false,
    left_angle: t.leftAngle,
    right_angle: t.rightAngle,
    correct: correct,
    response: response || 'invalid',
    accuracy: response === 'timeout' ? 0 : accuracy,
    rt_ms: response === 'timeout' ? null : Math.round(rt),
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
    version: CFG.VERSION
  };

  allRows.push(row);
  // Save only main trials to Sheets? We can save both; keeping both is often useful.
  saveTrialRow(row);
}

function showPracticeFeedback(respKey, isCorrect){
  const fb = $('fb');
  if (respKey === 'timeout') { fb.textContent = 'Too slow'; fb.style.color = '#ff9800'; }
  else if (isCorrect) { fb.textContent = 'Correct'; fb.style.color = '#4caf50'; }
  else { fb.textContent = 'Incorrect'; fb.style.color = '#f44336'; }
}

function clearFeedback(){ $('fb').textContent = ''; }

function handleResponse(e){
  stopTimeout();
  disarmKeys();

  const list = (state.phase === 'practice') ? PRACTICE : MAIN;
  const t = list[state.trialIndex];
  const respKey = e.key || e;
  const resp = responseLabel(respKey);
  const rt = (respKey === 'timeout') ? null : (now() - state.onset);

  const correct = correctFor(t);
  const isCorrect = (resp && resp === correct);
  logTrial(t, respKey, rt);

  if (state.phase === 'practice'){
    showPracticeFeedback(respKey, isCorrect);
    setTimeout(()=> {
      clearFeedback();
      state.trialIndex++;
      nextTrial();
    }, 900);
  } else {
    // no feedback in main
    state.trialIndex++;
    nextTrial();
  }
}

async function runPractice(){
  state.phase = 'practice';
  state.trialIndex = 0;
  setScreen('trial');
  nextTrial();
}

async function runMain(){
  state.phase = 'main';
  state.trialIndex = 0;
  setScreen('trial');
  nextTrial();
}

function downloadCSV(){
  if (!allRows.length) return alert('No data');
  const headers = Object.keys(allRows[0]);
  const rows = [
    headers.join(','),
    ...allRows.map(r => headers.map(h => {
      const v = r[h];
      if (v == null) return '';
      const s = String(v);
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? `"${s.replace(/"/g,'""')}"`
        : s;
    }).join(','))
  ].join('\n');

  const blob = new Blob([rows], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `mrt_${PARTICIPANT_ID}_${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function finish(){
  // compute summary
  const mains = allRows.filter(r => r.phase === 'main');
  const n = mains.length;
  const valid = mains.filter(r => r.rt_ms != null);
  const meanRt = valid.length ? valid.reduce((s,r)=>s+r.rt_ms,0)/valid.length : 0;
  const acc = n ? mains.filter(r=>r.accuracy===1).length / n : 0;

  await saveSummary(PARTICIPANT_ID, meanRt, acc);

  $('summary').textContent = `Accuracy: ${(acc*100).toFixed(1)}% • Mean RT: ${Math.round(meanRt)} ms • Trials: ${n}`;
  setScreen('done');
}

// --- init ---
async function init(){
  document.body.style.background = CFG.BG;
  $('start-btn').addEventListener('click', runPractice);
  $('download').addEventListener('click', downloadCSV);

  PARTICIPANT_ID = await getParticipantId();
  $('id-line').textContent = `Participant ID: ${PARTICIPANT_ID}` + (SESSION_CODE ? ` • Session: ${SESSION_CODE}` : '');

  // build trials
  PRACTICE = buildPracticeTrials(PARTICIPANT_ID);
  MAIN = buildMainTrials(PARTICIPANT_ID);

  // Make canvases crisp on HiDPI
  for (const id of ['left','right']){
    const c = $(id);
    const dpr = window.devicePixelRatio || 1;
    c.width = 300 * dpr; c.height = 300 * dpr;
    c.style.width = '300px'; c.style.height = '300px';
    c.getContext('2d').scale(dpr, dpr);
  }
}

document.addEventListener('DOMContentLoaded', init);
