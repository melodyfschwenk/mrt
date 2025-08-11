/* mrt.js */
(() => {
  const CFG = window.MRT_CONFIG || {};
  const qs = new URLSearchParams(location.search);
  const SESSION_CODE = (qs.get('code') || '').toUpperCase();
  const PARTICIPANT_ID = qs.get('pid') || '';
  const RNG_SEED = hashCode(SESSION_CODE || PARTICIPANT_ID || (Date.now() + ''));

  // ---------- DOM ----------
  const leftCanvas  = document.getElementById('leftCanvas');
  const rightCanvas = document.getElementById('rightCanvas');
  const fsOverlay   = document.getElementById('fs-overlay');
  const fsBtn       = document.getElementById('fs-start');
  const ibox        = document.getElementById('ibox');
  const startPracticeBtn = document.getElementById('startPracticeBtn');
  const feedbackEl  = document.getElementById('feedback');
  const phaseChip   = document.getElementById('phaseChip');
  const progressChip= document.getElementById('progressChip');

  const touchSame   = document.getElementById('touchSame');
  const touchMirror = document.getElementById('touchMirror');

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
    rng: mulberry32(RNG_SEED),
  };

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
    const w = window.innerWidth, h = window.innerHeight;
    const gap = Math.max(w, h) * 0.04;
    const eachW = (w - gap) / 2;
    const eachH = h * 0.9;
    return Math.floor(Math.min(eachW, eachH));
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

  function drawR(ctx, side, angleDeg, mirror=false){
    const letterPx = getLetterPx(side);
    const margin = CFG.LETTER_MARGIN_PX ?? 0;

    ctx.save();
    ctx.clearRect(0, 0, side, side);
    ctx.fillStyle = CFG.BG;
    ctx.fillRect(0, 0, side, side);

    ctx.translate(side/2, side/2);
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
    const lctx = sizeCanvasSquare(leftCanvas, side);
    const rctx = sizeCanvasSquare(rightCanvas, side);

    drawR(lctx, side, current.leftAngle, current.leftMirror);
    drawR(rctx, side, current.rightAngle, current.rightMirror);
  }

  function showIbox(){ ibox.style.display = 'block'; }
  function hideIbox(){ ibox.style.display = 'none'; }

  function showFeedback(txt, color){
    feedbackEl.textContent = txt;
    feedbackEl.style.color = color || '#fff';
    feedbackEl.style.display = 'block';
    setTimeout(()=>{ feedbackEl.style.display = 'none'; }, 900);
  }

  function setPhase(name){ phaseChip.textContent = name; }
  function setProgress(cur, total){ progressChip.textContent = `${cur} / ${total}`; }

  // ---------- Trial list generation ----------
  function makeMainTrials(){
    const trials = [];
    for (const angle of CFG.ANGLES) {
      for (const cond of ['same','mirror']) {
        for (let i=0;i<CFG.TRIALS_PER_ANGLE_PER_COND;i++){
          const mirrorLeft = cond === 'mirror' ? (state.rng() < 0.5) : false;
          const t = {
            condition: cond, angle,
            // Both images share the same rotation angle (classic MRT logic)
            leftAngle: angle,  leftMirror: mirrorLeft,
            rightAngle: angle, rightMirror: (cond === 'mirror') ? !mirrorLeft : false,
          };
          trials.push(t);
        }
      }
    }
    return shuffle(trials, state.rng);
  }

  function makePracticeTrials(n){
    // Balanced quick mix of angles & conditions
    const angles = shuffle([...CFG.ANGLES], state.rng);
    const base = [];
    for (let i=0;i<Math.min(angles.length, Math.ceil(n/2)); i++){
      base.push({condition:'same', angle:angles[i]});
      base.push({condition:'mirror', angle:angles[i]});
    }
    const shortList = shuffle(base, state.rng).slice(0, n);
    return shortList.map(t => {
      const mirrorLeft = t.condition === 'mirror' ? (state.rng()<0.5) : false;
      return {
        condition: t.condition, angle: t.angle,
        leftAngle: t.angle,  leftMirror: mirrorLeft,
        rightAngle:t.angle, rightMirror: (t.condition === 'mirror') ? !mirrorLeft : false,
      };
    });
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
    if (!CFG.SHEETS_URL || CFG.SHEETS_URL.includes('PASTE_YOUR_WEB_APP_URL_HERE')) {
      // Not configured yet
      return;
    }
    try {
      await fetch(CFG.SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
    } catch(e) {
      // Silent fail (offline ok) – local-only
    }
  }

  // ---------- Flow ----------
  function startPractice(){
    hideIbox();
    state.practice = true;
    state.block = 'practice';
    state.trialIndex = 0;
    state.practiceTrials = makePracticeTrials(CFG.PRACTICE_TRIALS);
    setPhase('Practice');
    setProgress(0, CFG.PRACTICE_TRIALS);
    nextTrial();
  }

  function startMain(){
    state.practice = false;
    state.block = 'main';
    state.trialIndex = 0;
    state.mainTrials = makeMainTrials();
    setPhase('Main Task');
    setProgress(0, state.mainTrials.length);
    nextTrial();
  }

  function nextTrial(){
    // Clean handlers
    if (state.onKey) { window.removeEventListener('keydown', state.onKey); state.onKey = null; }
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }

    // Pull trial
    const list = state.practice ? state.practiceTrials : state.mainTrials;
    if (state.trialIndex >= list.length) {
      if (state.practice) {
        // Transition screen
        showFeedback('Practice complete', '#4caf50');
        setTimeout(() => {
          // short countdown then main
          ibox.innerHTML = `
            <h2>Main Task</h2>
            <p>You’ll now begin the main block (${state.mainTrials.length} trials). No feedback will be shown.</p>
            <div class="btnrow"><button class="btn" id="beginMainBtn">Begin</button></div>`;
          ibox.style.display = 'block';
          document.getElementById('beginMainBtn').onclick = () => { hideIbox(); startMain(); };
        }, 500);
      } else {
        finishTask();
      }
      return;
    }

    state.current = list[state.trialIndex];

    // Fixation
    drawFixation();
    setTimeout(() => {
      // Stimulus
      layoutAndDraw(state.current);
      state.onsetTs = performance.now();

      // Response window
      state.onKey = (ev)=> handleKey(ev);
      window.addEventListener('keydown', state.onKey, { once: true });

      // Touch buttons
      touchSame.onclick = ()=> handleResponse('same');
      touchMirror.onclick = ()=> handleResponse('mirror');

      state.timer = setTimeout(()=> {
        // timeout: no response
        handleResponse('none');
      }, CFG.MAX_RT_MS);

    }, CFG.FIXATION_MS);

    // HUD
    const total = state.practice ? CFG.PRACTICE_TRIALS : state.mainTrials.length;
    setProgress(state.trialIndex + 1, total);
  }

  function drawFixation(){
    const side = computeCanvasSide();
    const lctx = sizeCanvasSquare(leftCanvas, side);
    const rctx = sizeCanvasSquare(rightCanvas, side);

    // simple white plus at center of each canvas
    const drawPlus = (ctx) => {
      const s = Math.round(side * 0.03);
      ctx.clearRect(0, 0, side, side);
      ctx.fillStyle = CFG.BG; ctx.fillRect(0, 0, side, side);
      ctx.fillStyle = CFG.FG;
      ctx.fillRect(side/2 - 1, side/2 - s, 2, s*2);
      ctx.fillRect(side/2 - s, side/2 - 1, s*2, 2);
    };
    drawPlus(lctx); drawPlus(rctx);
  }

  function handleKey(ev){
    const k = (ev.key || '').toLowerCase();
    if (k === 'f') handleResponse('same');
    else if (k === 'j') handleResponse('mirror');
    else {
      // ignore other keys; allow another keypress within the window
      window.addEventListener('keydown', state.onKey = (e)=>handleKey(e), { once: true });
    }
  }

  function handleResponse(choice){
    clearTimeout(state.timer); state.timer = null;
    if (state.onKey) { window.removeEventListener('keydown', state.onKey); state.onKey = null; }

    const cur = state.current;
    const correctAnswer = cur.condition; // 'same' or 'mirror'
    const rt = (choice === 'none') ? null : Math.round(performance.now() - state.onsetTs);
    const acc = (choice === correctAnswer) ? 1 : 0;

    // Log
    const row = {
      block: state.block,
      trial_index: state.trialIndex + 1,
      condition: cur.condition,
      angle: cur.angle,
      left_angle: cur.leftAngle,
      left_mirror: cur.leftMirror ? 1 : 0,
      right_angle: cur.rightAngle,
      right_mirror: cur.rightMirror ? 1 : 0,
      response: choice,
      correct_response: correctAnswer,
      accuracy: acc,
      rt_ms: rt,
      timestamp: new Date().toISOString()
    };
    state.data.push(row);
    sendToSheets(row);

    // Practice feedback
    if (state.practice) {
      if (choice === 'none') showFeedback('Too slow', '#ff9800');
      else if (acc === 1)   showFeedback('Correct', '#4caf50');
      else                  showFeedback('Incorrect', '#f44336');
    }

    // ITI → next trial
    setTimeout(() => {
      state.trialIndex += 1;
      nextTrial();
    }, CFG.ITI_MS);
  }

  async function finishTask(){
    setPhase('Complete');
    setProgress(state.mainTrials.length, state.mainTrials.length);

    // summary row
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

    ibox.innerHTML = `
      <h2>Task complete</h2>
      <p>Thank you! Your responses were saved.</p>
      <p><strong>Accuracy:</strong> ${acc}% &nbsp; | &nbsp; <strong>Mean RT:</strong> ${meanRt} ms</p>
      <div class="btnrow">
        <button class="btn secondary" id="closeBtn">Close</button>
      </div>`;
    ibox.style.display = 'block';
    document.getElementById('closeBtn').onclick = () => { ibox.style.display = 'none'; };
  }

  // ---------- Start / Resize ----------
  fsBtn.addEventListener('click', async () => {
    await enterFullscreenIfPossible();
    fsOverlay.style.display = 'none';
    // show instructions
    ibox.style.display = 'block';
  });

  startPracticeBtn.addEventListener('click', startPractice);

  window.addEventListener('resize', () => {
    // re-draw current view to keep crisp after resize
    if (state.current) layoutAndDraw(state.current);
  });
  document.addEventListener('fullscreenchange', () => {
    if (state.current) layoutAndDraw(state.current);
  });

  // Touch buttons → map to responses
  if (touchSame)   touchSame.addEventListener('click', ()=> handleResponse('same'));
  if (touchMirror) touchMirror.addEventListener('click', ()=> handleResponse('mirror'));

  // Initial HUD
  setPhase('Ready');
  setProgress(0, CFG.PRACTICE_TRIALS);

})();
