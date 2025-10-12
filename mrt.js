/* mrt.js — single-canvas, central fixation, closer letters, with initials */
/* MODIFIED: Now includes all possible angle pair combinations */

(() => {
  // Add this at the very start
  const isEmbedded = (window !== window.top);
  const CFG = window.MRT_CONFIG || {};
  const qs = new URLSearchParams(location.search);
  const SESSION_CODE = (qs.get('code') || '').toUpperCase();
  
  // Will be set from the initials input
  let PARTICIPANT_ID = '';
  let RNG_SEED = 0;

  // ---------- DOM ----------
  const canvas      = document.getElementById('sceneCanvas');
  const fsOverlay   = document.getElementById('fs-overlay');
  const fsBtn       = document.getElementById('fs-start');
  const initialsInput = document.getElementById('initialsInput');
  const ibox        = document.getElementById('ibox');
  const startPracticeBtn = document.getElementById('startPracticeBtn');
  const feedbackEl  = document.getElementById('feedback');
  const phaseChip   = document.getElementById('phaseChip');
  const progressChip= document.getElementById('progressChip');
  const touchSame   = document.getElementById('touchSame');
  const touchMirror = document.getElementById('touchMirror');
  let feedbackTimer = null;

  // ---------- State ----------
  const state = {
    practice: true,
    trialIndex: 0,
    mainTrials: [],
    practiceTrials: [],
    current: null,
    onKey: null,
    timer: null,
    onsetTs: null,
    data: [],
    block: 'practice',
    started: false,
    rng: null, // Will be set after getting initials
  };

  // Enable/disable start button based on initials input
  initialsInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    fsBtn.disabled = value.length < 2;
    
    // Auto-uppercase
    if (value !== value.toUpperCase()) {
      e.target.value = value.toUpperCase();
    }
  });

  // Allow Enter key to start when initials are entered
  initialsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && initialsInput.value.trim().length >= 2) {
      fsBtn.click();
    }
  });

  // Focus on initials input when page loads
  window.addEventListener('load', () => {
    initialsInput.focus();
  });

  // Helper to notify parent window if embedded
  function notifyParentIfEmbedded(message) {
    if (window !== window.top) {
      // We're in an iframe
      try {
        window.parent.postMessage({
          type: 'task-complete',
          taskCode: 'MRT',
          ...message
        }, '*');  // You can restrict origin for security if needed
      } catch(e) {
        console.log('Could not communicate with parent:', e);
      }
    }
  }

  // ---------- Utils ----------
  function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}}
  function hashCode(str){let h=0;for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return Math.abs(h)||1;}
  function shuffle(arr, rng){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()* (i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

  function enterFullscreenIfPossible(){
    const root = document.documentElement;
    try{
      if (root.requestFullscreen) return root.requestFullscreen();
      if (root.webkitRequestFullscreen) return root.webkitRequestFullscreen();
    }catch(_){}
    return Promise.resolve();
  }

  function computeCanvasSide(){
    const s = Math.min(window.innerWidth, window.innerHeight) * (CFG.CANVAS_FILL_FRAC ?? 0.9);
    return Math.floor(s);
  }

  function sizeCanvasSquare(canvas, sideCssPx){
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width  = sideCssPx + 'px';
    canvas.style.height = sideCssPx + 'px';
    canvas.width  = Math.round(sideCssPx * dpr);
    canvas.height = Math.round(sideCssPx * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function getLetterPx(sideCssPx){
    if (CFG.LETTER_SIZE_MODE === 'pt') {
      const pt = CFG.LETTER_PT || 12;
      return Math.round(pt * 96 / 72);
    }
    const scale = Math.max(0.08, Math.min(0.5, CFG.LETTER_SCALE ?? 0.18));
    const minPx = Math.round((CFG.LETTER_PT || 12) * 96 / 72);
    return Math.max(minPx, Math.round(sideCssPx * scale));
  }

  function drawCenteredFixation(ctx, side){
    ctx.clearRect(0, 0, side, side);
    ctx.fillStyle = CFG.BG;
    ctx.fillRect(0, 0, side, side);
    const s = Math.round(side * 0.03);
    const cx = side/2, cy = side/2;
    ctx.fillStyle = CFG.FG;
    ctx.fillRect(cx - 1, cy - s, 2, s*2);
    ctx.fillRect(cx - s, cy - 1, s*2, 2);
  }

  function drawR(ctx, side, x, y, angleDeg, mirror=false){
    const letterPx = getLetterPx(side);
    const margin = CFG.LETTER_MARGIN_PX ?? 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angleDeg * Math.PI / 180);
    if (mirror) ctx.scale(-1, 1);

    ctx.fillStyle = CFG.FG;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${CFG.FONT_WEIGHT || '900'} ${letterPx}px ${CFG.FONT_FAMILY}`;
    ctx.translate(0, -margin);
    ctx.fillText('R', 0, 0);

    ctx.restore();
  }

  function layoutAndDraw(current){
    const side = computeCanvasSide();
    const ctx = sizeCanvasSquare(canvas, side);

    // Clear background
    ctx.fillStyle = CFG.BG;
    ctx.fillRect(0, 0, side, side);

    // Positions: two letters horizontally around the center
    const sepFrac = Math.max(0.08, Math.min(0.6, CFG.LETTER_SEPARATION_FRAC ?? 0.22));
    const sepPx = side * sepFrac;
    const cx = side/2, cy = side/2;
    const leftX  = cx - sepPx/2;
    const rightX = cx + sepPx/2;

    drawR(ctx, side, leftX,  cy, current.leftAngle,  current.leftMirror);
    drawR(ctx, side, rightX, cy, current.rightAngle, current.rightMirror);
  }

  function showFeedback(txt, color){
    feedbackEl.textContent = txt;
    feedbackEl.style.color = color || '#fff';
    feedbackEl.style.display = 'block';
    if (feedbackTimer) clearTimeout(feedbackTimer);
    const hideDelay = Math.max(0, (CFG.ITI_MS ?? 0) - 50);
    feedbackTimer = setTimeout(() => {
      feedbackEl.style.display = 'none';
      feedbackTimer = null;
    }, hideDelay);
  }

  function setPhase(name){ phaseChip.textContent = name; }
  function setProgress(cur, total){ progressChip.textContent = `${cur} / ${total}`; }

  // ---------- MODIFIED: Trial list generation for all angle pairs ----------
  function makeMainTrials(){
    const trials = [];
    
    // Check if we should use all pairs or same-angle only (configurable)
    const useAllPairs = CFG.USE_ALL_ANGLE_PAIRS !== false; // Default to true
    
    if (useAllPairs) {
      // NEW: Generate all possible angle pair combinations
      for (const leftAngle of CFG.ANGLES) {
        for (const rightAngle of CFG.ANGLES) {
          // For each angle pair, create trials for both conditions
          const trialsPerPair = CFG.TRIALS_PER_PAIR || 2; // Configurable repetitions per pair
          
          for (const cond of ['same', 'mirror']) {
            for (let i = 0; i < trialsPerPair; i++) {
              // Determine which letter(s) to mirror
              let leftMirror = false;
              let rightMirror = false;
              
              if (cond === 'mirror') {
                // Randomly choose which letter to mirror
                if (state.rng() < 0.5) {
                  leftMirror = true;
                } else {
                  rightMirror = true;
                }
              }
              
              // Calculate angular difference for analysis
              const angleDiff = Math.min(
                Math.abs(rightAngle - leftAngle),
                360 - Math.abs(rightAngle - leftAngle)
              );
              
              trials.push({
                condition: cond,
                leftAngle: leftAngle,
                rightAngle: rightAngle,
                angleDiff: angleDiff, // Store the angular difference
                leftMirror: leftMirror,
                rightMirror: rightMirror,
              });
            }
          }
        }
      }
    } else {
      // ORIGINAL: Same-angle only version
      for (const angle of CFG.ANGLES) {
        for (const cond of ['same','mirror']) {
          for (let i = 0; i < CFG.TRIALS_PER_ANGLE_PER_COND; i++){
            const mirrorLeft = cond === 'mirror' ? (state.rng() < 0.5) : false;
            trials.push({
              condition: cond,
              leftAngle: angle,
              rightAngle: angle,
              angleDiff: 0, // Same angle = 0 difference
              leftMirror: mirrorLeft,
              rightMirror: (cond === 'mirror') ? !mirrorLeft : false,
            });
          }
        }
      }
    }
    
    return shuffle(trials, state.rng);
  }

  function makePracticeTrials(n){
    n = Number.isFinite(+n) && +n > 0 ? +n : 10;
    
    // For practice, use a subset of angle combinations
    const practiceTrials = [];
    const angles = [...CFG.ANGLES];
    
    // Create a diverse set of practice trials
    const practicePairs = [];
    
    // Include some same-angle pairs (easier)
    for (let i = 0; i < Math.min(3, angles.length); i++) {
      practicePairs.push([angles[i], angles[i]]);
    }
    
    // Include some different-angle pairs
    if (angles.length > 1) {
      practicePairs.push([angles[0], angles[1]]);
      practicePairs.push([angles[0], angles[angles.length - 1]]);
      if (angles.length > 2) {
        practicePairs.push([angles[1], angles[2]]);
      }
    }
    
    // Create trials from these pairs
    for (const [leftAngle, rightAngle] of practicePairs) {
      for (const cond of ['same', 'mirror']) {
        let leftMirror = false;
        let rightMirror = false;
        
        if (cond === 'mirror') {
          if (state.rng() < 0.5) {
            leftMirror = true;
          } else {
            rightMirror = true;
          }
        }
        
        const angleDiff = Math.min(
          Math.abs(rightAngle - leftAngle),
          360 - Math.abs(rightAngle - leftAngle)
        );
        
        practiceTrials.push({
          condition: cond,
          leftAngle: leftAngle,
          rightAngle: rightAngle,
          angleDiff: angleDiff,
          leftMirror: leftMirror,
          rightMirror: rightMirror,
        });
      }
    }
    
    // Shuffle and return requested number
    return shuffle(practiceTrials, state.rng).slice(0, n);
  }

  // ---------- Google Sheets ----------
  
  async function sendToSheets(payload){
    const body = {
      action: 'trial',
      version: CFG.VERSION,
      session_code: SESSION_CODE || '',
      participant_id: PARTICIPANT_ID || '',
      user_agent: navigator.userAgent,
      ...payload,
    };
    
    if (!CFG.SHEETS_URL) return;  // Only check if URL exists
    
    try {
      await fetch(CFG.SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
    } catch(e) { /* silent */ }
  }

  // ---------- Flow ----------
  function startPractice(){
    ibox.style.display = 'none';
    state.practice = true;
    state.block = 'practice';
    state.trialIndex = 0;
    state.practiceTrials = makePracticeTrials(CFG.PRACTICE_TRIALS);
    setPhase('Practice');
    setProgress(0, state.practiceTrials.length);
    nextTrial();
  }

  function startMain(){
    state.practice = false;
    state.block = 'main';
    state.trialIndex = 0;
    if (!state.mainTrials.length) state.mainTrials = makeMainTrials();
    setPhase('Main Task');
    setProgress(0, state.mainTrials.length);
    nextTrial();
  }

  function nextTrial(){
    if (state.onKey) { window.removeEventListener('keydown', state.onKey); state.onKey = null; }
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }

    const list = state.practice ? state.practiceTrials : state.mainTrials;

    // ✅ Only end a block after all its trials are done
    if (state.trialIndex >= list.length) {
      if (state.practice) {
        showFeedback('Practice complete', '#4caf50');
        setTimeout(() => {
          // Prebuild main so the count isn't (0)
          if (!state.mainTrials.length) state.mainTrials = makeMainTrials();
          const mainCount = state.mainTrials.length;

          ibox.innerHTML = `
            <h2>Main Task</h2>
            <p>You'll now begin the main block (${mainCount} trials). No feedback will be shown.</p>
            <div class="btnrow"><button class="btn" id="beginMainBtn">Begin</button></div>`;
          ibox.style.display = 'block';
          document.getElementById('beginMainBtn').onclick = () => { 
            ibox.style.display = 'none'; 
            startMain(); 
          };
        }, 500);
      } else {
        finishTask();
      }
      return;
    }

    state.current = list[state.trialIndex];

    // --- Fixation (single central) ---
    const side = computeCanvasSide();
    const ctx = sizeCanvasSquare(canvas, side);
    drawCenteredFixation(ctx, side);

    setTimeout(() => {
      // --- Stimulus (letters only) ---
      layoutAndDraw(state.current);
      state.onsetTs = performance.now();

      // Keyboard (F = same, J = mirror)
      state.onKey = (ev) => handleKey(ev);
      window.addEventListener('keydown', state.onKey, { once: true });

      // Touch buttons (set per trial)
      if (touchSame)   touchSame.onclick   = () => handleResponse('same');
      if (touchMirror) touchMirror.onclick = () => handleResponse('mirror');

      // Timeout
      state.timer = setTimeout(() => handleResponse('none'), CFG.MAX_RT_MS);
    }, CFG.FIXATION_MS);

    const total = state.practice ? state.practiceTrials.length : state.mainTrials.length;
    setProgress(state.trialIndex + 1, total);
  }

  function handleKey(ev){
    const k = (ev.key || '').toLowerCase();
    if (k === 'f') handleResponse('same');
    else if (k === 'j') handleResponse('mirror');
    else window.addEventListener('keydown', state.onKey = (e)=>handleKey(e), { once: true });
  }

  function handleResponse(choice){
    clearTimeout(state.timer); state.timer = null;
    if (state.onKey) { window.removeEventListener('keydown', state.onKey); state.onKey = null; }

    const cur = state.current;
    const correctAnswer = cur.condition;
    const rt = (choice === 'none') ? null : Math.round(performance.now() - state.onsetTs);
    const acc = (choice === correctAnswer) ? 1 : 0;

    const row = {
      block: state.block,
      trial_index: state.trialIndex + 1,
      condition: cur.condition,
      angle_diff: cur.angleDiff, // NEW: Include angular difference
      left_angle: cur.leftAngle,
      right_angle: cur.rightAngle,
      left_mirror: cur.leftMirror ? 1 : 0,
      right_mirror: cur.rightMirror ? 1 : 0,
      response: choice,
      correct_response: correctAnswer,
      accuracy: acc,
      rt_ms: rt,
      timestamp: new Date().toISOString()
    };
    state.data.push(row);
    sendToSheets(row);

    if (state.practice) {
      if (choice === 'none') showFeedback('Too slow', '#ff9800');
      else if (acc === 1)   showFeedback('Correct', '#4caf50');
      else                  showFeedback('Incorrect', '#f44336');
    }

    setTimeout(() => {
      state.trialIndex += 1;
      nextTrial();
    }, CFG.ITI_MS);
  }

  async function finishTask(){
    setPhase('Complete');
    setProgress(state.mainTrials.length, state.mainTrials.length);

    const answered = state.data.filter(r => r.block === 'main' && r.response !== 'none');
    const nMain = state.mainTrials.length;
    const acc = answered.length ? (answered.filter(r=>r.accuracy===1).length / answered.length * 100).toFixed(1) : '—';
    const meanRt = answered.length ? Math.round(answered.reduce((s,r)=>s+(r.rt_ms||0),0)/answered.length) : '—';

    await sendToSheets({
      action: 'summary',
      total_main_trials: nMain,
      answered_main_trials: answered.length,
      accuracy_percent: acc,
      mean_rt_ms: meanRt,
      timestamp: new Date().toISOString()
    });

    notifyParentIfEmbedded({ completed: true });

    ibox.innerHTML = `
      <h2>Task complete</h2>
      <p>Thank you for completing the task!</p>
      <p style="margin-top: 10px; color: #9aa;">Participant: ${PARTICIPANT_ID}</p>
      <div class="btnrow">
        <button class="btn secondary" id="closeBtn">Close</button>
      </div>`;
    ibox.style.display = 'block';
    document.getElementById('closeBtn').onclick = () => { ibox.style.display = 'none'; };
  }

  // ---------- Start / Resize ----------
  fsBtn.addEventListener('click', async () => {
    // Get and validate initials
    const initials = initialsInput.value.trim().toUpperCase();
    if (initials.length < 2) {
      initialsInput.focus();
      return;
    }
    
    // Set participant ID and initialize RNG with it
    PARTICIPANT_ID = initials;
    RNG_SEED = hashCode(SESSION_CODE || PARTICIPANT_ID || (Date.now() + ''));
    state.rng = mulberry32(RNG_SEED);

    // Register participant on the tracking sheet
    await sendToSheets({ action: 'participant', timestamp: new Date().toISOString() });

    try {
      if (!isEmbedded) await enterFullscreenIfPossible();
    } catch (_) {
      // Ignore fullscreen errors
    } finally {
      fsOverlay.style.display = 'none';
      ibox.style.display = 'block';
    }
  });

  const startPracticeHandler = (e) => { e.preventDefault(); startPractice(); };
  startPracticeBtn.addEventListener('click', startPracticeHandler);

  window.addEventListener('resize', () => {
    if (state.current) layoutAndDraw(state.current);
    else {
      const side = computeCanvasSide();
      sizeCanvasSquare(canvas, side);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (state.current) layoutAndDraw(state.current);
  });

  // Initial HUD
  setPhase('Ready');
  setProgress(0, CFG.PRACTICE_TRIALS);

})();
