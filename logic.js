// ======================
//  CONFIGURATION
// ======================
const ELO_TIERS = [
  { min: 0, max: 200, name: "Elementary" },
  { min: 200, max: 400, name: "Middle Schooler" },
  { min: 400, max: 600, name: "High Schooler" },
  { min: 600, max: 800, name: "Senior" },
  { min: 800, max: 1200, name: "Regionals" },
  { min: 1200, max: 1700, name: "Nationalist" }, //bulk of the questions and probably contestants
  { min: 1700, max: 2000, name: "Olympian" }, //are you really legit?
  { min: 2000, max: 9999, name: "Grandmaster" } //try to get past this cheater, no AI cracking these questions
];

// ======================
//  DOM ELEMENTS
// ======================
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
  questionContainer: document.getElementById('question-container')
};

// ======================
//  GAME STATE
// ======================
const state = {
  currentQuestion: null,
  questions: [],
  currentElo: 300,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  savedDrawing: null,
  drawingHistory: [],
  maxUndoSteps: 20,
  currentHistoryIndex: -1,
  lastAnswerTime: 0,
  questionBoxVisible: true,
  currentColor: "#ffffff" // default white stroke
};

// ======================
//  DRAWING FUNCTIONS (WITH UNDO)
// ======================
function setupDrawing() {
  const ctx = elements.canvas.getContext('2d');
  resizeCanvas();

  ctx.strokeStyle = state.currentColor;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Mouse events
  elements.canvas.addEventListener('mousedown', startDrawing);
  elements.canvas.addEventListener('mousemove', draw);
  elements.canvas.addEventListener('mouseup', stopDrawing);
  elements.canvas.addEventListener('mouseout', stopDrawing);

  // Touch events for mobile
  elements.canvas.addEventListener('touchstart', handleTouchStart);
  elements.canvas.addEventListener('touchmove', handleTouchMove);
  elements.canvas.addEventListener('touchend', stopDrawing);

  // Clear drawing button
  elements.clearDrawingBtn.addEventListener('click', clearDrawing);

  // Handle window resize
  window.addEventListener('resize', () => {
    saveCanvasState();
    resizeCanvas();
  });

  // Undo/Redo functionality
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
      if (e.key === 'z') undoLastStroke();
      if (e.key === 'y') redoLastStroke();
    }
  });

  // Initial empty state
  saveCanvasState();
}

function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight * 3; // 3x viewport height

  if (elements.canvas.width !== width || elements.canvas.height !== height) {
    elements.canvas.width = width;
    elements.canvas.height = height;

    const ctx = elements.canvas.getContext('2d');
    ctx.strokeStyle = state.currentColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    restoreCanvasState();
  }
}

function saveCanvasState() {
  const currentState = elements.canvas.toDataURL();
  if (state.drawingHistory[state.currentHistoryIndex] === currentState) return;
  if (state.currentHistoryIndex < state.drawingHistory.length - 1) {
    state.drawingHistory = state.drawingHistory.slice(0, state.currentHistoryIndex + 1);
  }

  state.drawingHistory.push(currentState);
  state.currentHistoryIndex++;

  if (state.drawingHistory.length > state.maxUndoSteps) {
    state.drawingHistory.shift();
    state.currentHistoryIndex--;
  }
}

function restoreCanvasState() {
  if (state.currentHistoryIndex < 0 || state.currentHistoryIndex >= state.drawingHistory.length) return;
  const img = new Image();
  img.onload = function () {
    const ctx = elements.canvas.getContext('2d');
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = state.drawingHistory[state.currentHistoryIndex];
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
  const pos = getPosition(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  [state.lastX, state.lastY] = [pos.x, pos.y];
}

function stopDrawing() {
  state.isDrawing = false;
  saveCanvasState();
}

function clearDrawing() {
  saveCanvasState();
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  saveCanvasState();
}

function getPosition(e) {
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  return e.touches ? {
    x: (e.touches[0].clientX - rect.left) * scaleX,
    y: (e.touches[0].clientY - rect.top) * scaleY
  } : {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function handleTouchStart(e) {
  e.preventDefault();
  startDrawing(e);
}

function handleTouchMove(e) {
  e.preventDefault();
  draw(e);
}

// ======================
// COLOR PICKER LOGIC (FIXED)
// ======================
function setupColorPicker() {
  const pickerBtn = document.getElementById("color-picker-btn");
  const dropdown = document.getElementById("color-dropdown");
  const preview = document.getElementById("current-color-preview");
  const options = document.querySelectorAll(".color-option");

  pickerBtn.addEventListener("click", () => {
    dropdown.classList.toggle("hidden");

    // Check if dropdown would overflow the viewport and adjust position
    const rect = dropdown.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      dropdown.style.top = "auto";
      dropdown.style.bottom = "40px"; // show above the button
    } else {
      dropdown.style.top = "";
      dropdown.style.bottom = "";
    }
  });

  options.forEach(opt => {
    opt.addEventListener("click", () => {
      const color = opt.dataset.color;
      state.currentColor = color;
      preview.style.background = color;
      dropdown.classList.add("hidden");
    });
  });

  // Close dropdown if clicking outside
  document.addEventListener("click", (e) => {
    if (!pickerBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });
}

// ======================
//  QUESTION BOX TOGGLE
// ======================
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

// ======================
//  UTILITY FUNCTIONS
// ======================
function getRankForElo(elo) {
  const tier = ELO_TIERS.find(r => elo >= r.min && elo < r.max);
  return tier ? tier.name : "Unknown";
}

function updateEloDisplay() {
  document.getElementById('elo-value').textContent = state.currentElo;
  elements.eloRank.textContent = getRankForElo(state.currentElo);
}

// ======================
//  ANSWER VALIDATION
// ======================
function parseUserAnswer(userInput) {
  userInput = userInput.trim();
  if (userInput.includes('/')) {
    const parts = userInput.split('/').map(part => part.trim());
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0]);
      const denominator = parseFloat(parts[1]);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    }
  }
  const decimal = parseFloat(userInput);
  if (!isNaN(decimal)) return decimal;
  return NaN;
}

function isAnswerCorrect(userAnswer, correctAnswer) {
  const tolerance = state.currentQuestion?.tolerance || 0.001;
  let correctValue = correctAnswer;
  if (typeof correctAnswer === 'string') correctValue = parseUserAnswer(correctAnswer);
  let userValue = userAnswer;
  if (typeof userAnswer === 'string') userValue = parseUserAnswer(userAnswer);
  if (!isNaN(correctValue) && !isNaN(userValue)) return Math.abs(userValue - correctValue) < tolerance;
  return String(userAnswer).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
}

// ======================
//  CORE FUNCTIONS
// ======================
async function loadQuestions() {
  try {
    const response = await fetch('questions.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.questions || data;
  } catch (error) {
    console.error("Question load failed:", error);
    return [
      { id: 1, question: "2 + 2", answer: 4, elo: 100, latex: "2 + 2" },
      { id: 2, question: "5x = 25", answer: 5, elo: 300, latex: "5x = 25" }
    ];
  }
}

function renderQuestion(question) {
  state.currentQuestion = question;
  try { katex.render(question.latex || question.question, elements.question); } 
  catch { elements.question.textContent = question.question; }
  elements.answerBox.value = '';
  elements.answerBox.focus();
  elements.result.textContent = '';
}

function getQuestionsInEloRange(elo) {
  const tier = ELO_TIERS.find(r => elo >= r.min && elo < r.max);
  return state.questions.filter(q => q.elo >= tier.min && q.elo < tier.max);
}

function handleEloChange() {
  const newElo = prompt("Enter new ELO rating:", state.currentElo);
  if (newElo && !isNaN(newElo)) {
    state.currentElo = Math.max(0, parseInt(newElo));
    updateEloDisplay();
    const pool = getQuestionsInEloRange(state.currentElo);
    if (pool.length > 0) renderQuestion(pool[Math.floor(Math.random() * pool.length)]);
    else elements.result.textContent = "No questions available for this ELO";
  }
}

async function initGame() {
  try {
    state.questions = await loadQuestions();
    if (state.questions.length === 0) throw new Error("No questions available");

    updateEloDisplay();
    setupDrawing();
    setupColorPicker();
    elements.toggleQuestionBtn.addEventListener('click', toggleQuestionBox);

    elements.submitBtn.addEventListener('click', () => {
      const now = Date.now();
      if (now - state.lastAnswerTime < 1000) return;
      state.lastAnswerTime = now;

      const userAnswer = elements.answerBox.value;
      if (!userAnswer.trim()) { elements.result.textContent = "Please enter an answer"; return; }

      const isCorrect = isAnswerCorrect(userAnswer, state.currentQuestion?.answer);
      elements.result.textContent = isCorrect ? "✅ Correct!" : `❌ Try again! (Answer: ${state.currentQuestion?.answer})`;

      setTimeout(() => {
        const pool = getQuestionsInEloRange(state.currentElo);
        if (pool.length > 0) renderQuestion(pool[Math.floor(Math.random() * pool.length)]);
      }, 2000);
    });

    elements.changeEloBtn.addEventListener('click', handleEloChange);
    elements.answerBox.addEventListener('keypress', (e) => { if (e.key === 'Enter') elements.submitBtn.click(); });

    const initialPool = getQuestionsInEloRange(state.currentElo);
    if (initialPool.length > 0) renderQuestion(initialPool[Math.floor(Math.random() * initialPool.length)]);
  } catch (error) {
    console.error("Game initialization failed:", error);
    elements.result.textContent = "Failed to initialize game. Check console for details.";
  }
}

document.addEventListener('DOMContentLoaded', initGame);
