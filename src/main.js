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
      <div class="video-container" id="video-container">
        <video id="video" playsinline></video>
        <canvas id="canvas"></canvas>
      </div>

      <div class="toolbar">
        <button id="play-btn" class="tool-btn">▶ Play</button>
        <span id="time-display">0:00 / 0:00</span>
        <div class="effect-buttons">
          <button id="add-skeleton" class="effect-btn skeleton">+ Skeleton</button>
          <button id="add-scan" class="effect-btn scan">+ Scan</button>
          <button id="add-rating" class="effect-btn rating">+ Rating</button>
        </div>
        <button id="reset-btn" class="tool-btn danger">✕ Reset</button>
      </div>

      <div class="timeline-container">
        <div class="timeline" id="timeline">
          <div class="timeline-track" id="track-skeleton" data-type="skeleton">
            <span class="track-label">Skeleton</span>
            <div class="track-content"></div>
          </div>
          <div class="timeline-track" id="track-scan" data-type="scan">
            <span class="track-label">Scan</span>
            <div class="track-content"></div>
          </div>
          <div class="timeline-track" id="track-rating" data-type="rating">
            <span class="track-label">Rating</span>
            <div class="track-content"></div>
          </div>
          <div class="playhead" id="playhead"></div>
          <div class="timeline-ruler" id="timeline-ruler"></div>
        </div>
      </div>

      <div class="instructions">
        Click a track to add effect at current time. Drag edges to resize. Click effect to delete.
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
const resetBtn = document.getElementById('reset-btn');
const timeDisplay = document.getElementById('time-display');
const timeline = document.getElementById('timeline');
const playhead = document.getElementById('playhead');
const timelineRuler = document.getElementById('timeline-ruler');

// Effect buttons
const addSkeletonBtn = document.getElementById('add-skeleton');
const addScanBtn = document.getElementById('add-scan');
const addRatingBtn = document.getElementById('add-rating');

// State
let pose = null;
let animationId = null;
let lastPoseResults = null;
let videoDuration = 0;
let isPlaying = false;

// Effects array - stores all timeline effects
let effects = [];
let effectIdCounter = 0;

// Current active effects state
let scanY = 0;
let showRating = false;
let ratingAnimStart = 0;
let ratingStats = null;
let capturedFrame = null;
let particles = [];

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
  playhead.style.left = `calc(80px + ${percent}% - ${percent * 0.8}px)`;
}

// Create timeline ruler
function createRuler() {
  timelineRuler.innerHTML = '';
  const width = timeline.offsetWidth - 80;
  const interval = videoDuration > 30 ? 5 : (videoDuration > 10 ? 2 : 1);

  for (let t = 0; t <= videoDuration; t += interval) {
    const marker = document.createElement('div');
    marker.className = 'ruler-marker';
    marker.style.left = `${80 + (t / videoDuration) * width}px`;
    marker.textContent = formatTime(t);
    timelineRuler.appendChild(marker);
  }
}

// Add effect to timeline
function addEffect(type, startTime, duration) {
  const id = effectIdCounter++;
  const effect = { id, type, startTime, duration };

  if (type === 'rating') {
    effect.stats = {
      overall: Math.floor(Math.random() * 15) + 80,
      pac: Math.floor(Math.random() * 15) + 80,
      sho: Math.floor(Math.random() * 15) + 80,
      pas: Math.floor(Math.random() * 15) + 80,
      dri: Math.floor(Math.random() * 15) + 80,
      def: Math.floor(Math.random() * 20) + 50,
      phy: Math.floor(Math.random() * 15) + 75,
    };
    effect.capturedFrame = captureCurrentFrame();
  }

  effects.push(effect);
  renderEffects();
  return effect;
}

// Capture current video frame
function captureCurrentFrame() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = video.videoWidth;
  tempCanvas.height = video.videoHeight;
  tempCanvas.getContext('2d').drawImage(video, 0, 0);
  return tempCanvas;
}

// Render effects on timeline
function renderEffects() {
  // Clear existing effect elements
  document.querySelectorAll('.effect-block').forEach(el => el.remove());

  const timelineWidth = timeline.offsetWidth - 80;

  effects.forEach(effect => {
    const track = document.querySelector(`#track-${effect.type} .track-content`);
    if (!track) return;

    const block = document.createElement('div');
    block.className = `effect-block ${effect.type}`;
    block.dataset.id = effect.id;

    const left = (effect.startTime / videoDuration) * timelineWidth;
    const width = (effect.duration / videoDuration) * timelineWidth;

    block.style.left = `${left}px`;
    block.style.width = `${Math.max(width, 20)}px`;

    // Delete on click
    block.addEventListener('click', (e) => {
      e.stopPropagation();
      effects = effects.filter(ef => ef.id !== effect.id);
      renderEffects();
    });

    // Resize handles
    const leftHandle = document.createElement('div');
    leftHandle.className = 'resize-handle left';
    const rightHandle = document.createElement('div');
    rightHandle.className = 'resize-handle right';

    block.appendChild(leftHandle);
    block.appendChild(rightHandle);

    // Drag to resize
    let resizing = null;
    let startX = 0;
    let originalStart = 0;
    let originalDuration = 0;

    const onMouseMove = (e) => {
      if (!resizing) return;
      const dx = e.clientX - startX;
      const dt = (dx / timelineWidth) * videoDuration;

      if (resizing === 'left') {
        const newStart = Math.max(0, originalStart + dt);
        const newDuration = originalDuration - (newStart - originalStart);
        if (newDuration > 0.2) {
          effect.startTime = newStart;
          effect.duration = newDuration;
        }
      } else {
        const newDuration = Math.max(0.2, originalDuration + dt);
        if (effect.startTime + newDuration <= videoDuration) {
          effect.duration = newDuration;
        }
      }
      renderEffects();
    };

    const onMouseUp = () => {
      resizing = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    leftHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      resizing = 'left';
      startX = e.clientX;
      originalStart = effect.startTime;
      originalDuration = effect.duration;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    rightHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      resizing = 'right';
      startX = e.clientX;
      originalStart = effect.startTime;
      originalDuration = effect.duration;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    track.appendChild(block);
  });
}

// Check which effects are active at current time
function getActiveEffects() {
  const currentTime = video.currentTime;
  return effects.filter(e =>
    currentTime >= e.startTime && currentTime < e.startTime + e.duration
  );
}

// Main draw loop
function draw() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw video frame
  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  const activeEffects = getActiveEffects();

  // Draw skeleton if active
  const skeletonEffect = activeEffects.find(e => e.type === 'skeleton');
  if (skeletonEffect && lastPoseResults?.poseLandmarks) {
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
  const scanEffect = activeEffects.find(e => e.type === 'scan');
  if (scanEffect) {
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
  const ratingEffect = activeEffects.find(e => e.type === 'rating');
  if (ratingEffect) {
    const elapsed = (video.currentTime - ratingEffect.startTime) * 1000;
    drawRatingCard(ratingEffect, elapsed);
  }

  ctx.restore();

  if (!video.paused) {
    updateTimeDisplay();
  }

  animationId = requestAnimationFrame(draw);
}

// Draw FIFA rating card
function drawRatingCard(effect, elapsed) {
  const animProgress = Math.min(elapsed / 600, 1);
  const easeOut = 1 - Math.pow(1 - animProgress, 3);

  ctx.fillStyle = `rgba(0, 0, 0, ${0.95 * easeOut})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cardW = Math.min(canvas.width * 0.88, 520);
  const cardH = cardW * 1.42;
  const scale = 0.5 + 0.5 * easeOut;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  const drawCardX = (canvas.width - cardW) / 2;
  const drawCardY = (canvas.height - cardH) / 2;

  // Shield shape
  ctx.beginPath();
  ctx.moveTo(drawCardX + 25, drawCardY);
  ctx.lineTo(drawCardX + cardW - 25, drawCardY);
  ctx.quadraticCurveTo(drawCardX + cardW, drawCardY, drawCardX + cardW, drawCardY + 25);
  ctx.lineTo(drawCardX + cardW, drawCardY + cardH * 0.72);
  ctx.quadraticCurveTo(drawCardX + cardW, drawCardY + cardH * 0.82, drawCardX + cardW * 0.82, drawCardY + cardH * 0.9);
  ctx.lineTo(drawCardX + cardW / 2, drawCardY + cardH);
  ctx.lineTo(drawCardX + cardW * 0.18, drawCardY + cardH * 0.9);
  ctx.quadraticCurveTo(drawCardX, drawCardY + cardH * 0.82, drawCardX, drawCardY + cardH * 0.72);
  ctx.lineTo(drawCardX, drawCardY + 25);
  ctx.quadraticCurveTo(drawCardX, drawCardY, drawCardX + 25, drawCardY);
  ctx.closePath();

  // Gold gradient
  const cardGrad = ctx.createLinearGradient(drawCardX, drawCardY, drawCardX + cardW, drawCardY + cardH);
  cardGrad.addColorStop(0, '#b8942a');
  cardGrad.addColorStop(0.3, '#f5e6a3');
  cardGrad.addColorStop(0.5, '#d4af37');
  cardGrad.addColorStop(0.7, '#f5e6a3');
  cardGrad.addColorStop(1, '#b8942a');

  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 30;
  ctx.fillStyle = cardGrad;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#7a5f1a';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Player image
  if (effect.capturedFrame) {
    const imgW = cardW * 0.52, imgH = cardW * 0.65;
    const imgX = drawCardX + cardW * 0.42, imgY = drawCardY + cardH * 0.05;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 8);
    ctx.clip();
    ctx.drawImage(effect.capturedFrame, imgX, imgY, imgW, imgH);
    ctx.restore();

    ctx.strokeStyle = '#5a4a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 8);
    ctx.stroke();
  }

  // Rating
  const leftX = drawCardX + cardW * 0.15;
  const displayRating = Math.floor(effect.stats.overall * Math.min(elapsed / 800, 1));

  ctx.fillStyle = '#2d2510';
  ctx.font = `bold ${cardW * 0.22}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText(displayRating, leftX, drawCardY + cardH * 0.14);
  ctx.font = `bold ${cardW * 0.08}px Arial`;
  ctx.fillText('ST', leftX, drawCardY + cardH * 0.2);

  // Stats
  const imgH = cardW * 0.65;
  const nameY = drawCardY + cardH * 0.05 + imgH + cardH * 0.04;
  ctx.font = `bold ${cardW * 0.09}px Arial`;
  ctx.fillText('SKILL RATING', drawCardX + cardW / 2, nameY);

  const statsY = nameY + cardH * 0.065;
  const stats = [
    { label: 'PAC', value: effect.stats.pac },
    { label: 'SHO', value: effect.stats.sho },
    { label: 'PAS', value: effect.stats.pas },
    { label: 'DRI', value: effect.stats.dri },
    { label: 'DEF', value: effect.stats.def },
    { label: 'PHY', value: effect.stats.phy },
  ];

  const statRowH = cardW * 0.072;
  const col1X = drawCardX + cardW * 0.28;
  const col2X = drawCardX + cardW * 0.72;

  stats.forEach((stat, i) => {
    const delay = 400 + i * 80;
    const progress = Math.min(Math.max((elapsed - delay) / 300, 0), 1);
    const x = i < 3 ? col1X : col2X;
    const y = statsY + (i % 3) * statRowH;

    ctx.globalAlpha = progress;
    ctx.font = `bold ${cardW * 0.062}px Arial`;
    ctx.textAlign = 'right';
    ctx.fillText(Math.floor(stat.value * progress), x - 8, y);
    ctx.font = `${cardW * 0.046}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillText(stat.label, x + 8, y);
    ctx.globalAlpha = 1;
  });

  ctx.font = `bold ${cardW * 0.038}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('⚽ FOOTSKILL AI ⚽', drawCardX + cardW / 2, drawCardY + cardH * 0.92);

  ctx.restore();
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
    draw();
  };

  if (!pose) await initPose();
});

// Timeline click to seek
timeline.addEventListener('click', (e) => {
  const rect = timeline.getBoundingClientRect();
  const x = e.clientX - rect.left - 80;
  const width = rect.width - 80;
  const percent = Math.max(0, Math.min(1, x / width));
  video.currentTime = percent * videoDuration;
  updateTimeDisplay();
});

// Add effect buttons
addSkeletonBtn.addEventListener('click', () => {
  addEffect('skeleton', video.currentTime, Math.min(3, videoDuration - video.currentTime));
});

addScanBtn.addEventListener('click', () => {
  addEffect('scan', video.currentTime, Math.min(2, videoDuration - video.currentTime));
});

addRatingBtn.addEventListener('click', () => {
  addEffect('rating', video.currentTime, Math.min(3.5, videoDuration - video.currentTime));
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
  effects = [];
  if (animationId) cancelAnimationFrame(animationId);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  uploadSection.style.display = 'block';
  editor.style.display = 'none';
  videoUpload.value = '';
  playBtn.textContent = '▶ Play';
});

video.addEventListener('ended', () => {
  playBtn.textContent = '▶ Play';
});

video.addEventListener('timeupdate', updateTimeDisplay);
