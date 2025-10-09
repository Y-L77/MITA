// logic.js — Single-player Canvas (v4)
// Changes:
// • Removed ELO display elements. Keeps ELO math & persistence silently for stats.
// • On submit: show overlay for ~2.2s.
//    - Incorrect → "Incorrect. Answer: ..." then redirect to Home.
//    - Correct → "Correct!" + mini confetti, then redirect to Home.
// • Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Shift+Ctrl/Cmd+Z redo.
// • Retains your canvas/color/toggle/KaTeX IDs & structure.

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

const elements = {
  question: document.getElementById('question'),
  answerBox: document.getElementById('answer-box'),
  submitBtn: document.getElementById('submit-btn'),
  result: document.getElementById('result'),
  changeEloBtn: document.getElementById('change-elo-btn'), // hidden now
  clearDrawingBtn: document.getElementById('clear-drawing-btn'),
  canvas: document.getElementById('drawing-canvas'),
  hiddenFocusHelper: document.getElementById('hidden-focus-helper'),
  toggleQuestionBtn: document.getElementById('toggle-question-btn'),
  questionContainer: document.getElementById('question-container'),
  colorPickerBtn: document.getElementById('color-picker-btn'),
  colorDropdown: document.getElementById('color-dropdown'),
  colorOptions: document.querySelectorAll('.color-option'),
  currentColorPreview: document.getElementById('current-color-preview'),
  resultOverlay: document.getElementById('result-overlay'),
  resultText: document.getElementById('result-text'),
  confetti: document.getElementById('confetti'),
};

const state = {
  currentQuestion: null,
  questions: [],
  currentElo: 300,
  isDrawing: false,
  lastX: 0, lastY: 0,
  savedDrawing: null,
  drawingHistory: [],
  maxUndoSteps: 20,
  currentHistoryIndex: -1,
  lastAnswerTime: 0,
  questionBoxVisible: true,
  currentColor: "#ffffff",
  // stats
  streak: 0,
  bestStreak: 0,
  totalAttempts: 0,
  totalCorrect: 0,
  categoryStats: {},
  eloHistory: []
};

// ---------- persistence ----------
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    if (typeof s.currentElo === 'number') state.currentElo = s.currentElo;
    if (typeof s.streak === 'number') state.streak = s.streak;
    if (typeof s.bestStreak === 'number') state.bestStreak = s.bestStreak;
    if (typeof s.totalAttempts === 'number') state.totalAttempts = s.totalAttempts;
    if (typeof s.totalCorrect === 'number') state.totalCorrect = s.totalCorrect;
    if (s.categoryStats) state.categoryStats = s.categoryStats;
    if (Array.isArray(s.eloHistory)) state.eloHistory = s.eloHistory;
  } catch {}
}
function saveAll() {
  const snap = {
    currentElo: state.currentElo,
    streak: state.streak,
    bestStreak: state.bestStreak,
    totalAttempts: state.totalAttempts,
    totalCorrect: state.totalCorrect,
    categoryStats: state.categoryStats,
    eloHistory: state.eloHistory
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(snap)); } catch {}
}

// ---------- ELO ----------
function expectedScore(playerElo, questionElo) {
  return 1 / (1 + Math.pow(10, (questionElo - playerElo) / 400));
}
function updateElo(playerElo, questionElo, correct) {
  const expected = expectedScore(playerElo, questionElo);
  const score = correct ? 1 : 0;
  const streakBonus = 1 + 0.1 * Math.floor(state.streak / 5);
  const delta = Math.round(K_FACTOR * (score - expected) * streakBonus);
  const next = Math.max(0, Math.round(playerElo + delta));
  state.eloHistory.push({ ts: Date.now(), elo: next });
  if (state.eloHistory.length > 500) state.eloHistory.shift();
  return { next };
}

// ---------- answer checking ----------
function parseFraction(str) {
  const s = String(str).trim();
  if (/^[+-]?\d+\/[+-]?\d+$/.test(s)) { const [n,d]=s.split('/').map(Number); if (d!==0) return n/d; }
  return null;
}
function toNumber(x) {
  if (typeof x === 'number') return x;
  const f = parseFraction(x); if (f !== null) return f;
  const n = Number(String(x).trim()); return Number.isFinite(n) ? n : null;
}
function isAnswerCorrect(user, key) {
  const uNum = toNumber(user), kNum = toNumber(key);
  if (uNum !== null && kNum !== null) return Math.abs(uNum - kNum) < 1e-9;
  return String(user).trim().toLowerCase() === String(key).trim().toLowerCase();
}

// ---------- drawing ----------
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const ctx = elements.canvas.getContext('2d');
  elements.canvas.width = Math.floor(window.innerWidth * dpr);
  elements.canvas.height = Math.floor(window.innerHeight * 3 * dpr); // 300vh
  elements.canvas.style.width = '100vw';
  elements.canvas.style.height = '300vh';
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);
}
function saveCanvasState() {
  try { state.savedDrawing = elements.canvas.toDataURL(); } catch {}
  state.drawingHistory.push(state.savedDrawing);
  if (state.drawingHistory.length > state.maxUndoSteps) state.drawingHistory.shift();
  state.currentHistoryIndex = state.drawingHistory.length - 1;
}
function restoreCanvasState() {
  const dataUrl = state.drawingHistory[state.currentHistoryIndex];
  if (!dataUrl) return;
  const img = new Image();
  img.onload = () => {
    const ctx = elements.canvas.getContext('2d');
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = dataUrl;
}
function undoLastStroke() { if (state.currentHistoryIndex<=0) return; state.currentHistoryIndex--; restoreCanvasState(); }
function redoLastStroke() { if (state.currentHistoryIndex>=state.drawingHistory.length-1) return; state.currentHistoryIndex++; restoreCanvasState(); }
function getPos(e) {
  const r = elements.canvas.getBoundingClientRect();
  if (e.touches && e.touches[0]) return { x:e.touches[0].clientX - r.left, y:e.touches[0].clientY - r.top };
  return { x:e.clientX - r.left, y:e.clientY - r.top };
}
function startDrawing(e){ saveCanvasState(); state.isDrawing=true; const ctx=elements.canvas.getContext('2d'); const p=getPos(e); [state.lastX,state.lastY]=[p.x,p.y]; ctx.beginPath(); ctx.moveTo(state.lastX,state.lastY); }
function draw(e){ if(!state.isDrawing) return; const ctx=elements.canvas.getContext('2d'); ctx.strokeStyle=state.currentColor; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round'; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); [state.lastX,state.lastY]=[p.x,p.y]; }
function stopDrawing(){ state.isDrawing=false; }
function clearDrawing(){ const ctx=elements.canvas.getContext('2d'); ctx.clearRect(0,0,elements.canvas.width,elements.canvas.height); saveCanvasState(); }

// ---------- question UI ----------
function toggleQuestionBox(){ state.questionBoxVisible ? hideQuestionBox() : showQuestionBox(); }
function hideQuestionBox(){ elements.questionContainer.style.transform='translateY(-100px)'; elements.questionContainer.style.opacity='0'; state.questionBoxVisible=false; elements.toggleQuestionBtn.innerHTML='▼ Show Question'; }
function showQuestionBox(){ elements.questionContainer.style.transform='translateY(0)'; elements.questionContainer.style.opacity='1'; state.questionBoxVisible=true; elements.toggleQuestionBtn.innerHTML='▲ Hide Question'; }

function renderQuestion(q) {
  state.currentQuestion = q;
  try { katex.render(q.latex || q.question, elements.question); }
  catch { elements.question.textContent = q.question; }
  elements.answerBox.value = '';
  elements.answerBox.focus();
  elements.result.textContent = '';
}

function addCategoryStats(q, correct) {
  const cats = Array.isArray(q.category) ? q.category : (q.category?[q.category]:[]);
  cats.forEach(c=>{
    const key = String(c||'').toLowerCase();
    if (!state.categoryStats[key]) state.categoryStats[key] = { attempts:0, correct:0 };
    state.categoryStats[key].attempts++;
    if (correct) state.categoryStats[key].correct++;
  });
}

// ---------- confetti ----------
function launchConfetti(durationMs=1200, count=60){
  const canvas = elements.confetti;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  function resize(){
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
  }
  resize();
  const particles = Array.from({length:count}).map(()=>({
    x: Math.random()*window.innerWidth,
    y: -20 - Math.random()*40,
    r: 2 + Math.random()*4,
    vx: -1 + Math.random()*2,
    vy: 2 + Math.random()*3,
    a: Math.random()*Math.PI*2
  }));
  const start = performance.now();
  function step(t){
    const elapsed = t - start;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.a += 0.1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = `hsl(${(p.x+p.y)%360}, 80%, 60%)`;
      ctx.fillRect(-p.r, -p.r, 2*p.r, 2*p.r);
      ctx.restore();
    });
    if (elapsed < durationMs) requestAnimationFrame(step); else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  requestAnimationFrame(step);
}

// ---------- init ----------
async function initGame() {
  try {
    // load questions
    const resp = await fetch('questions.json');
    const payload = await resp.json();
    state.questions = payload.questions || payload;

    // seed from selector
    const storedElo = localStorage.getItem('selectedElo');
    if (storedElo && !isNaN(parseInt(storedElo,10))) state.currentElo = parseInt(storedElo,10);

    loadSave();

    // UI wires
    elements.clearDrawingBtn.addEventListener('click', clearDrawing);
    elements.toggleQuestionBtn.addEventListener('click', toggleQuestionBox);
    elements.answerBox.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submitAnswer(); });
    elements.submitBtn.addEventListener('click', submitAnswer);

    elements.colorPickerBtn?.addEventListener('click', ()=>{ elements.colorDropdown?.classList.toggle('hidden'); });
    elements.colorOptions?.forEach(opt=>{
      opt.addEventListener('click', ()=>{
        const color = opt.getAttribute('data-color');
        state.currentColor = color || '#ffffff';
        if (elements.currentColorPreview) elements.currentColorPreview.style.background = state.currentColor;
        elements.colorDropdown?.classList.add('hidden');
      });
    });

    // canvas
    resizeCanvas(); saveCanvasState();
    elements.canvas.addEventListener('mousedown', startDrawing);
    elements.canvas.addEventListener('mousemove', draw);
    elements.canvas.addEventListener('mouseup', stopDrawing);
    elements.canvas.addEventListener('mouseout', stopDrawing);
    elements.canvas.addEventListener('touchstart', startDrawing, {passive:true});
    elements.canvas.addEventListener('touchmove', draw, {passive:true});
    elements.canvas.addEventListener('touchend', stopDrawing);
    window.addEventListener('resize', ()=>{ saveCanvasState(); resizeCanvas(); });

    // selected question or fallback
    const selectedQuestionId = localStorage.getItem('selectedQuestionId');
    if (selectedQuestionId) {
      const idNum = parseInt(selectedQuestionId, 10);
      const selected = state.questions.find(q => q.id === idNum);
      if (selected) {
        renderQuestion(selected);
        localStorage.removeItem('selectedQuestionId'); // one-shot
      } else {
        renderRandom();
      }
    } else {
      renderRandom();
    }

    // Keyboard: undo/redo
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase(); const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (key === 'z' && !e.shiftKey){ e.preventDefault(); undoLastStroke(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)){ e.preventDefault(); redoLastStroke(); }
    });

  } catch (err) {
    console.error('init error', err);
    elements.result.textContent = 'Failed to initialize.';
  }
}

function renderRandom(){
  const pool = state.questions.length ? state.questions : [];
  const pick = pool[Math.floor(Math.random()*pool.length)];
  if (pick) renderQuestion(pick);
}

// ---------- submit ----------
function submitAnswer() {
  const now = Date.now();
  if (now - state.lastAnswerTime < 600) return;
  state.lastAnswerTime = now;

  const q = state.currentQuestion;
  if (!q) { elements.result.textContent = 'No question loaded.'; return; }
  const user = elements.answerBox.value;
  if (!String(user).trim()) { elements.result.textContent = 'Please enter an answer.'; return; }

  state.totalAttempts++;
  const correct = isAnswerCorrect(user, q.answer);
  if (correct) {
    state.streak++;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.totalCorrect++;
  } else {
    state.streak = 0;
  }

  // ELO vs question (silent)
  const qElo = (typeof q.elo === 'number') ? q.elo : state.currentElo;
  const { next } = updateElo(state.currentElo, qElo, correct);
  state.currentElo = next;

  // Category stats
  addCategoryStats(q, correct);

  // Persist
  saveAll();

  // Show overlay result 2.2s then go Home
  elements.resultOverlay.style.display = 'flex';
  if (correct) {
    elements.resultText.textContent = '✅ Correct!';
    launchConfetti(1200, 70);
  } else {
    elements.resultText.textContent = `❌ Incorrect. Answer: ${q.answer}`;
  }
  setTimeout(()=>{ location.href = 'index.html'; }, 2200);
}

document.addEventListener('DOMContentLoaded', initGame);
