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

// --- drawing ---
function drawR(ctx, angleDeg, mirror=false){
  const cx = ctx.canvas.width/2, cy = ctx.canvas.height/2;
  ctx.save();
  ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  ctx.translate(cx, cy);
  ctx.rotate(angleDeg * Math.PI/180);
  if (mirror) ctx.scale(-1, 1);
  ctx.fillStyle = CFG.FG;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = CFG.FONT;
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

function setProgress(i, total)
