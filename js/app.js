// ============================================
// Main App Controller — Virtual Holi 🎨
// ============================================

import { CameraManager } from './camera.js';
import { GestureDetector, GESTURES } from './gestures.js';
import { ParticleManager, HOLI_COLORS } from './particles.js';
import { ColorSplashMode } from './colorSplash.js';
import { BalloonBurstMode } from './balloonBurst.js';
import { HoliPartyMode } from './holiParty.js';
import { AuthManager } from './auth.js';

const MODES = {
    SPLASH: 'splash',
    BALLOON: 'balloon',
    PARTY: 'party',
};

class App {
    constructor() {
        // Canvas & Video
        this.canvas = document.getElementById('effectCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.video = document.getElementById('webcam');
        this.videoCanvas = document.getElementById('videoCanvas');
        this.videoCtx = this.videoCanvas.getContext('2d');

        // Systems
        this.camera = new CameraManager(this.video);
        this.gesture = new GestureDetector();
        this.particles = new ParticleManager();

        // Modes
        this.splashMode = new ColorSplashMode(this.particles);
        this.balloonMode = null; // Created after canvas resize
        this.partyMode = null;

        this.currentMode = MODES.SPLASH;
        this.isRunning = false;
        this.handDetected = false;
        this.currentGestureDisplay = GESTURES.NONE;

        // UI Elements
        this.gestureIcon = document.getElementById('gestureIcon');
        this.gestureLabel = document.getElementById('gestureLabel');
        this.scoreDisplay = document.getElementById('scoreValue');
        this.comboDisplay = document.getElementById('comboValue');
        this.modeButtons = document.querySelectorAll('.mode-btn');
        this.colorPalette = document.getElementById('colorPalette');

        // Party UI
        this.partyPanel = document.getElementById('partyPanel');
        this.roomCodeDisplay = document.getElementById('roomCodeDisplay');
        this.roomCodeInput = document.getElementById('roomCodeInput');
        this.createRoomBtn = document.getElementById('createRoomBtn');
        this.joinRoomBtn = document.getElementById('joinRoomBtn');
        this.leaveRoomBtn = document.getElementById('leaveRoomBtn');
        this.partyStatus = document.getElementById('partyStatus');
        this.myScoreDisplay = document.getElementById('myScore');
        this.friendScoreDisplay = document.getElementById('friendScore');
        this.partyScoreboard = document.getElementById('partyScoreboard');

        // Authentication Management
        this.authManager = new AuthManager((user) => {
            this.partyMode.playerName = user.displayName || user.phoneNumber;
            // Only start the game loop completely if logged in
            if (!this.isRunning) {
                this.isRunning = true;
                this._switchMode(MODES.SPLASH);
                this._buildColorPalette();
                this._gameLoop();
            }
        });

        // WebRTC & Audio/Video UI
        this.videoChatContainer = document.getElementById('videoChatContainer');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.remoteUserName = document.getElementById('remoteUserName');
        this.toggleMicBtn = document.getElementById('toggleMicBtn');

        // Approval UI
        this.joinRequestOverlay = document.getElementById('joinRequestOverlay');
        this.requestName = document.getElementById('requestName');
        this.acceptRequestBtn = document.getElementById('acceptRequestBtn');
        this.denyRequestBtn = document.getElementById('denyRequestBtn');
        this.waitingApprovalOverlay = document.getElementById('waitingApprovalOverlay');

        // Tutorial
        this.tutorialOverlay = document.getElementById('tutorialOverlay');
        this.tutorialStep = 0;
        this.totalTutorialSteps = 5;

        this._setupEventListeners();
    }

    _setupEventListeners() {
        // Mode switching buttons
        this.modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this._switchMode(mode);
            });
        });

        // Party mode buttons
        this.createRoomBtn?.addEventListener('click', () => this._createRoom());
        this.joinRoomBtn?.addEventListener('click', () => this._joinRoom());
        this.leaveRoomBtn?.addEventListener('click', () => this._leaveRoom());

        // WebRTC & Approval
        this.acceptRequestBtn?.addEventListener('click', () => {
            this.partyMode?.acceptJoinRequest();
            this.joinRequestOverlay.classList.add('hidden');
        });
        this.denyRequestBtn?.addEventListener('click', () => {
            this.partyMode?.denyJoinRequest();
            this.joinRequestOverlay.classList.add('hidden');
        });
        this.toggleMicBtn?.addEventListener('click', () => {
            if (this.partyMode) {
                const isMuted = this.partyMode.toggleMic();
                if (isMuted) {
                    this.toggleMicBtn.classList.add('muted');
                    this.toggleMicBtn.innerHTML = '<span class="icon">🔇</span>';
                } else {
                    this.toggleMicBtn.classList.remove('muted');
                    this.toggleMicBtn.innerHTML = '<span class="icon">🎙️</span>';
                }
            }
        });

        // Color palette clicks (Splash mode)
        this.colorPalette?.addEventListener('click', (e) => {
            const swatch = e.target.closest('.color-swatch');
            if (swatch) {
                const idx = parseInt(swatch.dataset.index);
                if (this.splashMode) this.splashMode.currentColorIndex = idx;
                this._updateColorPalette();
            }
        });

        // Window resize
        window.addEventListener('resize', () => this._resize());

        // Help button (re-open tutorial)
        document.getElementById('helpBtn')?.addEventListener('click', () => this._showTutorial());

        // Tutorial buttons
        document.getElementById('tutorialNext')?.addEventListener('click', () => this._tutorialNext());
        document.getElementById('tutorialPrev')?.addEventListener('click', () => this._tutorialPrev());
        document.getElementById('tutorialStart')?.addEventListener('click', () => this._closeTutorial());
        document.getElementById('tutorialSkip')?.addEventListener('click', () => this._closeTutorial());

        // Step dot clicks
        document.querySelectorAll('.step-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const step = parseInt(dot.dataset.step);
                this._goToTutorialStep(step);
            });
        });

        // Gesture-based mode switching
        this.gesture.onGestureTransition('ANY', GESTURES.PEACE, () => {
            // Cycle modes: splash -> balloon -> party -> splash
            const modes = [MODES.SPLASH, MODES.BALLOON, MODES.PARTY];
            const idx = modes.indexOf(this.currentMode);
            const nextMode = modes[(idx + 1) % modes.length];
            this._switchMode(nextMode);
        });
    }

    _resize() {
        const container = document.getElementById('cameraContainer');
        const w = container.clientWidth;
        const h = container.clientHeight;

        // Cap resolution to avoid extreme lag on mobile and high-DPI displays
        const maxResolution = 800;
        const scale = (w > 0 && h > 0) ? Math.min(1, maxResolution / Math.max(w, h)) : 1;

        this.canvas.width = Math.floor(w * scale);
        this.canvas.height = Math.floor(h * scale);
        this.videoCanvas.width = Math.floor(w * scale);
        this.videoCanvas.height = Math.floor(h * scale);

        if (this.balloonMode) this.balloonMode.resize(this.canvas.width, this.canvas.height);
        if (this.partyMode) this.partyMode.resize(this.canvas.width, this.canvas.height);
    }

    async start() {
        // Start camera
        try {
            await this.camera.init((results) => this._onHandResults(results));

            // FIRST: Show the app so the container has real dimensions
            document.getElementById('loadingScreen').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');

            // Wait for the browser to recalculate layout after showing the app
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

            // NOW resize canvases (after layout is calculated)
            this._resize();
            console.log('Canvas dimensions:', this.canvas.width, 'x', this.canvas.height);
            console.log('Video readyState:', this.video.readyState);

            // Initialize modes that need canvas dimensions
            this.balloonMode = new BalloonBurstMode(this.particles, this.canvas.width, this.canvas.height);
            this.partyMode = new HoliPartyMode(this.particles, this.canvas.width, this.canvas.height);

            // Setup gesture callbacks for all modes
            this.splashMode.setupGestures(this.gesture);
            this.balloonMode.setupGestures(this.gesture);
            this.partyMode.setupGestures(this.gesture);

            // Party mode callbacks
            this.partyMode.onRoomCreated = (code) => {
                this.roomCodeDisplay.textContent = code;
                this.roomCodeDisplay.parentElement.classList.remove('hidden');
                this.partyStatus.textContent = 'Waiting for friend...';
                this.partyStatus.className = 'party-status waiting';
                this.createRoomBtn.classList.add('hidden');
                this.joinRoomBtn.classList.add('hidden');
                this.roomCodeInput.classList.add('hidden');
                this.leaveRoomBtn.classList.remove('hidden');
            };

            this.partyMode.onPlayerJoined = (name) => {
                this.partyStatus.textContent = `🎉 ${name} joined! Let's play Holi!`;
                this.partyStatus.className = 'party-status connected';
                this.partyScoreboard.classList.remove('hidden');
            };

            this.partyMode.onOpponentLeft = () => {
                this.partyStatus.textContent = '😢 Friend disconnected';
                this.partyStatus.className = 'party-status waiting';
                this.videoChatContainer.classList.add('hidden');
                if (this.remoteVideo.srcObject) {
                    this.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
                    this.remoteVideo.srcObject = null;
                }
            };

            this.partyMode.onScoreUpdate = (my, opponent) => {
                if (this.myScoreDisplay) this.myScoreDisplay.textContent = my;
                if (this.friendScoreDisplay) this.friendScoreDisplay.textContent = opponent;
            };

            // WebRTC & Approval Callbacks
            this.partyMode.onJoinRequest = (guestName) => {
                this.requestName.textContent = guestName;
                this.joinRequestOverlay.classList.remove('hidden');
            };

            this.partyMode.onWaitingForHost = () => {
                this.waitingApprovalOverlay.classList.remove('hidden');
            };

            this.partyMode.onHostRejected = () => {
                this.waitingApprovalOverlay.classList.add('hidden');
                this.partyStatus.textContent = '❌ Request denied by host.';
                this.partyStatus.className = 'party-status waiting';
                this._leaveRoom();
            };

            this.partyMode.onRemoteStreamReady = (stream) => {
                this.remoteUserName.textContent = this.partyMode.opponentName || 'Friend';
                this.videoChatContainer.classList.remove('hidden');
                setTimeout(() => {
                    this.remoteVideo.srcObject = stream;
                }, 100);
            };

            // Game loop will start ONLY after AuthManager completes login via its callback
            console.log('🎨 Virtual Holi core initialized. Waiting for Auth...');

            // Show tutorial for first-time players
            if (!localStorage.getItem('holi_tutorial_done')) {
                this._showTutorial();
            }
        } catch (err) {
            console.error('Camera init failed:', err);
            document.getElementById('loadingMessage').textContent =
                '❌ Camera access denied. Please allow camera and refresh.';
        }
    }

    _onHandResults(results) {
        // Only process hand landmarks here — video is drawn in _gameLoop
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            this.handDetected = true;
            // Use first hand (mirrored)
            const landmarks = results.multiHandLandmarks[0].map(lm => ({
                x: 1 - lm.x, // Mirror x
                y: lm.y,
                z: lm.z,
            }));
            this.gesture.update(landmarks, this.canvas.width, this.canvas.height);
            this.currentGestureDisplay = this.gesture.getGesture();
        } else {
            this.handDetected = false;
            this.gesture.update(null); // Force transition to NONE
            this.currentGestureDisplay = GESTURES.NONE;
        }
    }

    _gameLoop() {
        if (!this.isRunning) return;

        try {
            // Auto-fix canvas dimensions if they're still 0
            if (this.canvas.width === 0 || this.canvas.height === 0) {
                this._resize();
            }

            // Draw video feed every frame (mirrored) — always try, no readyState check
            try {
                this.videoCtx.save();
                this.videoCtx.translate(this.videoCanvas.width, 0);
                this.videoCtx.scale(-1, 1);
                this.videoCtx.drawImage(this.video, 0, 0, this.videoCanvas.width, this.videoCanvas.height);
                this.videoCtx.restore();
            } catch (e) {
                // Video not ready yet, will try next frame
            }

            const gesture = this.gesture.getGesture();
            const position = this.gesture.getHandPosition();

            // Update active mode
            switch (this.currentMode) {
                case MODES.SPLASH:
                    this.splashMode.update(gesture, position);
                    break;
                case MODES.BALLOON:
                    if (this.balloonMode) this.balloonMode.update(gesture, position);
                    break;
                case MODES.PARTY:
                    if (this.partyMode) this.partyMode.update(gesture, position);
                    break;
            }

            // Update particles
            this.particles.update();

            // Clear effect canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Draw particles (on effect canvas)
            this.particles.draw(this.ctx);

            // Draw mode-specific elements
            switch (this.currentMode) {
                case MODES.BALLOON:
                    if (this.balloonMode) this.balloonMode.draw(this.ctx);
                    break;
                case MODES.PARTY:
                    if (this.partyMode) this.partyMode.draw(this.ctx);
                    break;
            }

            // Draw hand indicator
            if (this.handDetected) {
                this._drawHandIndicator(this.ctx, position, gesture);
            }

            // Update UI
            this._updateGestureUI();
            this._updateScoreUI();
        } catch (err) {
            console.error('Game loop error:', err);
        }

        requestAnimationFrame(() => this._gameLoop());
    }

    _drawHandIndicator(ctx, pos, gesture) {
        ctx.save();

        const color = gesture === GESTURES.OPEN_PALM ? '#FFD700' :
            gesture === GESTURES.FIST ? '#FF1493' :
                gesture === GESTURES.PINCH ? '#00E676' :
                    gesture === GESTURES.PEACE ? '#7C4DFF' :
                        '#ffffff';

        const time = Date.now() * 0.005;
        const pulseSize = 1 + Math.sin(time) * 0.15;
        const baseRadius = 35 * pulseSize;

        // Outer glow aura
        ctx.globalAlpha = 0.15;
        const aura = ctx.createRadialGradient(pos.x, pos.y, baseRadius, pos.x, pos.y, baseRadius * 3);
        aura.addColorStop(0, color);
        aura.addColorStop(1, 'transparent');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, baseRadius * 3, 0, Math.PI * 2);
        ctx.fill();

        // Outer ring (rotating dashes)
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = -time * 50;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, baseRadius + 10, 0, Math.PI * 2);
        ctx.stroke();

        // Inner solid ring
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, baseRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Center dot
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _switchMode(mode) {
        // Deactivate all
        this.splashMode.deactivate();
        if (this.balloonMode) this.balloonMode.deactivate();
        if (this.partyMode) this.partyMode.deactivate();

        this.currentMode = mode;

        // Update UI buttons
        this.modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Show/hide mode-specific panels
        const splashUI = document.getElementById('splashUI');
        const balloonUI = document.getElementById('balloonUI');
        const partyUI = document.getElementById('partyUI');

        splashUI?.classList.toggle('hidden', mode !== MODES.SPLASH);
        balloonUI?.classList.toggle('hidden', mode !== MODES.BALLOON);
        partyUI?.classList.toggle('hidden', mode !== MODES.PARTY);

        // Activate selected mode
        switch (mode) {
            case MODES.SPLASH:
                this.splashMode.activate();
                break;
            case MODES.BALLOON:
                this.balloonMode.activate();
                break;
            case MODES.PARTY:
                this.partyMode.activate();
                break;
        }

        // Clear particles on mode switch
        this.particles.clear();
    }

    _buildColorPalette() {
        if (!this.colorPalette) return;
        this.colorPalette.innerHTML = '';
        HOLI_COLORS.forEach((color, i) => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch' + (i === 0 ? ' active' : '');
            swatch.style.backgroundColor = color;
            swatch.dataset.index = i;
            this.colorPalette.appendChild(swatch);
        });
    }

    _updateColorPalette() {
        const swatches = this.colorPalette?.querySelectorAll('.color-swatch');
        if (!swatches) return;
        swatches.forEach((s, i) => {
            s.classList.toggle('active', i === this.splashMode.currentColorIndex);
        });
    }

    _updateGestureUI() {
        const icons = {
            [GESTURES.NONE]: '🤚',
            [GESTURES.OPEN_PALM]: '✋',
            [GESTURES.FIST]: '✊',
            [GESTURES.PINCH]: '🤏',
            [GESTURES.POINT]: '☝️',
            [GESTURES.PEACE]: '✌️',
        };
        if (this.gestureIcon) this.gestureIcon.textContent = icons[this.currentGestureDisplay] || '🤚';
        if (this.gestureLabel) this.gestureLabel.textContent = this.handDetected
            ? this.currentGestureDisplay.replace('_', ' ').toUpperCase()
            : 'NO HAND';
    }

    _updateScoreUI() {
        if (this.currentMode === MODES.BALLOON && this.balloonMode) {
            if (this.scoreDisplay) this.scoreDisplay.textContent = this.balloonMode.score;
            if (this.comboDisplay) {
                this.comboDisplay.textContent = this.balloonMode.combo > 1 ? `x${this.balloonMode.combo}` : '';
            }
        }
    }

    async _createRoom() {
        try {
            const name = prompt('Enter your name:') || 'Player 1';
            await this.partyMode.createRoom(name);
        } catch (err) {
            alert('Failed to create room: ' + err.message);
        }
    }

    async _joinRoom() {
        try {
            const code = this.roomCodeInput?.value?.trim();
            if (!code || code.length !== 6) {
                alert('Please enter a valid 6-character room code!');
                return;
            }
            const name = prompt('Enter your name:') || 'Player 2';
            await this.partyMode.joinRoom(code, name);
            this.roomCodeInput.classList.add('hidden');
            this.createRoomBtn.classList.add('hidden');
            this.joinRoomBtn.classList.add('hidden');
            this.leaveRoomBtn.classList.remove('hidden');
            this.partyStatus.textContent = '🎉 Connected! Let\'s play!';
            this.partyStatus.className = 'party-status connected';
            this.partyScoreboard.classList.remove('hidden');
        } catch (err) {
            alert(err.message);
        }
    }

    async _leaveRoom() {
        await this.partyMode.leaveRoom();
        this.roomCodeDisplay.parentElement.classList.add('hidden');
        this.partyScoreboard.classList.add('hidden');
        this.leaveRoomBtn.classList.add('hidden');
        this.createRoomBtn.classList.remove('hidden');
        this.joinRoomBtn.classList.remove('hidden');
        this.roomCodeInput.classList.remove('hidden');
        this.partyStatus.textContent = 'Create or join a room to play!';
        this.partyStatus.className = 'party-status';
    }

    // ---- Tutorial Methods ----
    _showTutorial() {
        this.tutorialStep = 0;
        this._updateTutorialUI();
        this.tutorialOverlay?.classList.remove('hidden');
    }

    _closeTutorial() {
        this.tutorialOverlay?.classList.add('hidden');
        localStorage.setItem('holi_tutorial_done', '1');
    }

    _tutorialNext() {
        if (this.tutorialStep < this.totalTutorialSteps - 1) {
            this.tutorialStep++;
            this._updateTutorialUI();
        }
    }

    _tutorialPrev() {
        if (this.tutorialStep > 0) {
            this.tutorialStep--;
            this._updateTutorialUI();
        }
    }

    _goToTutorialStep(step) {
        this.tutorialStep = Math.max(0, Math.min(step, this.totalTutorialSteps - 1));
        this._updateTutorialUI();
    }

    _updateTutorialUI() {
        // Update slides
        document.querySelectorAll('.tutorial-slide').forEach(slide => {
            const slideIdx = parseInt(slide.dataset.slide);
            slide.classList.toggle('active', slideIdx === this.tutorialStep);
        });

        // Update dots
        document.querySelectorAll('.step-dot').forEach(dot => {
            const dotIdx = parseInt(dot.dataset.step);
            dot.classList.toggle('active', dotIdx === this.tutorialStep);
            dot.classList.toggle('done', dotIdx < this.tutorialStep);
        });

        // Update nav buttons
        const prevBtn = document.getElementById('tutorialPrev');
        const nextBtn = document.getElementById('tutorialNext');
        const startBtn = document.getElementById('tutorialStart');

        if (prevBtn) prevBtn.disabled = this.tutorialStep === 0;

        const isLast = this.tutorialStep === this.totalTutorialSteps - 1;
        if (nextBtn) nextBtn.classList.toggle('hidden', isLast);
        if (startBtn) startBtn.classList.toggle('hidden', !isLast);
    }
}

// Boot the app
window.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.start();
});
