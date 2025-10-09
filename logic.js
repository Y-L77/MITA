// logic.js — MITA Canvas Player (v3.1)
// ----------------------------------------------------------------------------------
// What changed vs v3.0:
// • Added global keyboard handlers: Ctrl/Cmd+Z → undo, Ctrl/Cmd+Y or Shift+Ctrl/Cmd+Z → redo.
// • Kept the coherent ELO system + persistence + category stats from v3.0.
// • Preserves your IDs, KaTeX render, canvas draw, color picker, question box toggle, “Change ELO”.
// ----------------------------------------------------------------------------------

/* ======================
   CONFIGURATION
====================== */
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

const SAVE_KEY = 'mita_save_v3';  // single store for elo + stats
const K_FACTOR = 24;              // tune later

/* ======================
   DOM ELEMENTS
====================== */
const elements = {
  question: document.getElementById('question'),
  answerBox: document.getElementById('answer-box'),
  submitBtn: document.getElementById('submit-btn'),
  result: document.getElementById('result'),
  eloDisplay: document.getElementById('elo-display'),
  eloRank: document.getElementById('elo-rank'),
  changeEloBtn: document.getElementById('change-elo-btn'),
  clearDrawingBtn: document.getElementById('clear-drawing-btn'),
  canvas: document.getElementById('drawing-canvas'),
  hiddenFocusHelper: document.getElementById('hidden-focus-helper'),
  toggleQuestionBtn: document.getElementById('toggle-question-btn'),
  questionContainer: document.getElementById('question-container'),
  colorPickerBtn: document.getElementById('color-picker-btn'),
  colorDropdown: document.getElementById('color-dropdown'),
  colorOptions: document.querySelectorAll('.color-option'),
  currentColorPreview: document.getElementById('current-color-preview'),
};

/* ======================
   GAME STATE
====================== */
const state = {
  // Question engine
  currentQuestion: null,
  questions: [],

  // Player
  currentElo: 300,

  // Canvas
  isDrawing: false,
  lastX: 0, lastY: 0,
  savedDrawing: null,
  drawingHistory: [],
  maxUndoSteps: 20,
  currentHistoryIndex: -1,

  // UI
  lastAnswerTime: 0,
  questionBoxVisible: true,
  currentColor: "#ffffff",

  // Stats
  streak: 0,
  bestStreak: 0,
  totalAttempts: 0,
  totalCorrect: 0,
  categoryStats: {},       // { [cat]: {attempts, correct} }
  eloHistory: []           // [{ts, elo}]
};

/* ======================
   PERSISTENCE
====================== */
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.currentElo === 'number') state.currentElo = s.currentElo;
    if (typeof s.streak === 'number') state.streak = s.streak;
    if (typeof s.bestStreak === 'number') state.bestStreak = s.bestStreak;
    if (typeof s.totalAttempts === 'number') state.totalAttempts = s.totalAttempts;
    if (typeof s.totalCorrect === 'number') state.totalCorrect = s.totalCorrect;
    if (s.categoryStats && typeof s.categoryStats === 'object') state.categoryStats = s.categoryStats;
    if (Array.isArray(s.eloHistory)) state.eloHistory = s.eloHistory;
  } catch {}
}
function saveAll() {
  const snapshot = {
    currentElo: state.currentElo,
    streak: state.streak,
    bestStreak: state.bestStreak,
    totalAttempts: state.totalAttempts,
    totalCorrect: state.totalCorrect,
    categoryStats: state.categoryStats,
    eloHistory: state.eloHistory
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot)); } catch {}
}

/* ======================
   ELO HELPERS
====================== */
function getRankForElo(elo) {
  const tier = ELO_TIERS.find(r => elo >= r.min && elo < r.max);
  return tier ? tier.name : "—";
}
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
  return { next, delta };
}
function updateEloDisplay() {
  document.getElementById('elo-value').textContent = state.currentElo;
  elements.eloRank.textContent = getRankForElo(state.currentElo);
}

/* ======================
   ANSWER CHECKING
====================== */
function parseFraction(str) {
  const s = String(str).trim();
  if (/^[+-]?\d+\/[+-]?\d+$/.test(s)) {
    const [n, d] = s.split('/').map(Number);
    if (d !== 0) return n / d;
  }
  return null;
}
function toNumber(x) {
  if (typeof x === 'number') return x;
  const f = parseFraction(x);
  if (f !== null) return f;
  const n = Number(String(x).trim());
  return Number.isFinite(n) ? n : null;
}
function isAnswerCorrect(user, key) {
  const uNum = toNumber(user);
  const kNum = toNumber(key);
  if (uNum !== null && kNum !== null) return Math.abs(uNum - kNum) < 1e-9;
  return String(user).trim().toLowerCase() === String(key).trim().toLowerCase();
}

/* ======================
   DRAWING
====================== */
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  elements.canvas.width = Math.floor(window.innerWidth * dpr);
  elements.canvas.height = Math.floor(window.innerHeight * 3 * dpr); // keep 300vh
  elements.canvas.style.width = '100vw';
  elements.canvas.style.height = '300vh';
  const ctx = elements.canvas.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0); // reset before scale to avoid compounding
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
function undoLastStroke() {
  if (state.currentHistoryIndex <= 0) return;
  state.currentHistoryIndex--;
  restoreCanvasState();
}
function redoLastStroke() {
  if (state.currentHistoryIndex >= state.drawingHistory.length - 1) return;
  state.currentHistoryIndex++;
  restoreCanvasState();
}
function getPosition(e) {
  const rect = elements.canvas.getBoundingClientRect();
  if (e.touches && e.touches[0]) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
function startDrawing(e) {
  saveCanvasState();
  state.isDrawing = true;
  const ctx = elements.canvas.getContext('2d');
  const pos = getPosition(e);
  [state.lastX, state.lastY] = [pos.x, pos.y];
  ctx.beginPath();
  ctx.moveTo(state.lastX, state.lastY);
}
function draw(e) {
  if (!state.isDrawing) return;
  const ctx = elements.canvas.getContext('2d');
  ctx.strokeStyle = state.currentColor;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pos = getPosition(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  [state.lastX, state.lastY] = [pos.x, pos.y];
}
function stopDrawing() { state.isDrawing = false; }
function clearDrawing() {
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  saveCanvasState();
}

/* ======================
   QUESTION UI
====================== */
function toggleQuestionBox() {
  if (state.questionBoxVisible) hideQuestionBox();
  else showQuestionBox();
}
function hideQuestionBox() {
  elements.questionContainer.style.transform = 'translateY(-100px)';
  elements.questionContainer.style.opacity = '0';
  state.questionBoxVisible = false;
  elements.toggleQuestionBtn.innerHTML = '▼ Show Question';
}
function showQuestionBox() {
  elements.questionContainer.style.transform = 'translateY(0)';
  elements.questionContainer.style.opacity = '1';
  state.questionBoxVisible = true;
  elements.toggleQuestionBtn.innerHTML = '▲ Hide Question';
}

/* ======================
   RENDER & SELECTION
====================== */
function renderQuestion(q) {
  state.currentQuestion = q;
  try { katex.render(q.latex || q.question, elements.question); }
  catch { elements.question.textContent = q.question; }
  elements.answerBox.value = '';
  elements.answerBox.focus();
  elements.result.textContent = '';
}
function getQuestionsInEloRange(elo) {
  const tier = ELO_TIERS.find(r => elo >= r.min && elo < r.max) || ELO_TIERS[0];
  return state.questions.filter(q => q.elo >= tier.min && q.elo < tier.max);
}
function handleEloChange() {
  const newElo = prompt("Enter new ELO rating:", state.currentElo);
  if (newElo && !isNaN(newElo)) {
    state.currentElo = Math.max(0, parseInt(newElo, 10));
    updateEloDisplay();
    const pool = getQuestionsInEloRange(state.currentElo);
    if (pool.length > 0) renderQuestion(pool[Math.floor(Math.random() * pool.length)]);
    else elements.result.textContent = "No questions available for this ELO";
    saveAll();
  }
}

/* ======================
   CATEGORY STATS UPDATE
====================== */
function addCategoryStats(q, correct) {
  const cats = Array.isArray(q.category) ? q.category : [];
  cats.forEach(c => {
    const key = String(c||'').toLowerCase();
    if (!state.categoryStats[key]) state.categoryStats[key] = { attempts: 0, correct: 0 };
    state.categoryStats[key].attempts += 1;
    if (correct) state.categoryStats[key].correct += 1;
  });
}

/* ======================
   INIT
====================== */
async function initGame() {
  try {
    // 1) Load questions
    const resp = await fetch('questions.json');
    const payload = await resp.json();
    state.questions = payload.questions || payload;

    // 2) ELO seed from selector if any
    const storedElo = localStorage.getItem('selectedElo');
    if (storedElo && !isNaN(parseInt(storedElo,10))) state.currentElo = parseInt(storedElo, 10);

    // 3) Hydrate from save
    loadSave();
    updateEloDisplay();

    // 4) Wire UI
    elements.clearDrawingBtn.addEventListener('click', clearDrawing);
    elements.toggleQuestionBtn.addEventListener('click', toggleQuestionBox);
    elements.changeEloBtn.addEventListener('click', handleEloChange);
    elements.answerBox.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submitAnswer(); });
    elements.submitBtn.addEventListener('click', submitAnswer);

    // Color picker
    elements.colorPickerBtn?.addEventListener('click', ()=>{
      elements.colorDropdown?.classList.toggle('hidden');
    });
    elements.colorOptions?.forEach(opt=>{
      opt.addEventListener('click', ()=>{
        const color = opt.getAttribute('data-color');
        state.currentColor = color || '#ffffff';
        if (elements.currentColorPreview) elements.currentColorPreview.style.background = state.currentColor;
        elements.colorDropdown?.classList.add('hidden');
      });
    });

    // Canvas draw
    resizeCanvas();
    saveCanvasState();
    elements.canvas.addEventListener('mousedown', startDrawing);
    elements.canvas.addEventListener('mousemove', draw);
    elements.canvas.addEventListener('mouseup', stopDrawing);
    elements.canvas.addEventListener('mouseout', stopDrawing);
    elements.canvas.addEventListener('touchstart', startDrawing, {passive:true});
    elements.canvas.addEventListener('touchmove', draw, {passive:true});
    elements.canvas.addEventListener('touchend', stopDrawing);
    window.addEventListener('resize', ()=>{ saveCanvasState(); resizeCanvas(); });

    // 5) One-time forced question from selector (if any)
    const selectedQuestionId = localStorage.getItem('selectedQuestionId');
    if (selectedQuestionId) {
      const idNum = parseInt(selectedQuestionId, 10);
      const selected = state.questions.find(q => q.id === idNum);
      if (selected) {
        renderQuestion(selected);
        localStorage.removeItem('selectedQuestionId'); // force only once
      } else {
        const pool = getQuestionsInEloRange(state.currentElo);
        renderQuestion(pool.length ? pool[Math.floor(Math.random()*pool.length)] : state.questions[Math.floor(Math.random()*state.questions.length)]);
      }
    } else {
      const pool = getQuestionsInEloRange(state.currentElo);
      renderQuestion(pool.length ? pool[Math.floor(Math.random()*pool.length)] : state.questions[Math.floor(Math.random()*state.questions.length)]);
    }

    // 6) GLOBAL KEYBOARD: Undo/Redo (Ctrl/Cmd+Z / Ctrl/Cmd+Y or Shift+Ctrl/Cmd+Z)
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;

      // Prevent interfering while typing answers unless modifier is pressed (we are)
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoLastStroke();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redoLastStroke();
      }
    });

  } catch (err) {
    console.error('Game init failed', err);
    elements.result.textContent = 'Failed to initialize game. Check console.';
  }
}

/* ======================
   SUBMIT HANDLER
====================== */
function submitAnswer() {
  const now = Date.now();
  if (now - state.lastAnswerTime < 600) return; // debounce
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

  // ELO vs question
  const qElo = (typeof q.elo === 'number') ? q.elo : state.currentElo;
  const { next, delta } = updateElo(state.currentElo, qElo, correct);
  state.currentElo = next;
  updateEloDisplay();

  // Category stats
  addCategoryStats(q, correct);

  // Persist
  saveAll();

  const sign = delta > 0 ? `+${delta}` : `${delta}`;
  elements.result.textContent = correct
    ? `✅ Correct! (${sign} ELO)  Streak: ${state.streak}`
    : `❌ Not quite. (${sign} ELO)  (Answer: ${q.answer})`;

  // Draw next after a short delay
  setTimeout(()=>{
    const pool = getQuestionsInEloRange(state.currentElo);
    const nextQ = pool.length ? pool[Math.floor(Math.random()*pool.length)] : state.questions[Math.floor(Math.random()*state.questions.length)];
    renderQuestion(nextQ);
  }, 1200);
}

/* ======================
   BOOT
====================== */
document.addEventListener('DOMContentLoaded', initGame);
