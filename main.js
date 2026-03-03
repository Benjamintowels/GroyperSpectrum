const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const keysDown = new Set();
window.addEventListener('keydown', e => { keysDown.add(e.code); e.preventDefault(); });
window.addEventListener('keyup',   e => keysDown.delete(e.code));

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

  if (!gameOver) {
    frameCount++;
    player.handleInput();
    player.update(dt);
    obsMgr.update(frameCount, score);
    bg.update(obsMgr.speed);
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
    return;
  }
  if (e.code === 'KeyR' && gameOver) {
    gameOver = false;
    frameCount = 0;
    score = 0;
    player.reset();
    obsMgr.reset();
  }
});

requestAnimationFrame(loop);