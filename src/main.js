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

    // Large card - nearly full screen
    const cardW = canvas.width * 0.9;
    const cardH = canvas.height * 0.9;
    const cardX = (canvas.width - cardW) / 2;
    const cardY = (canvas.height - cardH) / 2;

    // Card background - premium gold gradient
    const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    cardGrad.addColorStop(0, '#1a1a1a');
    cardGrad.addColorStop(0.02, '#c9a227');
    cardGrad.addColorStop(0.15, '#f4d03f');
    cardGrad.addColorStop(0.5, '#c9a227');
    cardGrad.addColorStop(0.85, '#f4d03f');
    cardGrad.addColorStop(0.98, '#c9a227');
    cardGrad.addColorStop(1, '#1a1a1a');

    ctx.fillStyle = cardGrad;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 20);
    ctx.fill();

    // Outer glow
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#fff8dc';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Large player image - main focus
    const imgW = cardW * 0.75;
    const imgH = cardH * 0.55;
    const imgX = cardX + (cardW - imgW) / 2;
    const imgY = cardY + 30;

    // Calculate crop to fit without stretch
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

    // Image with rounded corners
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 15);
    ctx.clip();
    ctx.drawImage(capturedFrame, sx, sy, sw, sh, imgX, imgY, imgW, imgH);
    ctx.restore();

    // Image border
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgW, imgH, 15);
    ctx.stroke();

    // Big rating circle - top left of image
    const ratingSize = cardW * 0.18;
    const ratingX = imgX - ratingSize * 0.3;
    const ratingY = imgY - ratingSize * 0.3;

    // Rating background
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(ratingX + ratingSize/2, ratingY + ratingSize/2, ratingSize/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Rating number
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${ratingSize * 0.55}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ratingStats.overall, ratingX + ratingSize/2, ratingY + ratingSize/2);
    ctx.textBaseline = 'alphabetic';

    // Position badge - top right
    const posX = imgX + imgW - 60;
    const posY = imgY + 25;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.roundRect(posX, posY, 50, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${cardW * 0.04}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('ST', posX + 25, posY + 22);

    // Stats bar below image
    const statsY = imgY + imgH + 30;
    const statsH = cardH * 0.18;

    // Stats background
    ctx.fillStyle = 'rgba(26, 26, 26, 0.9)';
    ctx.beginPath();
    ctx.roundRect(cardX + 20, statsY, cardW - 40, statsH, 12);
    ctx.fill();

    // Stats in a row
    const stats = [
      { label: 'PAC', value: ratingStats.pac },
      { label: 'SHO', value: ratingStats.sho },
      { label: 'PAS', value: ratingStats.pas },
      { label: 'DRI', value: ratingStats.dri },
      { label: 'DEF', value: ratingStats.def },
      { label: 'PHY', value: ratingStats.phy },
    ];

    const statWidth = (cardW - 60) / 6;
    stats.forEach((stat, i) => {
      const x = cardX + 30 + statWidth * i + statWidth / 2;
      const y = statsY + statsH / 2;

      // Value
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${cardW * 0.055}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(stat.value, x, y - 5);

      // Label
      ctx.fillStyle = '#888';
      ctx.font = `${cardW * 0.03}px Arial`;
      ctx.fillText(stat.label, x, y + 22);
    });

    // Bottom branding
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `bold ${cardW * 0.045}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('FOOTSKILL AI', cardX + cardW / 2, cardY + cardH - 25);
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
