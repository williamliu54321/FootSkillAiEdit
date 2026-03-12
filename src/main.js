import './style.css';

document.querySelector('#app').innerHTML = `
  <div class="container">
    <header>
      <h1>FootSkill<span class="accent">AI</span></h1>
      <p class="subtitle">Video Editor</p>
    </header>

    <div class="upload-section" id="upload-section">
      <label for="video-upload" class="upload-btn">
        <span class="icon">📹</span>
        <span>Upload Video</span>
      </label>
      <input type="file" id="video-upload" accept="video/*" hidden>
    </div>

    <div class="editor" id="editor" style="display: none;">
      <div class="video-wrapper">
        <div class="video-container" id="video-container">
          <video id="video" playsinline></video>
          <canvas id="canvas"></canvas>
        </div>
      </div>

      <div class="toolbar">
        <button id="play-btn" class="tool-btn">▶ Play</button>
        <span id="time-display">0:00 / 0:00</span>
        <button id="export-btn" class="tool-btn export">⬇ Export</button>
        <button id="reset-btn" class="tool-btn danger">✕ Reset</button>
      </div>

      <div class="controls-row">
        <div class="control-group">
          <h3>Effects Range</h3>
          <div class="toggle-row">
            <label class="toggle">
              <input type="checkbox" id="skeleton-toggle">
              <span class="toggle-slider"></span>
              <span class="toggle-label">Skeleton</span>
            </label>
            <label class="toggle">
              <input type="checkbox" id="scan-toggle">
              <span class="toggle-slider"></span>
              <span class="toggle-label">Scan</span>
            </label>
          </div>
          <div class="range-buttons">
            <button id="set-start" class="range-btn">Set Start</button>
            <span id="range-display">Not set</span>
            <button id="set-end" class="range-btn">Set End</button>
          </div>
        </div>

        <div class="control-group">
          <h3>Rating Card</h3>
          <div class="rating-controls">
            <button id="capture-frame" class="capture-btn">📷 Capture Frame</button>
            <span id="capture-status">No frame captured</span>
            <img id="captured-preview" class="captured-preview" style="display: none;">
          </div>
          <div class="rating-controls">
            <button id="place-rating" class="range-btn rating-place">Place Rating Here</button>
            <span id="rating-range-display">Not set</span>
          </div>
        </div>
      </div>

      <div class="timeline-container">
        <div class="timeline" id="timeline">
          <div class="timeline-track" id="track-effects">
            <span class="track-label">Effects</span>
            <div class="track-content"></div>
          </div>
          <div class="timeline-track" id="track-rating">
            <span class="track-label">Rating</span>
            <div class="track-content"></div>
          </div>
          <div class="playhead" id="playhead"></div>
          <div class="timeline-ruler" id="timeline-ruler"></div>
        </div>
      </div>
    </div>

    <div class="loading" id="loading" style="display: none;">
      <div class="spinner"></div>
      <p>Loading pose detection...</p>
    </div>
  </div>
`;

// Elements
const uploadSection = document.getElementById('upload-section');
const editor = document.getElementById('editor');
const loading = document.getElementById('loading');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const videoUpload = document.getElementById('video-upload');
const playBtn = document.getElementById('play-btn');
const exportBtn = document.getElementById('export-btn');
const resetBtn = document.getElementById('reset-btn');
const timeDisplay = document.getElementById('time-display');
const timeline = document.getElementById('timeline');
const playhead = document.getElementById('playhead');
const timelineRuler = document.getElementById('timeline-ruler');

// Effect controls
const skeletonToggle = document.getElementById('skeleton-toggle');
const scanToggle = document.getElementById('scan-toggle');
const setStartBtn = document.getElementById('set-start');
const setEndBtn = document.getElementById('set-end');
const rangeDisplay = document.getElementById('range-display');
const captureFrameBtn = document.getElementById('capture-frame');
const captureStatus = document.getElementById('capture-status');
const placeRatingBtn = document.getElementById('place-rating');
const ratingRangeDisplay = document.getElementById('rating-range-display');
const capturedPreview = document.getElementById('captured-preview');

// State
let pose = null;
let animationId = null;
let lastPoseResults = null;
let videoDuration = 0;

// Effects range state
let effectsRange = { start: null, end: null };
let skeletonEnabled = false;
let scanEnabled = false;

// Rating state
let capturedFrame = null;
let capturedFrameTime = null;
let ratingRange = { start: null, end: null };
let ratingStats = null;

// Animation state
let scanY = 0;

// Pose connections
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32],
];

// Initialize MediaPipe Pose
async function initPose() {
  loading.style.display = 'flex';
  const { Pose } = await import('@mediapipe/pose');

  pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults((results) => { lastPoseResults = results; });
  loading.style.display = 'none';
}

// Format time as M:SS
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Update time display and playhead
function updateTimeDisplay() {
  const current = video.currentTime;
  timeDisplay.textContent = `${formatTime(current)} / ${formatTime(videoDuration)}`;

  const percent = (current / videoDuration) * 100;
  playhead.style.left = `calc(40px + ${percent}% - ${percent * 0.4}px)`;
}

// Create timeline ruler
function createRuler() {
  timelineRuler.innerHTML = '';
  const width = timeline.offsetWidth - 40;
  const interval = videoDuration > 30 ? 5 : (videoDuration > 10 ? 2 : 1);

  for (let t = 0; t <= videoDuration; t += interval) {
    const marker = document.createElement('div');
    marker.className = 'ruler-marker';
    marker.style.left = `${40 + (t / videoDuration) * width}px`;
    marker.textContent = formatTime(t);
    timelineRuler.appendChild(marker);
  }
}


// Capture current video frame
function captureCurrentFrame() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = video.videoWidth;
  tempCanvas.height = video.videoHeight;
  tempCanvas.getContext('2d').drawImage(video, 0, 0);
  return tempCanvas;
}

// Update range displays
function updateRangeDisplays() {
  if (effectsRange.start !== null && effectsRange.end !== null) {
    rangeDisplay.textContent = `${formatTime(effectsRange.start)} - ${formatTime(effectsRange.end)}`;
  } else if (effectsRange.start !== null) {
    rangeDisplay.textContent = `${formatTime(effectsRange.start)} - ?`;
  } else {
    rangeDisplay.textContent = 'Not set';
  }

  if (ratingRange.start !== null && ratingRange.end !== null) {
    ratingRangeDisplay.textContent = `${formatTime(ratingRange.start)} - ${formatTime(ratingRange.end)}`;
  } else if (ratingRange.start !== null) {
    ratingRangeDisplay.textContent = `${formatTime(ratingRange.start)} - ?`;
  } else {
    ratingRangeDisplay.textContent = 'Not set';
  }
}

// Render timeline blocks
function renderTimeline() {
  document.querySelectorAll('.effect-block').forEach(el => el.remove());
  const timelineWidth = timeline.offsetWidth - 40;

  // Render effects range
  if (effectsRange.start !== null && effectsRange.end !== null) {
    const track = document.querySelector('#track-effects .track-content');
    const block = document.createElement('div');
    block.className = 'effect-block effects';

    const left = (effectsRange.start / videoDuration) * timelineWidth;
    const width = ((effectsRange.end - effectsRange.start) / videoDuration) * timelineWidth;

    block.style.left = `${left}px`;
    block.style.width = `${Math.max(width, 20)}px`;

    // Show which effects are enabled
    const labels = [];
    if (skeletonEnabled) labels.push('S');
    if (scanEnabled) labels.push('R');
    block.textContent = labels.join('+') || '—';

    // Click to clear
    block.addEventListener('click', () => {
      effectsRange = { start: null, end: null };
      updateRangeDisplays();
      renderTimeline();
    });

    track.appendChild(block);
  }

  // Render rating range
  if (ratingRange.start !== null && ratingRange.end !== null && capturedFrame) {
    const track = document.querySelector('#track-rating .track-content');
    const block = document.createElement('div');
    block.className = 'effect-block rating';

    const left = (ratingRange.start / videoDuration) * timelineWidth;
    const width = ((ratingRange.end - ratingRange.start) / videoDuration) * timelineWidth;

    block.style.left = `${left}px`;
    block.style.width = `${Math.max(width, 20)}px`;
    block.textContent = '⭐';

    // Click to clear
    block.addEventListener('click', () => {
      ratingRange = { start: null, end: null };
      updateRangeDisplays();
      renderTimeline();
    });

    track.appendChild(block);
  }
}

// Check if skeleton effect is active
function isSkeletonActive() {
  if (!skeletonEnabled) return false;
  if (effectsRange.start === null || effectsRange.end === null) return false;
  const t = video.currentTime;
  return t >= effectsRange.start && t <= effectsRange.end;
}

// Check if scan effect is active
function isScanActive() {
  if (!scanEnabled) return false;
  if (effectsRange.start === null || effectsRange.end === null) return false;
  const t = video.currentTime;
  return t >= effectsRange.start && t <= effectsRange.end;
}

// Check if rating is active
function isRatingActive() {
  if (!capturedFrame) return false;
  if (ratingRange.start === null || ratingRange.end === null) return false;
  const t = video.currentTime;
  return t >= ratingRange.start && t <= ratingRange.end;
}

// Main draw loop
function draw() {
  try {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video frame
    if (video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

  // Draw skeleton if active
  if (isSkeletonActive() && lastPoseResults?.poseLandmarks) {
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;

    for (const [start, end] of POSE_CONNECTIONS) {
      const startPoint = lastPoseResults.poseLandmarks[start];
      const endPoint = lastPoseResults.poseLandmarks[end];

      if (startPoint?.visibility > 0.5 && endPoint?.visibility > 0.5) {
        ctx.beginPath();
        ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
        ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
        ctx.stroke();
      }
    }

    ctx.fillStyle = '#ffffff';
    for (const landmark of lastPoseResults.poseLandmarks) {
      if (landmark.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Draw scan effect if active
  if (isScanActive()) {
    const gradient = ctx.createLinearGradient(0, scanY - 80, 0, scanY + 10);
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0)');
    gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.2)');
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.6)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, scanY - 80, canvas.width, 90);

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(0, scanY);
    ctx.lineTo(canvas.width, scanY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Corner brackets
    const margin = 20, bracketSize = 40;
    ctx.lineWidth = 3;
    [[margin, margin], [canvas.width - margin, margin],
     [margin, canvas.height - margin], [canvas.width - margin, canvas.height - margin]]
    .forEach(([x, y], i) => {
      const dx = i % 2 === 0 ? 1 : -1;
      const dy = i < 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(x, y + dy * bracketSize);
      ctx.lineTo(x, y);
      ctx.lineTo(x + dx * bracketSize, y);
      ctx.stroke();
    });

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#22c55e';
    ctx.textAlign = 'center';
    ctx.fillText('ANALYZING MOVEMENT...', canvas.width / 2, 50);

    scanY += 15;
    if (scanY > canvas.height + 80) scanY = -80;
  } else {
    scanY = -80;
  }

  // Draw rating if active
  if (isRatingActive()) {
    try {
      const elapsed = (video.currentTime - ratingRange.start) * 1000;
      drawRatingCard(elapsed);
    } catch (err) {
      console.error('Rating card error:', err);
    }
  }

    ctx.restore();

    if (!video.paused) {
      updateTimeDisplay();
    }
  } catch (err) {
    console.error('Draw loop error:', err);
  }

  animationId = requestAnimationFrame(draw);
}

// Particle system for card effects
let cardParticles = [];
let lightRays = [];

function initCardEffects(cx, cy, cardW, cardH) {
  cardParticles = [];
  lightRays = [];
  for (let i = 0; i < 40; i++) {
    cardParticles.push({
      x: cx + Math.random() * cardW,
      y: cy + Math.random() * cardH,
      size: Math.random() * 4 + 1,
      speedX: (Math.random() - 0.5) * 2,
      speedY: -Math.random() * 3 - 1,
      alpha: Math.random() * 0.8 + 0.2,
      hue: Math.random() * 40 + 40,
      twinkle: Math.random() * Math.PI * 2
    });
  }
  for (let i = 0; i < 12; i++) {
    lightRays.push({
      angle: (i / 12) * Math.PI * 2,
      length: cardH * 0.8 + Math.random() * cardH * 0.4,
      width: 15 + Math.random() * 25,
      speed: 0.003 + Math.random() * 0.004,
      alpha: 0.15 + Math.random() * 0.15
    });
  }
}

// Draw FIFA rating card
function drawRatingCard(elapsed) {
  const animProgress = Math.min(elapsed / 500, 1);
  const easeOut = 1 - Math.pow(1 - animProgress, 3);
  const bounce = Math.sin(animProgress * Math.PI) * 0.05;

  // Epic dark background with vignette
  const bgGrad = ctx.createRadialGradient(
    canvas.width/2, canvas.height/2, 0,
    canvas.width/2, canvas.height/2, canvas.height
  );
  bgGrad.addColorStop(0, `rgba(25, 18, 5, ${0.9 * easeOut})`);
  bgGrad.addColorStop(1, `rgba(0, 0, 0, ${0.98 * easeOut})`);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cardW = Math.min(canvas.width * 0.92, 550);
  const cardH = cardW * 1.45;
  const scale = (0.3 + 0.7 * easeOut) * (1 + bounce);

  const cx = (canvas.width - cardW) / 2;
  const cy = (canvas.height - cardH) / 2;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  if (elapsed < 50) initCardEffects(cx, cy, cardW, cardH);

  // Light rays behind card
  ctx.save();
  ctx.translate(centerX, centerY);
  lightRays.forEach(ray => {
    ray.angle += ray.speed;
    ctx.save();
    ctx.rotate(ray.angle);
    const rayGrad = ctx.createLinearGradient(0, 0, ray.length * easeOut, 0);
    rayGrad.addColorStop(0, `rgba(255, 215, 0, ${ray.alpha * easeOut})`);
    rayGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = rayGrad;
    ctx.beginPath();
    ctx.moveTo(0, -ray.width/2);
    ctx.lineTo(ray.length * easeOut, -ray.width/4);
    ctx.lineTo(ray.length * easeOut, ray.width/4);
    ctx.lineTo(0, ray.width/2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(scale, scale);
  ctx.translate(-centerX, -centerY);

  // Shield shape - flat top with rounded corners
  function shieldPath() {
    ctx.beginPath();
    // Start at left side below corner
    ctx.moveTo(cx, cy + cardH * 0.03);
    // Top left rounded corner
    ctx.quadraticCurveTo(cx, cy, cx + cardW * 0.03, cy);
    // Flat top edge
    ctx.lineTo(cx + cardW * 0.97, cy);
    // Top right rounded corner
    ctx.quadraticCurveTo(cx + cardW, cy, cx + cardW, cy + cardH * 0.03);
    // Right edge - goes down further
    ctx.lineTo(cx + cardW, cy + cardH * 0.82);
    // Bottom right - slight curve then angle to point
    ctx.quadraticCurveTo(cx + cardW, cy + cardH * 0.87, cx + cardW * 0.85, cy + cardH * 0.9);
    // Sharp bottom point - wider angle
    ctx.lineTo(cx + cardW / 2, cy + cardH);
    // Bottom left angle
    ctx.lineTo(cx + cardW * 0.15, cy + cardH * 0.9);
    // Bottom left curve
    ctx.quadraticCurveTo(cx, cy + cardH * 0.87, cx, cy + cardH * 0.82);
    // Left edge back to start
    ctx.lineTo(cx, cy + cardH * 0.06);
    ctx.closePath();
  }

  // Pulsing outer glow
  const glowPulse = 1 + Math.sin(elapsed / 120) * 0.4;
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 50 * glowPulse * easeOut;

  // Gold gradient base
  shieldPath();
  const grad = ctx.createLinearGradient(cx, cy, cx + cardW, cy + cardH);
  grad.addColorStop(0, '#7A6318');
  grad.addColorStop(0.12, '#B8942A');
  grad.addColorStop(0.3, '#D4B84A');
  grad.addColorStop(0.5, '#FFF4CC');
  grad.addColorStop(0.7, '#D4B84A');
  grad.addColorStop(0.88, '#B8942A');
  grad.addColorStop(1, '#7A6318');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Animated diagonal shimmer
  const shimmer = (elapsed / 8) % (cardW * 3);
  ctx.save();
  shieldPath();
  ctx.clip();
  const shimGrad = ctx.createLinearGradient(cx - cardW + shimmer, cy, cx + shimmer, cy + cardH);
  shimGrad.addColorStop(0, 'rgba(255,255,255,0)');
  shimGrad.addColorStop(0.4, 'rgba(255,255,255,0)');
  shimGrad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  shimGrad.addColorStop(0.6, 'rgba(255,255,255,0)');
  shimGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shimGrad;
  ctx.fill();

  // Holographic rainbow sweep
  const holoOffset = (elapsed / 25) % cardW;
  const holoGrad = ctx.createLinearGradient(cx + holoOffset, cy, cx + cardW + holoOffset, cy + cardH);
  holoGrad.addColorStop(0, 'rgba(255,50,150,0.1)');
  holoGrad.addColorStop(0.33, 'rgba(50,255,200,0.1)');
  holoGrad.addColorStop(0.66, 'rgba(150,50,255,0.1)');
  holoGrad.addColorStop(1, 'rgba(255,200,50,0.1)');
  ctx.fillStyle = holoGrad;
  ctx.fill();

  // Curved decorative lines on top portion
  ctx.strokeStyle = 'rgba(255, 240, 180, 0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    const startX = cx + cardW * 0.3 + i * cardW * 0.12;
    const startY = cy;
    const cp1x = startX + cardW * 0.15;
    const cp1y = cy + cardH * 0.15;
    const cp2x = startX + cardW * 0.05;
    const cp2y = cy + cardH * 0.35;
    const endX = startX - cardW * 0.1;
    const endY = cy + cardH * 0.5;
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    ctx.stroke();
  }

  // Additional curved lines from right edge
  ctx.strokeStyle = 'rgba(180, 140, 40, 0.2)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const startX = cx + cardW;
    const startY = cy + cardH * 0.05 + i * cardH * 0.08;
    const cp1x = cx + cardW * 0.7;
    const cp1y = startY + cardH * 0.1;
    const cp2x = cx + cardW * 0.5;
    const cp2y = startY + cardH * 0.15;
    const endX = cx + cardW * 0.35;
    const endY = startY + cardH * 0.2;
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    ctx.stroke();
  }

  ctx.restore();

  // Premium card border - layered metallic effect
  ctx.save();

  // Outer glow
  shieldPath();
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 20;
  ctx.strokeStyle = 'transparent';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Dark base layer
  shieldPath();
  ctx.strokeStyle = '#2a2005';
  ctx.lineWidth = 8;
  ctx.stroke();

  // Main metallic gradient border
  const cardBorderGrad = ctx.createLinearGradient(cx, cy, cx + cardW, cy + cardH);
  cardBorderGrad.addColorStop(0, '#ffd700');
  cardBorderGrad.addColorStop(0.1, '#8B7500');
  cardBorderGrad.addColorStop(0.25, '#ffd700');
  cardBorderGrad.addColorStop(0.4, '#fffacd');
  cardBorderGrad.addColorStop(0.5, '#ffd700');
  cardBorderGrad.addColorStop(0.6, '#fffacd');
  cardBorderGrad.addColorStop(0.75, '#ffd700');
  cardBorderGrad.addColorStop(0.9, '#8B7500');
  cardBorderGrad.addColorStop(1, '#ffd700');
  shieldPath();
  ctx.strokeStyle = cardBorderGrad;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Inner bright highlight
  shieldPath();
  ctx.strokeStyle = 'rgba(255, 250, 205, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner dark edge for depth
  shieldPath();
  ctx.strokeStyle = 'rgba(60, 50, 10, 0.5)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.restore();

  // Player image - clean, no shade
  if (capturedFrame) {
    const imgW = cardW * 0.65;
    const imgH = cardH * 0.52;
    const imgX = cx + cardW * 0.32;
    const imgY = cy + cardH * 0.02;

    const srcW = capturedFrame.width, srcH = capturedFrame.height;
    const dstRatio = imgW / imgH, srcRatio = srcW / srcH;
    let sx, sy, sw, sh;
    if (srcRatio > dstRatio) {
      sh = srcH; sw = srcH * dstRatio; sx = (srcW - sw) / 2; sy = 0;
    } else {
      sw = srcW; sh = srcW / dstRatio; sx = 0; sy = (srcH - sh) / 2;
    }

    ctx.save();
    shieldPath();
    ctx.clip();
    ctx.drawImage(capturedFrame, sx, sy, sw, sh, imgX, imgY, imgW, imgH);
    ctx.restore();

    // Premium photo frame with layered effects
    ctx.save();

    // Frame dimensions
    const frameWidth = 6;
    const bx = imgX;
    const by = imgY;
    const bw = imgW;
    const bh = imgH;
    const cornerRadius = 10;

    // Helper function for rounded rect path
    function framePath(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // Layer 1: Outer glow
    framePath(bx, by, bw, bh, cornerRadius);
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#8B7500';
    ctx.lineWidth = frameWidth + 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Layer 2: Dark outer edge (bevel effect)
    framePath(bx, by, bw, bh, cornerRadius);
    ctx.strokeStyle = '#4a3f00';
    ctx.lineWidth = frameWidth + 2;
    ctx.stroke();

    // Layer 3: Main gold frame with gradient
    const frameGrad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    frameGrad.addColorStop(0, '#ffd700');
    frameGrad.addColorStop(0.15, '#b8860b');
    frameGrad.addColorStop(0.3, '#ffd700');
    frameGrad.addColorStop(0.5, '#fffacd');
    frameGrad.addColorStop(0.7, '#ffd700');
    frameGrad.addColorStop(0.85, '#b8860b');
    frameGrad.addColorStop(1, '#ffd700');
    framePath(bx, by, bw, bh, cornerRadius);
    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = frameWidth;
    ctx.stroke();

    // Layer 4: Inner bright highlight
    framePath(bx + 2, by + 2, bw - 4, bh - 4, cornerRadius - 1);
    ctx.strokeStyle = 'rgba(255, 250, 205, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Layer 5: Inner shadow for depth
    const innerShadowGrad = ctx.createLinearGradient(bx, by, bx, by + bh * 0.3);
    innerShadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
    innerShadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    framePath(bx + 3, by + 3, bw - 6, bh - 6, cornerRadius - 2);
    ctx.clip();
    ctx.fillStyle = innerShadowGrad;
    ctx.fillRect(bx, by, bw, bh * 0.3);
    ctx.restore();

    // Inner glow around photo
    ctx.save();
    framePath(bx + 4, by + 4, bw - 8, bh - 8, cornerRadius - 3);
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Decorative corner brackets
    const bracketSize = 20;
    const bracketThickness = 3;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = bracketThickness;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8;

    // Top left bracket
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + bracketSize);
    ctx.lineTo(bx - 4, by - 4);
    ctx.lineTo(bx + bracketSize, by - 4);
    ctx.stroke();

    // Top right bracket
    ctx.beginPath();
    ctx.moveTo(bx + bw - bracketSize, by - 4);
    ctx.lineTo(bx + bw + 4, by - 4);
    ctx.lineTo(bx + bw + 4, by + bracketSize);
    ctx.stroke();

    // Bottom left bracket
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + bh - bracketSize);
    ctx.lineTo(bx - 4, by + bh + 4);
    ctx.lineTo(bx + bracketSize, by + bh + 4);
    ctx.stroke();

    // Bottom right bracket
    ctx.beginPath();
    ctx.moveTo(bx + bw - bracketSize, by + bh + 4);
    ctx.lineTo(bx + bw + 4, by + bh + 4);
    ctx.lineTo(bx + bw + 4, by + bh - bracketSize);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Corner diamonds
    const diamondSize = 6;
    ctx.fillStyle = '#fffacd';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 5;

    [[bx - 4, by - 4], [bx + bw + 4, by - 4], [bx - 4, by + bh + 4], [bx + bw + 4, by + bh + 4]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(dx, dy - diamondSize);
      ctx.lineTo(dx + diamondSize, dy);
      ctx.lineTo(dx, dy + diamondSize);
      ctx.lineTo(dx - diamondSize, dy);
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();
  }

  // Rating badge - hexagon shape with integrated ST
  const ratingX = cx + cardW * 0.16;
  const ratingY = cy + cardH * 0.085;
  const badgeSize = cardW * 0.14;

  // Hexagon path helper
  function hexPath(x, y, size, stretch = 1) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const px = x + Math.cos(angle) * size;
      const py = y + Math.sin(angle) * size * stretch;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  ctx.save();

  // Outer glow
  hexPath(ratingX, ratingY, badgeSize + 3, 1.15);
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Dark hexagon background
  hexPath(ratingX, ratingY, badgeSize, 1.15);
  const hexGrad = ctx.createRadialGradient(ratingX, ratingY - badgeSize * 0.4, 0, ratingX, ratingY, badgeSize * 1.2);
  hexGrad.addColorStop(0, 'rgba(50, 45, 20, 0.95)');
  hexGrad.addColorStop(0.5, 'rgba(30, 25, 10, 0.98)');
  hexGrad.addColorStop(1, 'rgba(15, 12, 5, 1)');
  ctx.fillStyle = hexGrad;
  ctx.fill();

  // Gold border
  hexPath(ratingX, ratingY, badgeSize, 1.15);
  const borderGrad = ctx.createLinearGradient(ratingX - badgeSize, ratingY - badgeSize, ratingX + badgeSize, ratingY + badgeSize);
  borderGrad.addColorStop(0, '#ffd700');
  borderGrad.addColorStop(0.3, '#b8860b');
  borderGrad.addColorStop(0.5, '#fffacd');
  borderGrad.addColorStop(0.7, '#b8860b');
  borderGrad.addColorStop(1, '#ffd700');
  ctx.strokeStyle = borderGrad;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Inner ring 1
  hexPath(ratingX, ratingY, badgeSize * 0.85, 1.15);
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Decorative corner dots
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const dotX = ratingX + Math.cos(angle) * (badgeSize * 0.92);
    const dotY = ratingY + Math.sin(angle) * (badgeSize * 0.92 * 1.15);
    ctx.beginPath();
    ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.restore();

  // Big rating number with strong 3D emboss
  const displayRating = Math.floor(ratingStats.overall * Math.min(elapsed / 500, 1));
  const ratingTextY = ratingY + cardH * 0.005;
  ctx.font = `bold ${cardW * 0.13}px Arial Black`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Deep shadow layer
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillText(displayRating, ratingX + 3, ratingTextY + 3);

  // Mid shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillText(displayRating, ratingX + 1.5, ratingTextY + 1.5);

  // Metallic gradient for main text
  const ratingGrad = ctx.createLinearGradient(ratingX - 40, ratingTextY - 40, ratingX + 40, ratingTextY + 20);
  ratingGrad.addColorStop(0, '#fffef0');
  ratingGrad.addColorStop(0.2, '#ffd700');
  ratingGrad.addColorStop(0.4, '#fffacd');
  ratingGrad.addColorStop(0.6, '#ffd700');
  ratingGrad.addColorStop(0.8, '#daa520');
  ratingGrad.addColorStop(1, '#b8860b');

  // Main text with subtle glow
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 5;
  ctx.fillStyle = ratingGrad;
  ctx.fillText(displayRating, ratingX, ratingTextY);
  ctx.shadowBlur = 0;

  // Bright highlight (top edge)
  ctx.fillStyle = 'rgba(255, 255, 250, 0.6)';
  ctx.fillText(displayRating, ratingX - 1, ratingTextY - 1.5);

  // Animated shine sweep across numbers
  const shinePos = (elapsed / 5) % (cardW * 0.4) - cardW * 0.1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ratingX - badgeSize, ratingY - badgeSize, badgeSize * 2, badgeSize * 2.3);
  ctx.clip();
  const shineGrad = ctx.createLinearGradient(ratingX + shinePos - 15, ratingTextY, ratingX + shinePos + 15, ratingTextY);
  shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  shineGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
  shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = shineGrad;
  ctx.font = `bold ${cardW * 0.14}px Arial Black`;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillText(displayRating, ratingX, ratingTextY);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // ST badge - connected to hexagon at bottom
  const posY = ratingY + badgeSize * 1.15 + cardH * 0.015;
  const posW = cardW * 0.09;
  const posH = cardH * 0.038;

  // Connection line from hex to ST
  ctx.beginPath();
  ctx.moveTo(ratingX, ratingY + badgeSize * 1.15);
  ctx.lineTo(ratingX, posY - posH / 2);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ST badge shape (shield-like)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ratingX - posW / 2, posY - posH / 2);
  ctx.lineTo(ratingX + posW / 2, posY - posH / 2);
  ctx.lineTo(ratingX + posW / 2, posY + posH * 0.2);
  ctx.lineTo(ratingX, posY + posH / 2);
  ctx.lineTo(ratingX - posW / 2, posY + posH * 0.2);
  ctx.closePath();

  const posBadgeGrad = ctx.createLinearGradient(ratingX - posW / 2, posY - posH / 2, ratingX + posW / 2, posY + posH / 2);
  posBadgeGrad.addColorStop(0, '#ffd700');
  posBadgeGrad.addColorStop(0.3, '#c9a227');
  posBadgeGrad.addColorStop(0.5, '#fffacd');
  posBadgeGrad.addColorStop(0.7, '#c9a227');
  posBadgeGrad.addColorStop(1, '#ffd700');
  ctx.fillStyle = posBadgeGrad;
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 2;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#8B7500';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Position text with emboss
  ctx.font = `bold ${cardW * 0.04}px Arial Black`;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillText('ST', ratingX + 1, posY + 1);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillText('ST', ratingX, posY);

  // Name bar with gradient
  const barY = cy + cardH * 0.545;
  const barH = cardH * 0.085;
  ctx.save();
  shieldPath();
  ctx.clip();
  const barGrad = ctx.createLinearGradient(cx, barY, cx, barY + barH);
  barGrad.addColorStop(0, 'rgba(15, 12, 5, 0.9)');
  barGrad.addColorStop(0.5, 'rgba(25, 20, 8, 0.9)');
  barGrad.addColorStop(1, 'rgba(15, 12, 5, 0.9)');
  ctx.fillStyle = barGrad;
  ctx.fillRect(cx, barY, cardW, barH);
  ctx.restore();

  // Name with subtle glow
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 3;
  ctx.fillStyle = '#F5E6A3';
  ctx.font = `bold ${cardW * 0.09}px Arial Black`;
  ctx.textAlign = 'center';
  ctx.fillText('SKILL RATING', cx + cardW / 2, barY + barH * 0.7);
  ctx.shadowBlur = 0;

  // Stats background with gradient
  const statsBarY = barY + barH;
  const statsBarH = cardH * 0.3;
  ctx.save();
  shieldPath();
  ctx.clip();

  // Rich gradient background
  const statsBgGrad = ctx.createLinearGradient(cx, statsBarY, cx, statsBarY + statsBarH);
  statsBgGrad.addColorStop(0, 'rgba(25, 20, 8, 0.95)');
  statsBgGrad.addColorStop(0.3, 'rgba(15, 12, 5, 0.9)');
  statsBgGrad.addColorStop(0.7, 'rgba(20, 16, 6, 0.9)');
  statsBgGrad.addColorStop(1, 'rgba(30, 24, 10, 0.95)');
  ctx.fillStyle = statsBgGrad;
  ctx.fillRect(cx, statsBarY, cardW, statsBarH);

  // Subtle diagonal pattern overlay
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 20, statsBarY);
    ctx.lineTo(cx + i * 20 + statsBarH, statsBarY + statsBarH);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Stats with dramatic animations
  const stats = [
    { label: 'PAC', value: ratingStats.pac },
    { label: 'SHO', value: ratingStats.sho },
    { label: 'PAS', value: ratingStats.pas },
    { label: 'DRI', value: ratingStats.dri },
    { label: 'DEF', value: ratingStats.def },
    { label: 'PHY', value: ratingStats.phy },
  ];

  const statStartY = statsBarY + cardH * 0.055;
  const statRowH = cardH * 0.07;
  const col1 = cx + cardW * 0.27;
  const col2 = cx + cardW * 0.73;

  // Draw horizontal dividers between rows
  ctx.save();
  shieldPath();
  ctx.clip();
  for (let row = 1; row < 3; row++) {
    const dividerY = statStartY + row * statRowH - statRowH * 0.35;
    const divGrad = ctx.createLinearGradient(cx, dividerY, cx + cardW, dividerY);
    divGrad.addColorStop(0, 'rgba(201, 162, 39, 0)');
    divGrad.addColorStop(0.2, 'rgba(201, 162, 39, 0.4)');
    divGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.6)');
    divGrad.addColorStop(0.8, 'rgba(201, 162, 39, 0.4)');
    divGrad.addColorStop(1, 'rgba(201, 162, 39, 0)');
    ctx.strokeStyle = divGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + cardW * 0.08, dividerY);
    ctx.lineTo(cx + cardW * 0.92, dividerY);
    ctx.stroke();
  }
  ctx.restore();

  stats.forEach((stat, i) => {
    const delay = 350 + i * 70;
    const prog = Math.min(Math.max((elapsed - delay) / 300, 0), 1);
    const ease = 1 - Math.pow(1 - prog, 3);
    const col = i < 3 ? col1 : col2;
    const row = i % 3;
    const y = statStartY + row * statRowH;
    const slideX = (1 - ease) * 40 * (i < 3 ? -1 : 1);
    const statGlow = Math.sin(elapsed / 200 + i) * 0.3 + 0.7;

    ctx.globalAlpha = ease;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 5 * statGlow;
    ctx.fillStyle = '#FFF8DC';
    ctx.font = `bold ${cardW * 0.075}px Arial Black`;
    ctx.textAlign = 'right';
    ctx.fillText(Math.floor(stat.value * ease), col - 5 + slideX, y);
    ctx.shadowBlur = 0;

    // Brighter metallic labels with gradient
    const labelGrad = ctx.createLinearGradient(col + 8 + slideX, y - 10, col + 8 + slideX + 30, y);
    labelGrad.addColorStop(0, '#FFD700');
    labelGrad.addColorStop(0.5, '#FFF8DC');
    labelGrad.addColorStop(1, '#C9A227');
    ctx.fillStyle = labelGrad;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 3;
    ctx.font = `bold ${cardW * 0.045}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillText(stat.label, col + 8 + slideX, y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  });

  // Sparkle particles
  cardParticles.forEach(p => {
    p.x += p.speedX;
    p.y += p.speedY;
    p.twinkle += 0.15;
    p.alpha -= 0.008;
    const twinkleAlpha = (Math.sin(p.twinkle) + 1) / 2;

    if (p.alpha <= 0 || p.y < cy - 50) {
      p.x = cx + Math.random() * cardW;
      p.y = cy + cardH + Math.random() * 20;
      p.alpha = 0.8;
      p.twinkle = Math.random() * Math.PI * 2;
    }

    const finalAlpha = p.alpha * easeOut * (0.5 + twinkleAlpha * 0.5);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * scale, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${finalAlpha})`;
    ctx.fill();

    // Star sparkle effect
    if (twinkleAlpha > 0.8) {
      ctx.strokeStyle = `hsla(${p.hue}, 80%, 80%, ${finalAlpha * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - p.size * 2, p.y);
      ctx.lineTo(p.x + p.size * 2, p.y);
      ctx.moveTo(p.x, p.y - p.size * 2);
      ctx.lineTo(p.x, p.y + p.size * 2);
      ctx.stroke();
    }
  });
}

// Process pose
async function processFrame() {
  if (video.paused || video.ended) return;
  if (pose) await pose.send({ image: video });
  requestAnimationFrame(processFrame);
}

// Handle video upload
videoUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  video.src = URL.createObjectURL(file);

  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    videoDuration = video.duration;

    uploadSection.style.display = 'none';
    editor.style.display = 'block';

    createRuler();
    updateTimeDisplay();
    updateRangeDisplays();
    draw();
  };

  if (!pose) await initPose();
});

// Timeline click to seek
timeline.addEventListener('click', (e) => {
  if (e.target.classList.contains('effect-block')) return;
  const rect = timeline.getBoundingClientRect();
  const x = e.clientX - rect.left - 40;
  const width = rect.width - 40;
  const percent = Math.max(0, Math.min(1, x / width));
  video.currentTime = percent * videoDuration;
  updateTimeDisplay();
});

// Draggable playhead
let isDraggingPlayhead = false;

playhead.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isDraggingPlayhead = true;
  video.pause();
  playBtn.textContent = '▶ Play';
});

document.addEventListener('mousemove', (e) => {
  if (!isDraggingPlayhead) return;
  const rect = timeline.getBoundingClientRect();
  const x = e.clientX - rect.left - 40;
  const width = rect.width - 40;
  const percent = Math.max(0, Math.min(1, x / width));
  video.currentTime = percent * videoDuration;
  updateTimeDisplay();
});

document.addEventListener('mouseup', () => {
  isDraggingPlayhead = false;
});

// Toggle event listeners
skeletonToggle.addEventListener('change', () => {
  skeletonEnabled = skeletonToggle.checked;
  renderTimeline();
});

scanToggle.addEventListener('change', () => {
  scanEnabled = scanToggle.checked;
  renderTimeline();
});

// Effects range buttons
setStartBtn.addEventListener('click', () => {
  effectsRange.start = video.currentTime;
  if (effectsRange.end !== null && effectsRange.end <= effectsRange.start) {
    effectsRange.end = null;
  }
  updateRangeDisplays();
  renderTimeline();
});

setEndBtn.addEventListener('click', () => {
  if (effectsRange.start === null) {
    effectsRange.start = 0;
  }
  effectsRange.end = video.currentTime;
  if (effectsRange.end <= effectsRange.start) {
    effectsRange.end = effectsRange.start + 0.5;
  }
  updateRangeDisplays();
  renderTimeline();
});

// Capture frame button
captureFrameBtn.addEventListener('click', () => {
  capturedFrame = captureCurrentFrame();
  capturedFrameTime = video.currentTime;
  captureStatus.textContent = `Frame at ${formatTime(capturedFrameTime)}`;

  // Show preview
  capturedPreview.src = capturedFrame.toDataURL('image/jpeg', 0.8);
  capturedPreview.style.display = 'block';

  // Generate stats when capturing
  ratingStats = {
    overall: Math.floor(Math.random() * 15) + 80,
    pac: Math.floor(Math.random() * 15) + 80,
    sho: Math.floor(Math.random() * 15) + 80,
    pas: Math.floor(Math.random() * 15) + 80,
    dri: Math.floor(Math.random() * 15) + 80,
    def: Math.floor(Math.random() * 20) + 50,
    phy: Math.floor(Math.random() * 15) + 75,
  };
});

// Place rating button
placeRatingBtn.addEventListener('click', async () => {
  if (!capturedFrame) {
    captureStatus.textContent = 'Capture a frame first!';
    return;
  }
  ratingRange.start = video.currentTime;
  ratingRange.end = Math.min(video.currentTime + 1.75, videoDuration);
  updateRangeDisplays();
  renderTimeline();

  // Auto-play to show the rating effect
  if (video.paused) {
    await video.play();
    processFrame();
    playBtn.textContent = '⏸ Pause';
  }
});

// Play/Pause
playBtn.addEventListener('click', () => {
  if (video.paused) {
    video.play();
    processFrame();
    playBtn.textContent = '⏸ Pause';
  } else {
    video.pause();
    playBtn.textContent = '▶ Play';
  }
});

// Reset
resetBtn.addEventListener('click', () => {
  video.pause();
  video.src = '';
  effectsRange = { start: null, end: null };
  ratingRange = { start: null, end: null };
  capturedFrame = null;
  capturedFrameTime = null;
  ratingStats = null;
  skeletonEnabled = false;
  scanEnabled = false;
  skeletonToggle.checked = false;
  scanToggle.checked = false;
  if (animationId) cancelAnimationFrame(animationId);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  uploadSection.style.display = 'block';
  editor.style.display = 'none';
  videoUpload.value = '';
  playBtn.textContent = '▶ Play';
  captureStatus.textContent = 'No frame captured';
  capturedPreview.style.display = 'none';
  updateRangeDisplays();
});

video.addEventListener('ended', () => {
  playBtn.textContent = '▶ Play';
});

video.addEventListener('timeupdate', updateTimeDisplay);

// Export video
let isExporting = false;

exportBtn.addEventListener('click', async () => {
  if (isExporting) return;

  isExporting = true;
  exportBtn.textContent = '⏳ Exporting...';
  exportBtn.disabled = true;

  // Reset video to start
  video.currentTime = 0;
  video.pause();

  // Wait for seek
  await new Promise(r => video.onseeked = r);

  // Set up MediaRecorder
  const stream = canvas.captureStream(30);
  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 5000000
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'footskill-edit.webm';
    a.click();
    URL.revokeObjectURL(url);

    isExporting = false;
    exportBtn.textContent = '⬇ Export';
    exportBtn.disabled = false;
    playBtn.textContent = '▶ Play';
  };

  // Start recording and play
  recorder.start();
  video.play();
  processFrame();

  // Stop when video ends
  video.onended = () => {
    recorder.stop();
    video.onended = () => { playBtn.textContent = '▶ Play'; };
  };
});
