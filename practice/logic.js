// logic.js — Single-player Canvas (v8, robust zoom + cursor alignment)
// - DPR/zoom polling: rebuild canvas + redraw snapshot on any zoom/resize
// - Pointer stays centered under cursor after zoom/undo/scroll
// - History only changes after stroke/clear (clean undo/redo)

const ELO_TIERS = [
  { min: 0,   max: 200,  name: "Elementary" },
  { min: 200, max: 400,  name: "Middle Schooler" },
  { min: 400, max: 600,  name: "High Schooler" },
  { min: 600, max: 800,  name: "Senior" },
  { min: 800, max: 1200, name: "Regionals" },
  { min: 1200,max: 1700, name: "Nationalist" },
  { min: 1700,max: 2000, name: "Olympian" },
  { min: 2000,max: 9999, name: "Grandmaster" }
];

const SAVE_KEY = 'mita_save_v3';
const K_FACTOR = 24;

const el = {
  question: document.getElementById('question'),
  answerBox: document.getElementById('answer-box'),
  submitBtn: document.getElementById('submit-btn'),
  result: document.getElementById('result'),
  changeEloBtn: document.getElementById('change-elo-btn'),
  clearDrawingBtn: document.getElementById('clear-drawing-btn'),
  canvas: document.getElementById('drawing-canvas'),
  toggleQuestionBtn: document.getElementById('toggle-question-btn'),
  questionContainer: document.getElementById('question-container'),
  colorPickerBtn: document.getElementById('color-picker-btn'),
  colorDropdown: document.getElementById('color-dropdown'),
  colorOptions: document.querySelectorAll('.color-option'),
  currentColorPreview: document.getElementById('current-color-preview'),
  resultOverlay: document.getElementById('result-overlay'),
  resultText: document.getElementById('result-text'),
  confetti: document.getElementById('confetti'),
  nextQuestionContainer: document.getElementById('next-question-container'),
  nextQuestionPersistentBtn: document.getElementById('next-question-persistent-btn'),
};

function setResultOverlay(visible) {
  if (el.resultOverlay) el.resultOverlay.classList.toggle('is-visible', !!visible);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function redirectActionsHtml() {
  return (
    '<div class="result-dialog__divider"></div>' +
    '<p class="result-dialog__redirect">Back to home in</p>' +
    '<p class="result-dialog__count"><span id="countdown-timer">10</span>s</p>' +
    '<div class="result-dialog__actions">' +
    '<button type="button" class="result-btn result-btn--primary" id="next-question-btn">Next question</button>' +
    '<button type="button" class="result-btn result-btn--ghost" id="stay-btn">Stay on canvas</button>' +
    '</div>'
  );
}

const state = {
  currentQuestion: null,
  questions: [],
  currentElo: 300,
  // drawing
  isDrawing: false,
  lastX: 0, lastY: 0,
  currentColor: '#ffffff',
  // history
  history: [],
  idx: -1,
  maxSteps: 200,
  // ui
  questionBoxVisible: true,
  lastAnswerTime: 0,
  // stats
  streak: 0, bestStreak: 0, totalAttempts: 0, totalCorrect: 0,
  categoryStats: {}, eloHistory: [],
  // sizing
  dpr: window.devicePixelRatio || 1,
  cssW: 0, cssH: 0
};

// ---------- persistence ----------
function loadSave(){
  try{
    const s = JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');
    if (typeof s.currentElo==='number') state.currentElo = s.currentElo;
    if (typeof s.streak==='number') state.streak = s.streak;
    if (typeof s.bestStreak==='number') state.bestStreak = s.bestStreak;
    if (typeof s.totalAttempts==='number') state.totalAttempts = s.totalAttempts;
    if (typeof s.totalCorrect==='number') state.totalCorrect = s.totalCorrect;
    if (s.categoryStats) state.categoryStats = s.categoryStats;
    if (Array.isArray(s.eloHistory)) state.eloHistory = s.eloHistory;
  }catch{}
}
function saveAll(){
  const snap = {
    currentElo: state.currentElo,
    streak: state.streak, bestStreak: state.bestStreak,
    totalAttempts: state.totalAttempts, totalCorrect: state.totalCorrect,
    categoryStats: state.categoryStats, eloHistory: state.eloHistory
  };
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(snap)); }catch{}
}

// ---------- ELO ----------
function expectedScore(p, q){ return 1/(1+Math.pow(10,(q-p)/400)); }
function updateElo(p, q, ok){
  const delta = Math.round(K_FACTOR * ((ok?1:0) - expectedScore(p,q)) * (1 + 0.1*Math.floor(state.streak/5)));
  const next = Math.max(0, Math.round(p + delta));
  state.eloHistory.push({ts:Date.now(), elo:next});
  if (state.eloHistory.length>500) state.eloHistory.shift();
  return { next };
}

// ---------- canvas sizing / zoom ----------
function setBackingStore(){
  // CSS size in CSS px (tall page = 300vh)
  state.cssW = window.innerWidth;
  state.cssH = Math.floor(window.innerHeight * 3);
  state.dpr  = window.devicePixelRatio || 1;

  const c = el.canvas;
  const ctx = c.getContext('2d');

  c.width  = Math.max(1, Math.floor(state.cssW * state.dpr));
  c.height = Math.max(1, Math.floor(state.cssH * state.dpr));
  c.style.width  = state.cssW + 'px';
  c.style.height = state.cssH + 'px';

  // map 1 unit = 1 CSS pixel
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

function redrawSnapshot(){
  const c = el.canvas;
  const ctx = c.getContext('2d');

  // clear whole backing store
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,c.width,c.height);

  const dataUrl = state.history[state.idx];
  if (!dataUrl){
    // re-apply DPR mapping for next strokes
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    return;
  }

  const img = new Image();
  img.onload = () => {
    // stretch snapshot to current backing-store size
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // return to CSS-pixel space for drawing
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  };
  img.src = dataUrl;
}

function handleZoomOrResize(){
  const prevDpr = state.dpr, prevW = state.cssW, prevH = state.cssH;
  setBackingStore();
  // If anything changed (DPR or viewport), redraw last snapshot (no history change)
  if (state.dpr !== prevDpr || state.cssW !== prevW || state.cssH !== prevH){
    redrawSnapshot();
  }
}

// Reliable DPR polling (covers Ctrl+ / Ctrl- zoom on all major browsers)
let _zoomPoller = null;
function startZoomPolling(){
  if (_zoomPoller) return;
  let lastDpr = window.devicePixelRatio || 1;
  let lastW = window.innerWidth, lastH = window.innerHeight;
  _zoomPoller = setInterval(()=>{
    const d = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    if (Math.abs(d - lastDpr) > 1e-6 || w !== lastW || h !== lastH){
      lastDpr = d; lastW = w; lastH = h;
      handleZoomOrResize();
    }
  }, 150);
}

function pushSnapshot(){
  try{
    const d = el.canvas.toDataURL();
    if (state.idx < state.history.length-1) state.history = state.history.slice(0, state.idx+1);
    state.history.push(d);
    if (state.history.length > state.maxSteps) state.history.shift();
    state.idx = state.history.length - 1;
  }catch(e){ console.warn('snapshot failed', e); }
}
function undo(){ if (state.idx<=0) return; state.idx--; redrawSnapshot(); }
function redo(){ if (state.idx>=state.history.length-1) return; state.idx++; redrawSnapshot(); }

// ---------- pointer mapping ----------
function getPos(e){
  const r = el.canvas.getBoundingClientRect(); // CSS px box
  const touch = e.touches && e.touches[0];
  const clientX = touch ? touch.clientX : e.clientX;
  const clientY = touch ? touch.clientY : e.clientY;
  // CSS-pixel coords; context is scaled to DPR, so this maps 1:1
  return { x: clientX - r.left, y: clientY - r.top };
}

// ---------- drawing ----------
function startDraw(e){
  state.isDrawing = true;
  const ctx = el.canvas.getContext('2d');
  // always enforce current DPR before drawing (guards against drift)
  ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  const p = getPos(e);
  state.lastX = p.x; state.lastY = p.y;
  ctx.beginPath(); ctx.moveTo(state.lastX, state.lastY);
}
function moveDraw(e){
  if (!state.isDrawing) return;
  const ctx = el.canvas.getContext('2d');
  ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  ctx.strokeStyle = state.currentColor;
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const p = getPos(e);
  ctx.lineTo(p.x, p.y); ctx.stroke();
  state.lastX = p.x; state.lastY = p.y;
}
function endDraw(){
  if (!state.isDrawing) return;
  state.isDrawing = false;
  pushSnapshot(); // snapshot after stroke
}
function clearCanvas(){
  const c = el.canvas, ctx = c.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,c.width,c.height);
  ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
  pushSnapshot();
}

// ---------- question UI ----------
function toggleQuestionBox(){ state.questionBoxVisible ? hideQ() : showQ(); }
function hideQ(){ el.questionContainer.style.transform='translateY(-100px)'; el.questionContainer.style.opacity='0'; state.questionBoxVisible=false; el.toggleQuestionBtn.innerHTML='▼ Show Question'; }
function showQ(){ el.questionContainer.style.transform='translateY(0)'; el.questionContainer.style.opacity='1'; state.questionBoxVisible=true; el.toggleQuestionBtn.innerHTML='▲ Hide Question'; }

function renderQuestion(q){
  state.currentQuestion = q;
  try{ katex.render(q.latex || q.question, el.question); }
  catch{ el.question.textContent = q.question; }
  el.answerBox.value = ''; el.result.textContent = '';
  el.answerBox.focus();
}

function addCategoryStats(q, correct){
  const cats = Array.isArray(q.category) ? q.category : (q.category?[q.category]:[]);
  cats.forEach(c=>{
    const k = String(c||'').toLowerCase();
    if (!state.categoryStats[k]) state.categoryStats[k] = {attempts:0, correct:0};
    state.categoryStats[k].attempts++;
    if (correct) state.categoryStats[k].correct++;
  });
}

// ---------- confetti ----------
function launchConfetti(durationMs=1200, count=60){
  const canvas = el.confetti;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  function resize(){
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width='100%'; canvas.style.height='100%';
    ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
  }
  resize();
  const parts = Array.from({length:count}).map(()=>({
    x: Math.random()*window.innerWidth, y: -20 - Math.random()*40,
    r: 2 + Math.random()*4, vx: -1 + Math.random()*2, vy: 2 + Math.random()*3, a: Math.random()*Math.PI*2
  }));
  const start = performance.now();
  function step(t){
    const dt = t - start;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    parts.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.a += 0.1;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.a);
      ctx.fillStyle = `hsl(${(p.x+p.y)%360}, 80%, 60%)`; ctx.fillRect(-p.r,-p.r,2*p.r,2*p.r);
      ctx.restore();
    });
    if (dt<durationMs) requestAnimationFrame(step); else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  requestAnimationFrame(step);
}

// ---------- init ----------
async function initGame(){
  try{
    const resp = await fetch('questions.json');
    const payload = await resp.json();
    state.questions = payload.questions || payload;

    const storedElo = localStorage.getItem('selectedElo');
    if (storedElo && !isNaN(+storedElo)) state.currentElo = +storedElo;

    loadSave();

    el.clearDrawingBtn.addEventListener('click', clearCanvas);
    el.toggleQuestionBtn.addEventListener('click', toggleQuestionBox);
    el.answerBox.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submitAnswer(); });
    if (el.nextQuestionPersistentBtn) {
      el.nextQuestionPersistentBtn.addEventListener('click', () => {
        clearRedirect();
        window.location.href = '../question_selector.html';
      });
    }
    el.submitBtn.addEventListener('click', submitAnswer);

    el.colorPickerBtn?.addEventListener('click', ()=> el.colorDropdown?.classList.toggle('hidden'));
    el.colorOptions?.forEach(opt=>{
      opt.addEventListener('click', ()=>{
        state.currentColor = opt.getAttribute('data-color') || '#ffffff';
        if (el.currentColorPreview) el.currentColorPreview.style.background = state.currentColor;
        el.colorDropdown?.classList.add('hidden');
      });
    });

    // Canvas init
    setBackingStore();
    // Baseline snapshot so first undo is safe
    pushSnapshot();

    // Pointer events
    el.canvas.addEventListener('mousedown', startDraw);
    el.canvas.addEventListener('mousemove', moveDraw);
    el.canvas.addEventListener('mouseup', endDraw);
    el.canvas.addEventListener('mouseout', endDraw);
    el.canvas.addEventListener('touchstart', startDraw, {passive:true});
    el.canvas.addEventListener('touchmove', moveDraw, {passive:true});
    el.canvas.addEventListener('touchend', endDraw);

    // Resize/zoom
    window.addEventListener('resize', handleZoomOrResize);
    startZoomPolling();

    // Question selection
    const selectedId = localStorage.getItem('selectedQuestionId');
    if (selectedId){
      const idNum = parseInt(selectedId,10);
      const sel = state.questions.find(q=>q.id===idNum);
      if (sel){ renderQuestion(sel); localStorage.removeItem('selectedQuestionId'); }
      else { renderRandom(); }
    } else { renderRandom(); }

    // Keyboard undo/redo
    document.addEventListener('keydown', (e)=>{
      const meta = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (!meta) return;
      if (k==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
      else if (k==='y' || (k==='z' && e.shiftKey)){ e.preventDefault(); redo(); }
    });
  }catch(err){
    console.error('init error', err);
    el.result.textContent = 'Failed to initialize.';
  }
}

function renderRandom(){
  const pool = state.questions.length ? state.questions : [];
  const pick = pool[Math.floor(Math.random()*pool.length)];
  if (pick) renderQuestion(pick);
}

// ---------- submit ----------
function toNumber(x){
  if (typeof x==='number') return x;
  const s = String(x).trim();
  if (/^[+-]?\d+\/[+-]?\d+$/.test(s)){ const [a,b]=s.split('/').map(Number); if (b!==0) return a/b; }
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
function isAnswerCorrect(user, key){
  const u = toNumber(user), k = toNumber(key);
  if (u!==null && k!==null) return Math.abs(u-k) < 1e-9;
  return String(user).trim().toLowerCase() === String(key).trim().toLowerCase();
}
let redirectTimer = null;
let redirectTimer2 = null;
let stayHere = false;
let reminderInterval = null;
let countdownSeconds = 10;
let countdownInterval = null;

function clearRedirect(){
  if (redirectTimer) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }
  if (redirectTimer2) {
    clearTimeout(redirectTimer2);
    redirectTimer2 = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
  stayHere = false;
  countdownSeconds = 10;
}

function updateCountdown(){
  if (stayHere) return;
  
  const countdownEl = document.getElementById('countdown-timer');
  if (countdownEl) {
    countdownEl.textContent = countdownSeconds;
  }
  
  if (countdownSeconds <= 0) {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (!stayHere) {
      window.location.href = '../home.html';
    }
    return;
  }
  
  countdownSeconds--;
}

function showRedirectMessage(){
  if (stayHere) {
    return;
  }
  
  countdownSeconds = 10;
  
  el.resultText.innerHTML =
    '<div class="result-badge result-badge--ok">Solved</div>' +
    '<p class="result-dialog__title">Correct</p>' +
    '<p class="result-dialog__text">Choose your next move—or let the timer take you home.</p>' +
    redirectActionsHtml();
  
  // Start countdown
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateCountdown, 1000);
  
  // Use event delegation or immediate binding
  setTimeout(() => {
    const stayBtn = document.getElementById('stay-btn');
    if (stayBtn) {
      stayBtn.onclick = () => {
        stayHere = true;
        clearRedirect();
        // Hide overlay so they can see their solution
        setResultOverlay(false);
        // Show persistent Next Question button
        if (el.nextQuestionContainer) {
          el.nextQuestionContainer.style.display = 'block';
        }
        startReminderInterval();
      };
    }
    
    const nextQuestionBtn = document.getElementById('next-question-btn');
    if (nextQuestionBtn) {
      nextQuestionBtn.onclick = () => {
        clearRedirect();
        window.location.href = '../question_selector.html';
      };
    }
  }, 50);
}

function startReminderInterval(){
  // Clear any existing interval
  if (reminderInterval) clearInterval(reminderInterval);
  
  // Show reminder every 4 minutes
  reminderInterval = setInterval(() => {
    if (confirm('Do you want to go back to the home page?')) {
      clearRedirect();
      window.location.href = '../home.html';
    }
  }, 4 * 60 * 1000); // 4 minutes
}

function submitAnswer(){
  const now = Date.now(); if (now - state.lastAnswerTime < 600) return; state.lastAnswerTime = now;
  const q = state.currentQuestion; if (!q){ el.result.textContent='No question loaded.'; return; }
  const user = el.answerBox.value; if (!String(user).trim()){ el.result.textContent='Please enter an answer.'; return; }

  // Clear any existing timers
  clearRedirect();
  stayHere = false;

  state.totalAttempts++;
  const ok = isAnswerCorrect(user, q.answer);
  if (ok){ state.streak++; state.bestStreak = Math.max(state.bestStreak, state.streak); state.totalCorrect++; }
  else { state.streak = 0; }

  const qE = (typeof q.elo==='number') ? q.elo : state.currentElo;
  const { next } = updateElo(state.currentElo, qE, ok);
  state.currentElo = next;

  addCategoryStats(q, ok);
  saveAll();

  // Hide persistent Next Question button initially
  if (el.nextQuestionContainer) {
    el.nextQuestionContainer.style.display = 'none';
  }
  
  setResultOverlay(true);
  if (ok){ 
    el.resultText.innerHTML =
      '<div class="result-badge result-badge--ok">Correct</div>' +
      '<p class="result-dialog__title">Nice solve.</p>' +
      '<p class="result-dialog__text">Next step unlocks in a moment…</p>';
    launchConfetti(1200, 70);
    redirectTimer = setTimeout(() => {
      showRedirectMessage();
    }, 5000);
  } else { 
    el.resultText.innerHTML =
      '<div class="result-badge result-badge--no">Review</div>' +
      '<p class="result-dialog__title">Not quite</p>' +
      '<p class="result-dialog__text">Expected answer</p>' +
      '<p class="result-dialog__answer">' + escapeHtml(q.answer) + '</p>' +
      redirectActionsHtml();
    
    // Start countdown immediately for wrong answers
    countdownSeconds = 10;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(updateCountdown, 1000);
    
    // Attach button handlers
    setTimeout(() => {
      const stayBtn = document.getElementById('stay-btn');
      if (stayBtn) {
        stayBtn.onclick = () => {
          stayHere = true;
          clearRedirect();
          // Hide overlay so they can see their solution
          setResultOverlay(false);
          // Show persistent Next Question button
          if (el.nextQuestionContainer) {
            el.nextQuestionContainer.style.display = 'block';
          }
          startReminderInterval();
        };
      }
      
      const nextQuestionBtn = document.getElementById('next-question-btn');
      if (nextQuestionBtn) {
        nextQuestionBtn.onclick = () => {
          clearRedirect();
          window.location.href = '../question_selector.html';
        };
      }
    }, 50);
  }
}

document.addEventListener('DOMContentLoaded', initGame);
