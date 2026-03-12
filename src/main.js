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
const resetBtn = document.getElementById('reset-btn');

let pose = null;
let animationId = null;
let scanAnimationId = null;
let isScanning = false;
let scanY = 0;
let lastPoseResults = null;

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
