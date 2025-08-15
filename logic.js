//hi yipeng lu vibecoded this directory (MITA_PROBLEMGEN), anything beyond 
//general questions on this folder, send me a dm on discord or yipeng.dev@gmail.com
//2025 august 14

// ======================
//  CONFIGURATION
// ======================
const ELO_TIERS = [
  { min: 0, max: 200, name: "Elementary" },
  { min: 200, max: 400, name: "Middle Schooler" },
  { min: 400, max: 600, name: "High Schooler" },
  { min: 600, max: 800, name: "Senior" },
  { min: 800, max: 1200, name: "Regionals" },
  { min: 1200, max: 1700, name: "Nationalist" },
  { min: 1700, max: 2000, name: "Olympian" }
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
  canvas: document.getElementById('drawing-canvas')
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
  lastY: 0
};

// ======================
//  DRAWING FUNCTIONS
// ======================
function setupDrawing() {
  const ctx = elements.canvas.getContext('2d');
  elements.canvas.width = window.innerWidth;
  elements.canvas.height = window.innerHeight;
  
  ctx.strokeStyle = '#ffffff';
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
}

function startDrawing(e) {
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
  const pos = getPosition(e);
  
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  [state.lastX, state.lastY] = [pos.x, pos.y];
}

function stopDrawing() {
  state.isDrawing = false;
}

function clearDrawing() {
  const ctx = elements.canvas.getContext('2d');
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
}

function getPosition(e) {
  if (e.touches) {
    return {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  }
  return {
    x: e.clientX,
    y: e.clientY
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
  try {
    katex.render(question.latex || question.question, elements.question);
  } catch (error) {
    console.error("KaTeX render error:", error);
    elements.question.textContent = question.question;
  }
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
    if (pool.length > 0) {
      renderQuestion(pool[Math.floor(Math.random() * pool.length)]);
    } else {
      elements.result.textContent = "No questions available for this ELO";
    }
  }
}

async function initGame() {
  try {
    state.questions = await loadQuestions();
    
    if (state.questions.length === 0) {
      throw new Error("No questions available");
    }

    // Initialize ELO display
    updateEloDisplay();
    setupDrawing();

    // Submit answer handler
    elements.submitBtn.addEventListener('click', () => {
      const userAnswer = parseFloat(elements.answerBox.value);
      if (isNaN(userAnswer)) {
        elements.result.textContent = "Please enter a valid number";
        return;
      }

      const isCorrect = userAnswer === state.currentQuestion?.answer;
      
      elements.result.textContent = isCorrect 
        ? "✅ Correct!" 
        : `❌ Try again! (Answer: ${state.currentQuestion?.answer})`;
      
      setTimeout(() => {
        const pool = getQuestionsInEloRange(state.currentElo);
        if (pool.length > 0) {
          renderQuestion(pool[Math.floor(Math.random() * pool.length)]);
        }
      }, 2000);
    });

    // Manual ELO change handler
    elements.changeEloBtn.addEventListener('click', handleEloChange);

    // Keyboard support
    elements.answerBox.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        elements.submitBtn.click();
      }
    });

    // Initial render
    const initialPool = getQuestionsInEloRange(state.currentElo);
    if (initialPool.length > 0) {
      renderQuestion(initialPool[Math.floor(Math.random() * initialPool.length)]);
    }

  } catch (error) {
    console.error("Game initialization failed:", error);
    elements.result.textContent = "Failed to initialize game. Check console for details.";
  }
}

// Start the game
document.addEventListener('DOMContentLoaded', initGame);