window.onerror = function(msg, url, line, col, err) {
  var el = document.getElementById('gameLoading');
  if (el) {
    el.id = '';
    el.style.color = '#f88';
    el.textContent = (msg || 'Error') + (err && err.stack ? '\n' + err.stack : '');
  }
  return false;
};
const canvas = document.getElementById('gameCanvas');
if (!canvas) {
  document.body.innerHTML = '<p style="color:#f88;font:1.2rem monospace;padding:20px;">Canvas #gameCanvas not found.</p>';
  throw new Error('Canvas not found');
}
const ctx = canvas.getContext('2d');
if (!ctx) {
  document.body.innerHTML = '<p style="color:#f88;font:1.2rem monospace;padding:20px;">Could not get 2d context.</p>';
  throw new Error('No 2d context');
}
canvas.width  = 1000;
canvas.height = 400;
const VIEW_W  = canvas.width;
const VIEW_H  = canvas.height;

const titleImage = new Image();
titleImage.src = 'Assets/TitleImage.png';

const API_URL = 'https://outstanding-gain-earth-wants.trycloudflare.com';
let isDailyRun = false;
let dailyDate = null;
let dailyRunErrorMsg = null;
let dailyRunErrorAt = 0;

// Global daily: one reset for all users (midnight UTC)
function getServerDateString() {
  const d = new Date();
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function getNextResetAt() {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0));
  return next.getTime();
}

function formatCountdown(ms) {
  if (ms <= 0) return '0m';
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  const parts = [];
  if (d > 0) parts.push(d + 'd');
  if (h > 0) parts.push(h + 'h');
  parts.push(m + 'm');
  if (d === 0 && h === 0) parts.push(s + 's');
  return parts.join(' ');
}

function getDailyRunMarkerState() {
  const key = 'gs_daily_' + getServerDateString();
  const completed = localStorage.getItem(key);
  return completed !== null ? parseFloat(completed, 10) : null;
}

function setDailyRunCompleted(timeSeconds, date) {
  const key = 'gs_daily_' + (date != null ? date : getServerDateString());
  localStorage.setItem(key, String(timeSeconds));
}

function formatRaceTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2);
  return m + ':' + s.padStart(5, '0');
}

// Game modes (easy to extend with new entries)
const MODES = {
  endless: {
    id: 'endless',
    label: 'Endless Mode',
    description: 'Full 4-color chaos, ramps up forever.',
    colors: ['green', 'blue', 'black', 'white'],
    keyMap: [
      ['KeyA', 'green'],
      ['KeyS', 'blue'],
      ['KeyD', 'black'],
      ['KeyF', 'white'],
    ],
  },
  adventure: {
    id: 'adventure',
    label: 'Adventure Mode',
    description: 'Starts with only green/blue — friendlier ramp.',
    // For now: single-color training wheels — always green,
    // no color swapping and only green obstacles.
    colors: ['green'],
    keyMap: [],
  },
  race: {
    id: 'race',
    label: 'Race Mode',
    description: 'Clear 75 obstacles as fast as you can. Any clear counts.',
    colors: ['green', 'blue', 'black', 'white'],
    keyMap: [
      ['KeyA', 'green'],
      ['KeyS', 'blue'],
      ['KeyD', 'black'],
      ['KeyF', 'white'],
    ],
  },
  tutorial: {
    id: 'tutorial',
    label: 'Tutorial',
    description: 'Learn the controls and obstacles.',
    colors: ['green', 'blue', 'black', 'white'],
    keyMap: [
      ['KeyA', 'green'],
      ['KeyS', 'blue'],
      ['KeyD', 'black'],
      ['KeyF', 'white'],
    ],
  },
};

let currentMode = 'endless';

function getActiveMode() {
  return MODES[currentMode] || MODES.endless;
}

// Used by player / obstacles so new modes only touch this config
function getActiveColors() {
  return getActiveMode().colors;
}

function getActiveColorKeyMap() {
  return getActiveMode().keyMap;
}

const keysDown = new Set();
const touchKeys = new Map(); // touchId -> keyCode (for mobile)
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
function isKeyDown(code) {
  return keysDown.has(code) || [...touchKeys.values()].includes(code);
}
window.addEventListener('keydown', e => { keysDown.add(e.code); e.preventDefault(); });
window.addEventListener('keyup',   e => keysDown.delete(e.code));

// Touch layout: right = up/down, left = diamond (4 colors)
const TOUCH = {
  rightX: 520,
  splitY: 200,
  diamondCenter: { x: 160, y: 200 },
  diamondRadius: 80,
  buttonRadius: 44,
  colorKeys: [
    { x: 0, y: -1, code: 'KeyA' },
    { x: 1, y: 0, code: 'KeyS' },
    { x: 0, y: 1, code: 'KeyD' },
    { x: -1, y: 0, code: 'KeyF' },
  ],
};
function getTouchPos(t, rect) {
  if (!rect) rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
}
function getTouchKey(x, y) {
  if (x >= TOUCH.rightX)
    return y < TOUCH.splitY ? 'ArrowUp' : 'ArrowDown';
  const c = TOUCH.diamondCenter;
  const r = TOUCH.diamondRadius;
  let best = null, bestD = Infinity;
  TOUCH.colorKeys.forEach(({ x: dx, y: dy, code }) => {
    const px = c.x + dx * r, py = c.y + dy * r;
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < TOUCH.buttonRadius ** 2 && d < bestD) { bestD = d; best = code; }
  });
  return best;
}

function getModeButtons() {
  const btnW      = 260;
  const btnH      = 48;
  const spacing   = 16;
  const centerX   = VIEW_W / 2 - btnW / 2;
  const columnStartY = 168;
  const buttons   = [];
  const columnModes = [MODES.endless, MODES.adventure, MODES.race];
  for (let i = 0; i < columnModes.length; i++) {
    const m = columnModes[i];
    buttons.push({
      modeId: m.id,
      label:  m.label,
      desc:   m.description,
      x:      centerX,
      y:      columnStartY + i * (btnH + spacing),
      w:      btnW,
      h:      btnH,
    });
  }
  const tutorialW = 200;
  buttons.push({
    modeId: MODES.tutorial.id,
    label:  MODES.tutorial.label,
    desc:   MODES.tutorial.description,
    x:      VIEW_W - 20 - tutorialW,
    y:      VIEW_H - 20 - btnH,
    w:      tutorialW,
    h:      btnH,
  });
  return buttons;
}

function hitTestModeButton(x, y) {
  for (const b of getModeButtons()) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.modeId;
  }
  return null;
}

let runStartTime = null;

function showDailyRunError(msg) {
  dailyRunErrorMsg = msg;
  dailyRunErrorAt = Date.now();
}

async function startDailyRun() {
  dailyRunErrorMsg = null;
  try {
    const res = await fetch(`${API_URL}/daily-seed`);
    if (!res.ok) throw new Error('Server error ' + res.status);
    const data = await res.json();
    if (!data.seed || !data.date) throw new Error('Invalid daily seed response');
    const pattern = obsMgr.generateDailyPattern(data.seed);
    startRun('race');
    obsMgr.setDailyPattern(pattern);
    isDailyRun = true;
    dailyDate = data.date;
    const btn = document.getElementById('dailyRunBtn');
    if (btn) btn.style.display = 'none';
  } catch (e) {
    console.error('Daily run failed:', e);
    showDailyRunError(e.message || 'Daily run failed');
  }
}

async function submitDailyScore(score) {
  const tg = window.Telegram && window.Telegram.WebApp;
  const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  const telegram_user_id = user ? String(user.id) : null;
  const telegram_username = user ? (user.username || null) : null;
  try {
    await fetch(`${API_URL}/submit-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_user_id,
        telegram_username,
        score,
        date: dailyDate,
      }),
    });
  } catch (e) {
    console.error('Submit daily score failed:', e);
  }
}

function startRun(modeId) {
  currentMode = modeId || currentMode || 'endless';
  gameOver    = false;
  startScreen = false;
  frameCount  = 0;
  score       = 0;
  speedMeter  = 0;
  raceCompletedTime = null;
  endlessFinishedTime = null;
  runStartTime = Date.now();
  if (currentMode === 'race') {
    raceStartTime = Date.now();
    raceObstaclesCleared = 0;
  } else {
    raceStartTime = null;
    raceObstaclesCleared = 0;
  }
  if (currentMode === 'tutorial') {
    tutorialMode       = true;
    tutorialStep       = 0;
    tutorialPaused     = true;
    tutorialPromptText = 'Jump with Up and Duck with down';
    tutorialStepTimer  = 0;
    tutorialTargetScore = 0;
  } else {
    tutorialMode = false;
  }
  keysDown.clear();
  touchKeys.clear();
  player.reset();
  obsMgr.reset();
  if (currentMode === 'tutorial') obsMgr.tutorialMode = true;
  else obsMgr.tutorialMode = false;
}
function onTouchStart(e) {
  if (e.cancelable) e.preventDefault();
  if (tutorialMode && tutorialPaused) {
    dismissTutorialPrompt();
    return;
  }
  if (startScreen) {
    const rect = canvas.getBoundingClientRect();
    if (e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      const btn = document.getElementById('dailyRunBtn');
      if (btn && btn.style.display !== 'none') {
        const br = btn.getBoundingClientRect();
        if (t.clientX >= br.left && t.clientX <= br.right && t.clientY >= br.top && t.clientY <= br.bottom) {
          startDailyRun();
          return;
        }
      }
      const pos = getTouchPos(t, rect);
      const m   = hitTestModeButton(pos.x, pos.y);
      if (m) startRun(m);
    }
    return;
  }
  if (gameOver) {
    gameOver    = false;
    startScreen = true;
    isDailyRun  = false;
    dailyDate   = null;
    frameCount  = 0;
    score       = 0;
    speedMeter  = 0;
    keysDown.clear();
    touchKeys.clear();
    player.reset();
    obsMgr.reset();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  if (e.changedTouches.length > 0 && speedMeter >= METER_MAX) {
    const t = e.changedTouches[0];
    const pos = getTouchPos(t, rect);
    if (hitTestMeter(pos.x, pos.y)) {
      trySpeedBoost();
      return;
    }
  }
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const pos = getTouchPos(t, rect);
    const code = getTouchKey(pos.x, pos.y);
    if (code) touchKeys.set(t.identifier, code);
  }
}
function onTouchEnd(e) {
  if (e.cancelable) e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++)
    touchKeys.delete(e.changedTouches[i].identifier);
}
function onTouchCancel(e) {
  for (let i = 0; i < e.changedTouches.length; i++)
    touchKeys.delete(e.changedTouches[i].identifier);
}
canvas.addEventListener('touchstart', onTouchStart, { passive: false });
canvas.addEventListener('touchend', onTouchEnd, { passive: false });
canvas.addEventListener('touchcancel', onTouchCancel, { passive: false });
canvas.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });

canvas.addEventListener('mousedown', e => {
  if (tutorialMode && tutorialPaused) {
    dismissTutorialPrompt();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (startScreen) {
    const btn = document.getElementById('dailyRunBtn');
    if (btn && btn.style.display !== 'none') {
      const br = btn.getBoundingClientRect();
      if (e.clientX >= br.left && e.clientX <= br.right && e.clientY >= br.top && e.clientY <= br.bottom) {
        startDailyRun();
        return;
      }
    }
    const m = hitTestModeButton(x, y);
    if (m) startRun(m);
    return;
  }
  if (!gameOver && speedMeter >= METER_MAX && hitTestMeter(x, y)) trySpeedBoost();
});

const bg     = new Background();
const player = new Player();
const obsMgr = new ObstacleManager();

let frameCount  = 0;
let lastTime    = 0;
let gameOver    = false;
let score       = 0;
let highScore   = Number(localStorage.getItem('gs_highscore') || 0);
let raceHighScore = Number(localStorage.getItem('gs_race_highscore') || Infinity); // best = lowest time (seconds)
let startScreen = true;
let raceStartTime = null;       // Date.now() when race started
let raceObstaclesCleared = 0;   // 0..75
let raceCompletedTime = null;  // seconds when finished 75
let endlessFinishedTime = null;  // seconds when endless run ended (frozen for FINISHED screen)
let speedMeter  = 0;  // 0–5; fills as you pass obstacles; cash in with ArrowRight (or tap meter when full)

const METER_MAX = 5;
const METER_RECT = { x: VIEW_W - 140, y: 14, w: 120, h: 28 };

// Tutorial state
let tutorialMode       = false;
let tutorialStep       = 0;
let tutorialPaused     = false;
let tutorialPromptText = '';
let tutorialStepTimer  = 0;   // seconds of gameplay (not when paused)
let tutorialTargetScore = 0;  // when in step 17, score to reach (score + 20) to complete
let tutorialLastFailedBarrelRight = -999; // step 13: avoid spawning multiple barrels per failed one

function trySpeedBoost() {
  if (gameOver || startScreen || speedMeter < METER_MAX) return false;
  speedMeter = 0;
  obsMgr.increaseSpeed();
  player.playBoostLurch();
  return true;
}

function hitTestMeter(x, y) {
  const r = METER_RECT;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function dismissTutorialPrompt() {
  if (!tutorialMode || !tutorialPaused) return;
  tutorialPaused = false;
  if (tutorialStep === 0) tutorialStep = 1;
  else if (tutorialStep === 2) tutorialStep = 3;
  else if (tutorialStep === 4) tutorialStep = 5;
  else if (tutorialStep === 6) tutorialStep = 7;
  else if (tutorialStep === 8) tutorialStep = 9;
  else if (tutorialStep === 10) tutorialStep = 11;
  else if (tutorialStep === 12) {
    tutorialStep = 13;
    tutorialLastFailedBarrelRight = -999;
  }
  else if (tutorialStep === 14) tutorialStep = 15;
  else if (tutorialStep === 16) {
    tutorialStep = 17;
    tutorialTargetScore = score + 20;
    obsMgr.tutorialMode = false;
  } else if (tutorialStep === 18) {
    tutorialMode = false;
    tutorialPaused = false;
    obsMgr.tutorialMode = false;
    startScreen = true;
    gameOver = false;
    frameCount = 0;
    score = 0;
    speedMeter = 0;
    keysDown.clear();
    touchKeys.clear();
    player.reset();
    obsMgr.reset();
  }
}

function updateTutorialSteps(dt) {
  if (!tutorialMode || tutorialPaused) return;
  const sec = dt / 1000;
  const gates = obsMgr.obstacles.filter(o => o.type === 'gate');
  const ceilings = obsMgr.obstacles.filter(o => o.type === 'ceiling');
  const rails = obsMgr.obstacles.filter(o => o.type === 'rail');
  const barrels = obsMgr.obstacles.filter(o => o.type === 'barrel');

  if (tutorialStep === 1) {
    tutorialStepTimer += sec;
    if (tutorialStepTimer >= 5) {
      tutorialStepTimer = 0;
      obsMgr.spawnTutorialObstacle('gate', 'green');
      tutorialStep = 2;
    }
  } else if (tutorialStep === 2) {
    const gate = gates[0];
    if (gate && gate.left < VIEW_W) {
      tutorialPaused = true;
      tutorialPromptText = 'Gates must be run thru';
    }
  } else if (tutorialStep === 3) {
    const gate = gates[0];
    if (!gate || gate.right < player.left) {
      tutorialStepTimer += sec;
      if (tutorialStepTimer >= 3) {
        tutorialStepTimer = 0;
        obsMgr.spawnTutorialObstacle('ceiling', 'green');
        tutorialStep = 4;
      }
    }
  } else if (tutorialStep === 4) {
    const ceiling = ceilings[0];
    if (ceiling && ceiling.left < VIEW_W) {
      tutorialPaused = true;
      tutorialPromptText = 'Ceilings must be ducked under';
    }
  } else if (tutorialStep === 5) {
    const ceiling = ceilings[0];
    if (!ceiling || ceiling.right < player.left) {
      tutorialStepTimer += sec;
      if (tutorialStepTimer >= 3) {
        tutorialStepTimer = 0;
        obsMgr.spawnTutorialObstacle('rail', 'green', { w: 256 });
        tutorialStep = 6;
      }
    }
  } else if (tutorialStep === 6) {
    const rail = rails[0];
    if (rail && rail.left < VIEW_W) {
      tutorialPaused = true;
      tutorialPromptText = 'Rails must be jumped on';
    }
  } else if (tutorialStep === 7) {
    const rail = rails[0];
    if (!rail || rail.right < player.left) {
      tutorialStepTimer += sec;
      if (tutorialStepTimer >= 3) {
        tutorialStepTimer = 0;
        tutorialPaused = true;
        tutorialPromptText = 'Swap Colors with A,S,D,F';
        tutorialStep = 8;
      }
    }
  } else if (tutorialStep === 9) {
    tutorialStepTimer += sec;
    if (tutorialStepTimer >= 5) {
      tutorialStepTimer = 0;
      obsMgr.spawnTutorialObstacle('gate', 'blue');
      tutorialStep = 10;
    }
  } else if (tutorialStep === 10) {
    const gate = gates.find(g => g.color === 'blue');
    if (gate && gate.left < VIEW_W) {
      tutorialPaused = true;
      tutorialPromptText = 'Match the color with the Gate to pass thru';
    }
  } else if (tutorialStep === 11) {
    const gate = gates.find(g => g.color === 'blue');
    if (!gate || gate.right < player.left) {
      tutorialStepTimer += sec;
      if (tutorialStepTimer >= 3) {
        tutorialStepTimer = 0;
        obsMgr.spawnTutorialObstacle('barrel', 'green');
        tutorialStep = 12;
      }
    }
  } else if (tutorialStep === 12) {
    const barrel = barrels[0];
    if (barrel && barrel.left < VIEW_W) {
      tutorialPaused = true;
      tutorialPromptText = 'Jump over barrels with the correct color to increase your Speed Meter';
    }
  } else if (tutorialStep === 13) {
    const passedBarrels = barrels.filter(b => b.right < player.left).sort((a, b) => b.right - a.right);
    const rightmost = passedBarrels[0];
    if (rightmost) {
      if (rightmost.clearedForMeter) {
        tutorialPaused = true;
        tutorialPromptText = 'When your speed meter is full press Right to increase speed';
        tutorialStep = 14;
      } else if (rightmost.right > tutorialLastFailedBarrelRight) {
        tutorialLastFailedBarrelRight = rightmost.right;
        obsMgr.spawnTutorialObstacle('barrel', 'green');
      }
    }
  } else if (tutorialStep === 15) {
    tutorialStepTimer += sec;
    if (tutorialStepTimer >= 3) {
      tutorialStepTimer = 0;
      tutorialPaused = true;
      tutorialPromptText = 'Finish the course as fast as possible';
      tutorialStep = 16;
    }
  } else if (tutorialStep === 17) {
    if (score >= tutorialTargetScore) {
      tutorialPaused = true;
      tutorialPromptText = 'COMPLETE';
      tutorialStep = 18;
    }
  }
}

function checkCollisions() {
  for (const obs of obsMgr.obstacles) {

    // Rail logic — separate from other obstacles
    if (obs.type === 'rail') {

      // If currently grinding this rail, check if we've reached the end
      if (player.activeRail === obs) {
        if (player.right > obs.right) player.leaveRail();
        continue;
      }

      // Landing on rail
      if (obs.overlaps(player)) {
        if (!obs.playerSurvives(player)) {
          triggerGameOver();
        } else {
          player.landOnRail(obs);
        }
      }
      continue;
    }

    // All other obstacles
    const hOverlap = player.right > obs.left + 5 && player.left < obs.right - 5;
    if (!obs.overlaps(player)) {
      // Barrel: can jump cleanly over (no vertical overlap); still count as cleared if jump + correct color while barrel is in our lane
      if (obs.type === 'barrel' && hOverlap && player.state === 'jump' && player.color === obs.color) obs.clearedForMeter = true;
      continue;
    }
    if (!obs.playerSurvives(player)) triggerGameOver();
    else if (obs.type === 'gate' || obs.type === 'barrel') obs.clearedForMeter = true;
  }

  // Color swap on rail check is handled inside player.handleInput
  if (player.state === 'dead') triggerGameOver();
}

function triggerGameOver() {
  if (gameOver) return;
  gameOver = true;
  if (isDailyRun) submitDailyScore(score);
  if (currentMode === 'endless' && runStartTime != null) {
    endlessFinishedTime = (Date.now() - runStartTime) / 1000;
  }
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('gs_highscore', String(highScore));
  }
  console.log('DEAD — player color:', player.color, '| state:', player.state);
}

function loop(ts) {
  const loadingEl = document.getElementById('gameLoading');
  if (loadingEl) loadingEl.remove();
  const dt = Math.min(ts - lastTime, 50);
  lastTime = ts;

  const dailyBtn = document.getElementById('dailyRunBtn');
  const dailyMarker = document.getElementById('dailyRunMarker');
  const dailyMarkerBox = document.getElementById('dailyRunMarkerBox');
  const dailyMarkerText = document.getElementById('dailyRunMarkerText');
  if (dailyBtn) {
    dailyBtn.style.display = startScreen ? 'block' : 'none';
    if (startScreen && canvas) {
      const rect = canvas.getBoundingClientRect();
      const wrap = canvas.parentElement && canvas.parentElement.getBoundingClientRect();
      if (wrap) {
        const yRatio = 0.30;
        dailyBtn.style.top = (rect.top - wrap.top + rect.height * yRatio) + 'px';
        dailyBtn.style.left = (rect.left - wrap.left + rect.width / 2) + 'px';
      }
    }
  }
  if (dailyMarker && dailyMarkerBox && dailyMarkerText) {
    if (startScreen && dailyBtn && dailyBtn.style.display !== 'none') {
      const completedTime = getDailyRunMarkerState();
      if (completedTime !== null) {
        dailyMarkerBox.style.background = '#2a8';
        dailyMarkerBox.style.border = '2px solid #2a8';
        dailyMarkerText.textContent = formatRaceTime(completedTime);
      } else {
        dailyMarkerBox.style.background = 'transparent';
        dailyMarkerBox.style.border = '2px solid #e44';
        dailyMarkerText.textContent = 'Incompleted';
      }
      const wrap = canvas && canvas.parentElement && canvas.parentElement.getBoundingClientRect();
      const btnRect = dailyBtn.getBoundingClientRect();
      if (wrap) {
        dailyMarker.style.display = 'flex';
        dailyMarker.style.left = (btnRect.right - wrap.left + 10) + 'px';
        dailyMarker.style.top = (btnRect.top - wrap.top + btnRect.height / 2) + 'px';
        dailyMarker.style.transform = 'translateY(-50%)';
      }
    } else {
      dailyMarker.style.display = 'none';
    }
  }
  const dailyCountdown = document.getElementById('dailyRunCountdown');
  if (dailyCountdown) {
    if (startScreen && dailyBtn && dailyBtn.style.display !== 'none') {
      const remaining = getNextResetAt() - Date.now();
      dailyCountdown.textContent = 'Next daily in ' + formatCountdown(remaining);
      dailyCountdown.style.display = 'block';
      const wrap = canvas && canvas.parentElement && canvas.parentElement.getBoundingClientRect();
      const btnRect = dailyBtn.getBoundingClientRect();
      if (wrap) {
        dailyCountdown.style.top = (btnRect.bottom - wrap.top + 6) + 'px';
        dailyCountdown.style.left = (wrap.left - wrap.left + wrap.width / 2) + 'px';
      }
    } else {
      dailyCountdown.style.display = 'none';
    }
  }

  if (startScreen) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    bg.draw(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (titleImage.complete && titleImage.naturalWidth) {
      const tw = titleImage.naturalWidth, th = titleImage.naturalHeight;
      const maxH = 80;
      const scale = maxH / th;
      const dw = tw * scale, dh = maxH;
      ctx.drawImage(titleImage, VIEW_W / 2 - dw / 2, 20, dw, dh);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 1.8rem monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TOAD RUNNER', VIEW_W / 2, 70);
    }

    const buttons = getModeButtons();
    ctx.font = 'bold 1rem monospace';
    buttons.forEach(b => {
      const isActive = getActiveMode().id === b.modeId;
      const isTutorial = b.modeId === 'tutorial';
      if (isTutorial) {
        ctx.fillStyle = isActive ? 'rgba(220,140,60,0.95)' : '#000';
        ctx.strokeStyle = isActive ? '#fc8' : '#fa6';
      } else {
        ctx.fillStyle = isActive ? 'rgba(80,180,80,0.9)' : '#000';
        ctx.strokeStyle = isActive ? '#7f7' : '#fff';
      }
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(b.label.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 4);
    });

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText('CONTROLS', 80, 200);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '10px monospace';
    ctx.fillText('ASDF — swap colors (varies by mode)', 80, 216);
    ctx.fillText('↑ — jump (hold for height)', 80, 230);
    ctx.fillText('↓ — duck on ground / cancel jump in air', 80, 244);
    ctx.fillText('→ — boost speed when meter is full (5 obstacles)', 80, 258);
    ctx.fillText('← — slow down one notch', 80, 272);

    if (dailyRunErrorMsg && Date.now() - dailyRunErrorAt < 5000) {
      ctx.fillStyle = 'rgba(200, 80, 80, 0.95)';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(dailyRunErrorMsg, VIEW_W / 2, 385);
      ctx.textAlign = 'left';
    }

    ctx.textAlign = 'left';
    requestAnimationFrame(loop);
    return;
  }

  if (!gameOver && !(tutorialMode && tutorialPaused)) {
    frameCount++;
    player.handleInput();
    player.update(dt);
    obsMgr.update(dt, frameCount, score);
    const frameScale = dt / 16.67;
    bg.update(obsMgr.speed * frameScale);
    checkCollisions();

    // Award points for any obstacle that has fully passed the player; fill speed meter only when cleared correctly (gate: through, barrel: jump+color)
    for (const obs of obsMgr.obstacles) {
      if (!obs.scored && obs.right < player.left) {
        obs.scored = true;
        obs.clearFlashStart = performance.now();
        score++;
        if (currentMode === 'race') {
          raceObstaclesCleared++;
          if (raceObstaclesCleared >= 75) {
            raceCompletedTime = (Date.now() - raceStartTime) / 1000;
            gameOver = true;
            if (isDailyRun) {
              submitDailyScore(score);
              setDailyRunCompleted(raceCompletedTime, dailyDate);
            }
            if (raceCompletedTime < raceHighScore) {
              raceHighScore = raceCompletedTime;
              localStorage.setItem('gs_race_highscore', String(raceHighScore));
            }
          }
        }
        const giveMeter = (obs.type !== 'gate' && obs.type !== 'barrel') || obs.clearedForMeter;
        if (speedMeter < METER_MAX && giveMeter) speedMeter++;
      }
    }
    if (tutorialMode && !tutorialPaused) updateTutorialSteps(dt);
  }

  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  bg.draw(ctx);
  obsMgr.draw(ctx);
  player.draw(ctx);

  // Score HUD (or Race HUD when in race mode)
  ctx.fillStyle = '#fff';
  ctx.font      = 'bold 16px monospace';
  ctx.textAlign = 'left';
  if (currentMode === 'race') {
    const raceTime = raceCompletedTime != null
      ? raceCompletedTime
      : (raceStartTime != null ? (Date.now() - raceStartTime) / 1000 : 0);
    const mins = Math.floor(raceTime / 60);
    const secs = (raceTime % 60).toFixed(2);
    ctx.fillText(`TIME: ${mins}:${secs.padStart(5, '0')}`, 16, 28);
    ctx.fillText(`OBSTACLES: ${raceObstaclesCleared}/75`, 16, 50);
    if (raceHighScore !== Infinity) {
      const bestM = Math.floor(raceHighScore / 60);
      const bestS = (raceHighScore % 60).toFixed(2);
      ctx.fillText(`RACE BEST: ${bestM}:${bestS.padStart(5, '0')}`, 16, 72);
    }
  } else {
    ctx.fillText(`SCORE: ${score}${score >= 50 ? ' ★' : ''}`, 16, 28);
    ctx.fillText(`BEST:  ${highScore}`, 16, 50);
  }

  // Speed meter (0–5) and speed gauge — only during active play
  if (!startScreen && !gameOver) {
    const r = METER_RECT;
    const full = speedMeter >= METER_MAX;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = full ? '#fc0' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    const fillW = (speedMeter / METER_MAX) * (r.w - 4);
    if (fillW > 0) {
      ctx.fillStyle = full ? '#fa0' : '#3a8';
      ctx.fillRect(r.x + 2, r.y + 2, fillW, r.h - 4);
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BOOST', r.x + r.w / 2, r.y + 10);
    ctx.fillText(full ? '→ TO GO' : `${speedMeter}/${METER_MAX}`, r.x + r.w / 2, r.y + 22);
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`SPEED ${obsMgr.difficulty + 1}`, r.x, r.y + r.h + 16);
  }

  // Touch control overlay (left diamond = colors, right = up/down) — only on touch devices
  if (!startScreen && isTouchDevice) {
    const c = TOUCH.diamondCenter;
    const r = TOUCH.diamondRadius;
    const br = TOUCH.buttonRadius;
    const colors = ['#3d3', '#38f', '#555', '#ddd'];
    TOUCH.colorKeys.forEach(({ x: dx, y: dy }, i) => {
      const px = c.x + dx * r, py = c.y + dy * r;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(px, py, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = colors[i];
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(px, py, br - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(TOUCH.rightX, 0, VIEW_W - TOUCH.rightX, TOUCH.splitY);
    ctx.fillRect(TOUCH.rightX, TOUCH.splitY, VIEW_W - TOUCH.rightX, VIEW_H - TOUCH.splitY);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(TOUCH.rightX, 0, VIEW_W - TOUCH.rightX, TOUCH.splitY);
    ctx.strokeRect(TOUCH.rightX, TOUCH.splitY, VIEW_W - TOUCH.rightX, VIEW_H - TOUCH.splitY);
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('↑', TOUCH.rightX + (VIEW_W - TOUCH.rightX) / 2, TOUCH.splitY / 2 + 6);
    ctx.fillText('↓', TOUCH.rightX + (VIEW_W - TOUCH.rightX) / 2, TOUCH.splitY + (VIEW_H - TOUCH.splitY) / 2 + 6);
    ctx.textAlign = 'left';
  }

  if (tutorialMode && tutorialPaused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = tutorialStep === 18 ? 'bold 2.2rem monospace' : 'bold 1.4rem monospace';
    const lines = tutorialPromptText.split('\n');
    const lineHeight = 32;
    const startY = VIEW_H / 2 - (lines.length * lineHeight) / 2 + lineHeight / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, VIEW_W / 2, startY + i * lineHeight);
    });
    ctx.font = 'bold 1rem monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('PRESS ANY KEY TO CONTINUE', VIEW_W / 2, startY + lines.length * lineHeight + 24);
    ctx.textAlign = 'left';
  }

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    if (currentMode === 'race' && raceCompletedTime != null) {
      ctx.fillStyle = '#4f4';
      ctx.font = 'bold 2.2rem monospace';
      ctx.fillText('COMPLETE', VIEW_W / 2, VIEW_H / 2 - 24);
      const m = Math.floor(raceCompletedTime / 60);
      const s = (raceCompletedTime % 60).toFixed(2);
      ctx.font = 'bold 1.4rem monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Time: ${m}:${s.padStart(5, '0')}`, VIEW_W / 2, VIEW_H / 2 + 12);
      if (raceHighScore !== Infinity) {
        const bm = Math.floor(raceHighScore / 60);
        const bs = (raceHighScore % 60).toFixed(2);
        ctx.font = 'bold 1rem monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(`Race Highscore: ${bm}:${bs.padStart(5, '0')}`, VIEW_W / 2, VIEW_H / 2 + 44);
      }
      ctx.font = 'bold 1rem monospace';
      ctx.fillText('PRESS ANY BUTTON FOR MENU', VIEW_W / 2, VIEW_H / 2 + 76);
    } else if (currentMode === 'endless') {
      const elapsed = endlessFinishedTime != null ? endlessFinishedTime : 0;
      const m = Math.floor(elapsed / 60);
      const s = (elapsed % 60).toFixed(2);
      ctx.fillStyle = '#4f4';
      ctx.font = 'bold 2.2rem monospace';
      ctx.fillText('FINISHED', VIEW_W / 2, VIEW_H / 2 - 44);
      ctx.font = 'bold 1.2rem monospace';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Obstacles passed: ${score}`, VIEW_W / 2, VIEW_H / 2);
      ctx.fillText(`Time: ${m}:${s.padStart(5, '0')}`, VIEW_W / 2, VIEW_H / 2 + 28);
      ctx.font = 'bold 1rem monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText('PRESS ANY BUTTON FOR MENU', VIEW_W / 2, VIEW_H / 2 + 72);
    } else {
      ctx.fillStyle = '#f44';
      ctx.font = 'bold 2rem monospace';
      ctx.fillText('PRESS ANY BUTTON FOR MENU', VIEW_W / 2, VIEW_H / 2);
    }
    ctx.textAlign = 'left';
  }

  requestAnimationFrame(loop);
}

window.addEventListener('keydown', e => {
  if (tutorialMode && tutorialPaused) {
    dismissTutorialPrompt();
    e.preventDefault();
    return;
  }
  if (startScreen) {
    // Keyboard: start the currently highlighted mode
    startRun(currentMode || 'endless');
    return;
  }
  if (!gameOver && e.code === 'ArrowRight' && trySpeedBoost()) return;
  if (!gameOver && e.code === 'ArrowLeft') obsMgr.decreaseSpeed();
  if (gameOver) {
    gameOver    = false;
    startScreen = true;
    isDailyRun  = false;
    dailyDate   = null;
    frameCount  = 0;
    score       = 0;
    keysDown.clear();
    touchKeys.clear();
    player.reset();
    obsMgr.reset();
  }
});

(function setupDailyRunButton() {
  const btn = document.getElementById('dailyRunBtn');
  if (btn) {
    function runDaily() {
      startDailyRun();
    }
    btn.addEventListener('click', runDaily);
    btn.addEventListener('touchend', function(e) {
      e.preventDefault();
      runDaily();
    }, { passive: false });
  }
})();

requestAnimationFrame(loop);