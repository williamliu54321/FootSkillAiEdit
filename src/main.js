import './style.css';

document.querySelector('#app').innerHTML = `
  <div class="container">
    <header>
      <h1>FootSkill<span class="accent">AI</span></h1>
      <p class="subtitle">Video Pose Analysis</p>
    </header>

    <div class="upload-section" id="upload-section">
      <label for="video-upload" class="upload-btn">
        <span class="icon">📹</span>
        <span>Upload Video</span>
      </label>
      <input type="file" id="video-upload" accept="video/*" hidden>
    </div>

    <div class="video-container" id="video-container" style="display: none;">
      <video id="video" playsinline></video>
      <canvas id="canvas"></canvas>
    </div>

    <div class="controls" id="controls" style="display: none;">
      <button id="play-btn">Play</button>
      <button id="pause-btn">Pause</button>
      <button id="scan-btn">🔍 Analyze</button>
      <button id="rating-btn">⚽ Rate</button>
      <button id="reset-btn">New Video</button>
    </div>

    <div class="loading" id="loading" style="display: none;">
      <div class="spinner"></div>
      <p>Loading pose detection...</p>
    </div>
  </div>
`;

// Elements
const uploadSection = document.getElementById('upload-section');
const videoContainer = document.getElementById('video-container');
const controls = document.getElementById('controls');
const loading = document.getElementById('loading');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const videoUpload = document.getElementById('video-upload');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const scanBtn = document.getElementById('scan-btn');
const ratingBtn = document.getElementById('rating-btn');
const resetBtn = document.getElementById('reset-btn');

let pose = null;
let animationId = null;
let scanAnimationId = null;
let isScanning = false;
let scanY = 0;
let lastPoseResults = null;
let showRating = false;
let ratingTimeout = null;
let capturedFrame = null;
let ratingStats = null;
let ratingAnimStart = 0;
let particles = [];

// Pose connections for skeleton
const POSE_CONNECTIONS = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [23, 25], [25, 27], // left leg
  [24, 26], [26, 28], // right leg
  [27, 29], [29, 31], // left foot
  [28, 30], [30, 32], // right foot
  [0, 1], [1, 2], [2, 3], [3, 7], // face left
  [0, 4], [4, 5], [5, 6], [6, 8], // face right
  [9, 10], // mouth
];

// Initialize MediaPipe Pose
async function initPose() {
  loading.style.display = 'flex';

  const { Pose } = await import('@mediapipe/pose');

  pose = new Pose({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults(onResults);

  loading.style.display = 'none';
  console.log('Pose detection ready');
}

// Store pose results
function onResults(results) {
  lastPoseResults = results;
}

// Continuous draw loop for smooth animation
function draw() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw video frame
  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  // Draw skeleton from last pose results
  if (lastPoseResults && lastPoseResults.poseLandmarks) {
    // Draw connections (skeleton lines)
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;

    for (const [start, end] of POSE_CONNECTIONS) {
      const startPoint = lastPoseResults.poseLandmarks[start];
      const endPoint = lastPoseResults.poseLandmarks[end];

      if (startPoint && endPoint && startPoint.visibility > 0.5 && endPoint.visibility > 0.5) {
        ctx.beginPath();
        ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
        ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
        ctx.stroke();
      }
    }

    // Draw landmarks (joints)
    ctx.fillStyle = '#ffffff';
    for (const landmark of lastPoseResults.poseLandmarks) {
      if (landmark.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }

  // Draw radar scan effect
  if (isScanning) {
    // Scan line gradient
    const gradient = ctx.createLinearGradient(0, scanY - 80, 0, scanY + 10);
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0)');
    gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.2)');
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.6)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, scanY - 80, canvas.width, 90);

    // Bright scan line
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
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    const margin = 20;
    const bracketSize = 40;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(margin, margin + bracketSize);
    ctx.lineTo(margin, margin);
    ctx.lineTo(margin + bracketSize, margin);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(canvas.width - margin - bracketSize, margin);
    ctx.lineTo(canvas.width - margin, margin);
    ctx.lineTo(canvas.width - margin, margin + bracketSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(margin, canvas.height - margin - bracketSize);
    ctx.lineTo(margin, canvas.height - margin);
    ctx.lineTo(margin + bracketSize, canvas.height - margin);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(canvas.width - margin - bracketSize, canvas.height - margin);
    ctx.lineTo(canvas.width - margin, canvas.height - margin);
    ctx.lineTo(canvas.width - margin, canvas.height - margin - bracketSize);
    ctx.stroke();

    // "ANALYZING" text
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#22c55e';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 10;
    ctx.fillText('ANALYZING MOVEMENT...', canvas.width / 2, 50);
    ctx.shadowBlur = 0;

    // Update scan position (faster sweep)
    scanY += 15;
    if (scanY > canvas.height + 80) {
      scanY = -80;
    }
  }

  // FIFA-style rating overlay
  if (showRating && capturedFrame) {
    const elapsed = Date.now() - ratingAnimStart;
    const animProgress = Math.min(elapsed / 600, 1); // 600ms entrance
    const easeOut = 1 - Math.pow(1 - animProgress, 3);

    // Full dark overlay
    ctx.fillStyle = `rgba(0, 0, 0, ${0.95 * easeOut})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update and draw particles
    particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.opacity -= 0.003;

      if (p.opacity > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.opacity})`;
        ctx.fill();
      }
    });

    // Card dimensions
    const cardW = Math.min(canvas.width * 0.88, 520);
    const cardH = cardW * 1.42;

    // Animated scale and position
    const scale = 0.5 + 0.5 * easeOut;
    const cardX = (canvas.width - cardW * scale) / 2;
    const cardY = (canvas.height - cardH * scale) / 2;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    const drawCardX = (canvas.width - cardW) / 2;
    const drawCardY = (canvas.height - cardH) / 2;

    // Pulsing glow
    const glowPulse = Math.sin(elapsed / 200) * 10 + 30;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = glowPulse;

    // Draw shield shape
    function drawShield(x, y, w, h) {
      ctx.beginPath();
      ctx.moveTo(x + 25, y);
      ctx.lineTo(x + w - 25, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + 25);
      ctx.lineTo(x + w, y + h * 0.72);
      ctx.quadraticCurveTo(x + w, y + h * 0.82, x + w * 0.82, y + h * 0.9);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x + w * 0.18, y + h * 0.9);
      ctx.quadraticCurveTo(x, y + h * 0.82, x, y + h * 0.72);
      ctx.lineTo(x, y + 25);
      ctx.quadraticCurveTo(x, y, x + 25, y);
      ctx.closePath();
    }

    drawShield(drawCardX, drawCardY, cardW, cardH);

    // Animated gradient
    const gradOffset = (elapsed / 50) % cardW;
    const cardGrad = ctx.createLinearGradient(
      drawCardX - gradOffset, drawCardY,
      drawCardX + cardW + gradOffset, drawCardY + cardH
    );
    cardGrad.addColorStop(0, '#b8942a');
    cardGrad.addColorStop(0.15, '#e8d68a');
    cardGrad.addColorStop(0.3, '#f5e6a3');
    cardGrad.addColorStop(0.5, '#d4af37');
    cardGrad.addColorStop(0.7, '#f5e6a3');
    cardGrad.addColorStop(0.85, '#e8d68a');
    cardGrad.addColorStop(1, '#b8942a');
    ctx.fillStyle = cardGrad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Border
    ctx.strokeStyle = '#7a5f1a';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Shimmer effect
    ctx.save();
    drawShield(drawCardX, drawCardY, cardW, cardH);
    ctx.clip();

    const shimmerX = ((elapsed / 8) % (cardW * 2.5)) - cardW * 0.5;
    const shimmerGrad = ctx.createLinearGradient(
      drawCardX + shimmerX - 80, drawCardY,
      drawCardX + shimmerX + 80, drawCardY + cardH
    );
    shimmerGrad.addColorStop(0, 'rgba(255,255,255,0)');
    shimmerGrad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    shimmerGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shimmerGrad;
    ctx.fillRect(drawCardX, drawCardY, cardW, cardH);

    // Curved shine
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.arc(drawCardX - cardW * 0.3, drawCardY + cardH * 0.3, cardW * 1.1, -0.5, 0.7);
    ctx.stroke();
    ctx.restore();

    // Player image
    const imgW = cardW * 0.52;
    const imgH = cardW * 0.65;
    const imgX = drawCardX + cardW * 0.42;
    const imgY = drawCardY + cardH * 0.05;

    const srcRatio = capturedFrame.width / capturedFrame.height;
    const dstRatio = imgW / imgH;
    let sx = 0, sy = 0, sw = capturedFrame.width, sh = capturedFrame.height;
    if (srcRatio > dstRatio) {
      sw = capturedFrame.height * dstRatio;
      sx = (capturedFrame.width - sw) / 2;
    } else {
      sh = capturedFrame.width / dstRatio;
      sy = (capturedFrame.height - sh) / 2;
    }

    // Image glow
    ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
    ctx.shadowBlur = 20;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 8);
    ctx.clip();
    ctx.drawImage(capturedFrame, sx, sy, sw, sh, imgX, imgY, imgW, imgH);
    ctx.restore();

    ctx.shadowBlur = 0;

    // Image border with glow
    ctx.strokeStyle = '#5a4a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 8);
    ctx.stroke();

    // Rating with count-up animation
    const leftX = drawCardX + cardW * 0.15;
    const displayRating = Math.floor(ratingStats.overall * Math.min(elapsed / 800, 1));

    ctx.fillStyle = '#2d2510';
    ctx.font = `bold ${cardW * 0.22}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(displayRating, leftX, drawCardY + cardH * 0.14);

    // Position
    ctx.font = `bold ${cardW * 0.08}px Arial`;
    ctx.fillText('ST', leftX, drawCardY + cardH * 0.2);

    // Decorative line
    ctx.strokeStyle = '#5a4a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftX - 25, drawCardY + cardH * 0.22);
    ctx.lineTo(leftX + 25, drawCardY + cardH * 0.22);
    ctx.stroke();

    // Name area
    const nameY = imgY + imgH + cardH * 0.04;

    ctx.fillStyle = 'rgba(45, 37, 16, 0.4)';
    ctx.beginPath();
    ctx.roundRect(drawCardX + cardW * 0.08, nameY - 28, cardW * 0.84, 45, 8);
    ctx.fill();

    ctx.fillStyle = '#2d2510';
    ctx.font = `bold ${cardW * 0.09}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('SKILL RATING', drawCardX + cardW / 2, nameY);

    // Stats with staggered animation
    const statsY = nameY + cardH * 0.065;
    const allStats = [
      { label: 'PAC', value: ratingStats.pac, col: 0 },
      { label: 'SHO', value: ratingStats.sho, col: 0 },
      { label: 'PAS', value: ratingStats.pas, col: 0 },
      { label: 'DRI', value: ratingStats.dri, col: 1 },
      { label: 'DEF', value: ratingStats.def, col: 1 },
      { label: 'PHY', value: ratingStats.phy, col: 1 },
    ];

    const statRowH = cardW * 0.072;
    const col1X = drawCardX + cardW * 0.28;
    const col2X = drawCardX + cardW * 0.72;

    allStats.forEach((stat, i) => {
      const delay = 400 + i * 80;
      const statProgress = Math.min(Math.max((elapsed - delay) / 300, 0), 1);
      const displayValue = Math.floor(stat.value * statProgress);

      const col = stat.col;
      const row = col === 0 ? i : i - 3;
      const x = col === 0 ? col1X : col2X;
      const y = statsY + row * statRowH;

      // Stat value
      ctx.fillStyle = '#2d2510';
      ctx.font = `bold ${cardW * 0.062}px Arial`;
      ctx.textAlign = 'right';
      ctx.globalAlpha = statProgress;
      ctx.fillText(displayValue, x - 8, y);

      // Stat label
      ctx.font = `${cardW * 0.046}px Arial`;
      ctx.fillStyle = '#4a3d1f';
      ctx.textAlign = 'left';
      ctx.fillText(stat.label, x + 8, y);
      ctx.globalAlpha = 1;
    });

    // Center divider
    ctx.strokeStyle = '#7a5f1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(drawCardX + cardW / 2, statsY - 15);
    ctx.lineTo(drawCardX + cardW / 2, statsY + statRowH * 2.4);
    ctx.stroke();

    // Bottom branding
    ctx.fillStyle = '#4a3d1f';
    ctx.font = `bold ${cardW * 0.038}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('⚽ FOOTSKILL AI ⚽', drawCardX + cardW / 2, drawCardY + cardH * 0.92);

    ctx.restore();
  }

  ctx.restore();
  scanAnimationId = requestAnimationFrame(draw);
}

// Process video frame
async function processFrame() {
  if (video.paused || video.ended) return;

  await pose.send({ image: video });
  animationId = requestAnimationFrame(processFrame);
}

// Handle video upload
videoUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  video.src = url;

  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    uploadSection.style.display = 'none';
    videoContainer.style.display = 'block';
    controls.style.display = 'flex';

    // Start continuous draw loop
    if (!scanAnimationId) {
      draw();
    }
  };

  if (!pose) {
    await initPose();
  }
});

// Play
playBtn.addEventListener('click', () => {
  video.play();
  processFrame();
});

// Pause
pauseBtn.addEventListener('click', () => {
  video.pause();
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
});

// Scan/Analyze
scanBtn.addEventListener('click', () => {
  isScanning = !isScanning;
  scanY = -80;
  scanBtn.textContent = isScanning ? '✓ Scanning' : '🔍 Analyze';
  scanBtn.classList.toggle('active', isScanning);
});

// FIFA Rating popup - capture frame and show card
ratingBtn.addEventListener('click', () => {
  if (ratingTimeout) clearTimeout(ratingTimeout);

  // Capture current video frame
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = video.videoWidth;
  tempCanvas.height = video.videoHeight;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(video, 0, 0);
  capturedFrame = tempCanvas;

  // Generate stats once
  ratingStats = {
    overall: Math.floor(Math.random() * 15) + 80,
    pac: Math.floor(Math.random() * 15) + 80,
    sho: Math.floor(Math.random() * 15) + 80,
    pas: Math.floor(Math.random() * 15) + 80,
    dri: Math.floor(Math.random() * 15) + 80,
    def: Math.floor(Math.random() * 20) + 50,
    phy: Math.floor(Math.random() * 15) + 75,
  };

  // Start animation
  ratingAnimStart = Date.now();

  // Create particles
  particles = [];
  for (let i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 4 + 1,
      speedX: (Math.random() - 0.5) * 2,
      speedY: (Math.random() - 0.5) * 2 - 1,
      opacity: Math.random() * 0.8 + 0.2,
      hue: Math.random() * 60 + 30, // gold hues
    });
  }

  showRating = true;
  ratingTimeout = setTimeout(() => {
    showRating = false;
  }, 3500);
});

// Reset
resetBtn.addEventListener('click', () => {
  video.pause();
  video.src = '';
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  if (scanAnimationId) {
    cancelAnimationFrame(scanAnimationId);
    scanAnimationId = null;
  }
  isScanning = false;
  scanY = -80;
  lastPoseResults = null;
  scanBtn.textContent = '🔍 Analyze';
  scanBtn.classList.remove('active');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  uploadSection.style.display = 'block';
  videoContainer.style.display = 'none';
  controls.style.display = 'none';
  videoUpload.value = '';
});

// Handle video end
video.addEventListener('ended', () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
});
