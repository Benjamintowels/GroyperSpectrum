const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

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
function onTouchStart(e) {
  if (e.cancelable) e.preventDefault();
  if (startScreen) {
    startScreen = false;
    keysDown.clear();
    touchKeys.clear();
    return;
  }
  const rect = canvas.getBoundingClientRect();
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

const bg     = new Background();
const player = new Player();
const obsMgr = new ObstacleManager();

let frameCount = 0;
let lastTime   = 0;
let gameOver   = false;
let score      = 0;
let highScore  = Number(localStorage.getItem('gs_highscore') || 0);
let startScreen = true;

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
    if (!obs.overlaps(player)) continue;
    if (!obs.playerSurvives(player)) triggerGameOver();
  }

  // Color swap on rail check is handled inside player.handleInput
  if (player.state === 'dead') triggerGameOver();
}

function triggerGameOver() {
  if (gameOver) return;
  gameOver = true;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('gs_highscore', String(highScore));
  }
  console.log('DEAD — player color:', player.color, '| state:', player.state);
}

function loop(ts) {
  const dt = Math.min(ts - lastTime, 50);
  lastTime = ts;

  if (startScreen) {
    ctx.clearRect(0, 0, 800, 400);
    bg.draw(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, 800, 400);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 1.5rem monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press any key to start', 400, 140);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText('CONTROLS', 120, 180);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '10px monospace';
    ctx.fillText('A S D F — switch color (green, blue, black, white)', 120, 198);
    ctx.fillText('↑ — jump (hold for height)', 120, 214);
    ctx.fillText('↓ — duck on ground / cancel jump in air', 120, 230);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('OBSTACLES', 120, 258);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '10px monospace';
    ctx.fillText('Barrel — jump + match color', 120, 276);
    ctx.fillText('Ceiling — duck + match color', 120, 292);
    ctx.fillText('Gate — match color, do not jump', 120, 308);
    ctx.fillText('Rail — jump onto + match color to grind', 120, 324);
    ctx.fillText('Gap — jump over (touch = death)', 120, 340);

    ctx.textAlign = 'left';
    requestAnimationFrame(loop);
    return;
  }

  // Only speed up when running below ~60fps (e.g. mobile); leave desktop at 60fps unchanged
  const targetFrameMs = 1000 / 60;
  const scale = dt > targetFrameMs * 1.1 ? Math.min(dt / targetFrameMs, 3) : 1;

  if (!gameOver) {
    frameCount++;
    player.handleInput();
    player.update(dt);
    obsMgr.update(frameCount, score, scale);
    bg.update(obsMgr.speed * scale);
    checkCollisions();

    // Award points for any obstacle that has fully passed the player
    for (const obs of obsMgr.obstacles) {
      if (!obs.scored && obs.right < player.left) {
        obs.scored = true;
        score++;
      }
    }
  }

  ctx.clearRect(0, 0, 800, 400);
  bg.draw(ctx);
  obsMgr.draw(ctx);
  player.draw(ctx);

  // Score HUD
  ctx.fillStyle = '#fff';
  ctx.font      = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE: ${score}${score >= 50 ? ' ★' : ''}`, 16, 28);
  ctx.fillText(`BEST:  ${highScore}`, 16, 50);

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
    ctx.fillRect(TOUCH.rightX, 0, 800 - TOUCH.rightX, TOUCH.splitY);
    ctx.fillRect(TOUCH.rightX, TOUCH.splitY, 800 - TOUCH.rightX, 400 - TOUCH.splitY);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(TOUCH.rightX, 0, 800 - TOUCH.rightX, TOUCH.splitY);
    ctx.strokeRect(TOUCH.rightX, TOUCH.splitY, 800 - TOUCH.rightX, 400 - TOUCH.splitY);
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('↑', TOUCH.rightX + (800 - TOUCH.rightX) / 2, TOUCH.splitY / 2 + 6);
    ctx.fillText('↓', TOUCH.rightX + (800 - TOUCH.rightX) / 2, TOUCH.splitY + (400 - TOUCH.splitY) / 2 + 6);
    ctx.textAlign = 'left';
  }

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 800, 400);
    ctx.fillStyle = '#f44';
    ctx.font = 'bold 2rem monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PRESS R TO RESTART', 400, 200);
    ctx.textAlign = 'left';
  }

  requestAnimationFrame(loop);
}

window.addEventListener('keydown', e => {
  if (startScreen) {
    startScreen = false;
    keysDown.clear();
    touchKeys.clear();
    return;
  }
  if (e.code === 'KeyR' && gameOver) {
    gameOver = false;
    frameCount = 0;
    score = 0;
    touchKeys.clear();
    player.reset();
    obsMgr.reset();
  }
});

requestAnimationFrame(loop);