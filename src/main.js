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
    // Full dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Card dimensions - FIFA shield shape
    const cardW = Math.min(canvas.width * 0.85, 500);
    const cardH = cardW * 1.45;
    const cardX = (canvas.width - cardW) / 2;
    const cardY = (canvas.height - cardH) / 2;

    // Draw shield shape
    ctx.beginPath();
    ctx.moveTo(cardX + 20, cardY);
    ctx.lineTo(cardX + cardW - 20, cardY);
    ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + 20);
    ctx.lineTo(cardX + cardW, cardY + cardH * 0.75);
    ctx.quadraticCurveTo(cardX + cardW, cardY + cardH * 0.85, cardX + cardW * 0.85, cardY + cardH * 0.92);
    ctx.lineTo(cardX + cardW / 2, cardY + cardH);
    ctx.lineTo(cardX + cardW * 0.15, cardY + cardH * 0.92);
    ctx.quadraticCurveTo(cardX, cardY + cardH * 0.85, cardX, cardY + cardH * 0.75);
    ctx.lineTo(cardX, cardY + 20);
    ctx.quadraticCurveTo(cardX, cardY, cardX + 20, cardY);
    ctx.closePath();

    // Gold gradient fill
    const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    cardGrad.addColorStop(0, '#d4a84b');
    cardGrad.addColorStop(0.3, '#f5e6a3');
    cardGrad.addColorStop(0.5, '#d4a84b');
    cardGrad.addColorStop(0.7, '#f5e6a3');
    cardGrad.addColorStop(1, '#d4a84b');
    ctx.fillStyle = cardGrad;
    ctx.fill();

    // Card border
    ctx.strokeStyle = '#8b7335';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Diagonal shine lines
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    for (let i = -cardH; i < cardW + cardH; i += 25) {
      ctx.beginPath();
      ctx.moveTo(cardX + i, cardY);
      ctx.lineTo(cardX + i - cardH, cardY + cardH);
      ctx.stroke();
    }
    ctx.restore();

    // Rating and Position - left side
    const leftX = cardX + cardW * 0.12;

    // Overall rating
    ctx.fillStyle = '#2d2d2d';
    ctx.font = `bold ${cardW * 0.18}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(ratingStats.overall, leftX, cardY + cardH * 0.12);

    // Position
    ctx.font = `bold ${cardW * 0.07}px Arial`;
    ctx.fillText('ST', leftX, cardY + cardH * 0.17);

    // Player image - center right
    const imgW = cardW * 0.55;
    const imgH = cardW * 0.55;
    const imgX = cardX + cardW * 0.38;
    const imgY = cardY + cardH * 0.06;

    // Crop calculation
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

    // Image with golden border
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 8);
    ctx.clip();
    ctx.drawImage(capturedFrame, sx, sy, sw, sh, imgX, imgY, imgW, imgH);
    ctx.restore();

    ctx.strokeStyle = '#8b7335';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 8);
    ctx.stroke();

    // Player name
    const nameY = imgY + imgH + cardH * 0.06;
    ctx.fillStyle = '#2d2d2d';
    ctx.font = `bold ${cardW * 0.09}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('PLAYER', cardX + cardW / 2, nameY);

    // Divider line
    ctx.strokeStyle = '#8b7335';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cardX + cardW * 0.15, nameY + 15);
    ctx.lineTo(cardX + cardW * 0.85, nameY + 15);
    ctx.stroke();

    // Stats - 2 columns
    const statsY = nameY + 35;
    const statsLeft = [
      { label: 'PAC', value: ratingStats.pac },
      { label: 'SHO', value: ratingStats.sho },
      { label: 'PAS', value: ratingStats.pas },
    ];
    const statsRight = [
      { label: 'DRI', value: ratingStats.dri },
      { label: 'DEF', value: ratingStats.def },
      { label: 'PHY', value: ratingStats.phy },
    ];

    const statRowH = cardW * 0.085;
    const col1X = cardX + cardW * 0.28;
    const col2X = cardX + cardW * 0.72;

    ctx.font = `bold ${cardW * 0.065}px Arial`;

    statsLeft.forEach((stat, i) => {
      const y = statsY + i * statRowH;
      ctx.fillStyle = '#2d2d2d';
      ctx.textAlign = 'right';
      ctx.fillText(stat.value, col1X - 8, y);
      ctx.textAlign = 'left';
      ctx.font = `${cardW * 0.05}px Arial`;
      ctx.fillText(stat.label, col1X + 8, y);
      ctx.font = `bold ${cardW * 0.065}px Arial`;
    });

    statsRight.forEach((stat, i) => {
      const y = statsY + i * statRowH;
      ctx.fillStyle = '#2d2d2d';
      ctx.textAlign = 'right';
      ctx.fillText(stat.value, col2X - 8, y);
      ctx.textAlign = 'left';
      ctx.font = `${cardW * 0.05}px Arial`;
      ctx.fillText(stat.label, col2X + 8, y);
      ctx.font = `bold ${cardW * 0.065}px Arial`;
    });

    // Center divider between stat columns
    ctx.strokeStyle = '#8b7335';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + cardW / 2, statsY - 15);
    ctx.lineTo(cardX + cardW / 2, statsY + statRowH * 2.5);
    ctx.stroke();

    // FootSkill AI logo at bottom
    ctx.fillStyle = '#5a4a2a';
    ctx.font = `bold ${cardW * 0.04}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('FOOTSKILL AI', cardX + cardW / 2, cardY + cardH * 0.94);
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

  showRating = true;
  ratingTimeout = setTimeout(() => {
    showRating = false;
  }, 2000);
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
