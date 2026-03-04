// ============================================
// Holi Party Mode (Multiplayer)
// ============================================

import { db, ref, set, push, onChildAdded, onValue, remove, update, get } from './firebase-config.js';
import { HOLI_COLORS, randomHoliColor, hexToRgb } from './particles.js';
import { GESTURES } from './gestures.js';

// Flying balloon animation for incoming water balloons
class FlyingBalloon {
    constructor(fromEdge, targetX, targetY, color, canvasWidth, canvasHeight) {
        this.color = color;
        this.rgb = hexToRgb(color);
        this.targetX = targetX;
        this.targetY = targetY;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.size = 30;
        this.progress = 0;
        this.speed = 0.02;
        this.wobble = 0;
        this.burst = false;

        // Start from random edge
        const edges = ['left', 'right', 'top'];
        const edge = fromEdge || edges[Math.floor(Math.random() * edges.length)];
        switch (edge) {
            case 'left': this.x = -40; this.y = Math.random() * canvasHeight * 0.5; break;
            case 'right': this.x = canvasWidth + 40; this.y = Math.random() * canvasHeight * 0.5; break;
            case 'top': this.x = Math.random() * canvasWidth; this.y = -40; break;
        }
        this.startX = this.x;
        this.startY = this.y;
    }

    update() {
        this.progress += this.speed;
        this.wobble += 0.15;

        // Ease-in trajectory
        const t = this.progress;
        const eased = t * t * (3 - 2 * t); // smoothstep
        this.x = this.startX + (this.targetX - this.startX) * eased + Math.sin(this.wobble) * 8;
        this.y = this.startY + (this.targetY - this.startY) * eased + Math.cos(this.wobble * 0.7) * 5;

        if (this.progress >= 1) {
            this.burst = true;
        }

        return !this.burst;
    }

    draw(ctx) {
        ctx.save();

        // Balloon body with water-filled look
        const gradient = ctx.createRadialGradient(
            this.x - this.size * 0.15, this.y - this.size * 0.15, this.size * 0.1,
            this.x, this.y, this.size
        );
        gradient.addColorStop(0, `rgba(${Math.min(this.rgb.r + 80, 255)}, ${Math.min(this.rgb.g + 80, 255)}, ${Math.min(this.rgb.b + 80, 255)}, 0.6)`);
        gradient.addColorStop(0.5, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, 0.7)`);
        gradient.addColorStop(1, `rgba(${Math.max(this.rgb.r - 30, 0)}, ${Math.max(this.rgb.g - 30, 0)}, ${Math.max(this.rgb.b - 30, 0)}, 0.8)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        // Water balloon shape (slightly bulgy at bottom)
        ctx.ellipse(this.x, this.y, this.size * 0.7, this.size * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        // Water shimmer
        ctx.fillStyle = `rgba(255, 255, 255, 0.35)`;
        ctx.beginPath();
        ctx.ellipse(this.x - this.size * 0.2, this.y - this.size * 0.25, this.size * 0.12, this.size * 0.2, -0.4, 0, Math.PI * 2);
        ctx.fill();

        // Knot
        ctx.fillStyle = `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, 1)`;
        ctx.beginPath();
        ctx.moveTo(this.x - 3, this.y - this.size * 0.9);
        ctx.lineTo(this.x + 3, this.y - this.size * 0.9);
        ctx.lineTo(this.x, this.y - this.size * 0.9 - 5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

class HoliPartyMode {
    constructor(particleManager, canvasWidth, canvasHeight) {
        this.particles = particleManager;
        this.isActive = false;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        // Room state
        this.roomCode = null;
        this.playerId = null;
        this.playerName = 'Player';
        this.isHost = false;
        this.opponentOnline = false;
        this.opponentName = 'Waiting...';

        // Scores
        this.myScore = 0;
        this.opponentScore = 0;

        // Color index for powder throws
        this.currentColorIndex = 0;

        // Flying balloons (incoming from opponent)
        this.flyingBalloons = [];

        // Firebase listeners
        this._listeners = [];

        // WebRTC properties
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        this.webrtcUnsubs = [];

        // Admin Approval State
        this.pendingGuestId = null;
        this.pendingGuestName = null;

        // Callbacks
        this.onRoomCreated = null;
        this.onPlayerJoined = null;
        this.onOpponentLeft = null;
        this.onScoreUpdate = null;
        this.onJoinRequest = null;
        this.onWaitingForHost = null;
        this.onHostRejected = null;
        this.onRemoteStreamReady = null;
    }

    get currentColor() {
        return HOLI_COLORS[this.currentColorIndex];
    }

    nextColor() {
        this.currentColorIndex = (this.currentColorIndex + 1) % HOLI_COLORS.length;
    }

    _generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    async createRoom(playerName = 'Player 1') {
        this.roomCode = this._generateRoomCode();
        this.playerId = 'player1';
        this.playerName = playerName;
        this.isHost = true;

        const roomRef = ref(db, `rooms/${this.roomCode}`);

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection timeout! Is the Firebase databaseURL correct in firebase-config.js?")), 5000)
        );

        await Promise.race([
            set(roomRef, {
                players: {
                    player1: { name: playerName, score: 0, online: true }
                },
                status: 'waiting',
                createdAt: Date.now()
            }),
            timeoutPromise
        ]);

        await this._setupLocalStream();

        this._listenForJoinRequests();
        this._listenForOpponent();
        this._listenForThrows();

        if (this.onRoomCreated) this.onRoomCreated(this.roomCode);
        return this.roomCode;
    }

    async joinRoom(roomCode, playerName = 'Player 2') {
        this.roomCode = roomCode.toUpperCase();
        this.playerId = 'player2';
        this.playerName = playerName;
        this.isHost = false;

        // Check if room exists
        const roomRef = ref(db, `rooms/${this.roomCode}`);

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection timeout! Is the Firebase databaseURL correct in firebase-config.js?")), 5000)
        );

        const snapshot = await Promise.race([get(roomRef), timeoutPromise]);
        if (!snapshot.exists()) {
            throw new Error('Room not found!');
        }

        const data = snapshot.val();
        if (data.players?.player2) {
            throw new Error('Room is full!');
        }

        // Get host name
        if (data.players?.player1) {
            this.opponentName = data.players.player1.name || 'Player 1';
            this.opponentOnline = true;
        }

        await this._setupLocalStream();

        // Write join request for Admin Approval
        const requestRef = ref(db, `rooms/${this.roomCode}/join_requests/${this.playerId}`);
        await set(requestRef, {
            name: playerName,
            status: 'pending'
        });

        if (this.onWaitingForHost) this.onWaitingForHost();

        // Listen for Host Approval
        return new Promise((resolve, reject) => {
            const unsub = onValue(requestRef, async (reqSnap) => {
                if (!reqSnap.exists()) return;
                const reqStatus = reqSnap.val().status;

                if (reqStatus === 'accepted') {
                    unsub();
                    await this._setupWebRTC();
                    this._listenForOpponent();
                    this._listenForThrows();
                    this._listenForOffer();
                    if (this.onPlayerJoined) this.onPlayerJoined(this.opponentName);
                    resolve();
                } else if (reqStatus === 'denied') {
                    unsub();
                    if (this.onHostRejected) this.onHostRejected();
                    reject(new Error("Host denied the request"));
                }
            });
            this._listeners.push(unsub);
        });
    }

    _listenForOpponent() {
        const opponentId = this.playerId === 'player1' ? 'player2' : 'player1';
        const opponentRef = ref(db, `rooms/${this.roomCode}/players/${opponentId}`);

        const unsub = onValue(opponentRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                this.opponentName = data.name || opponentId;
                this.opponentOnline = data.online;
                this.opponentScore = data.score || 0;
                if (this.onPlayerJoined) this.onPlayerJoined(this.opponentName);
                if (this.onScoreUpdate) this.onScoreUpdate(this.myScore, this.opponentScore);
            } else {
                this.opponentOnline = false;
                if (this.onOpponentLeft) this.onOpponentLeft();
            }
        });
        this._listeners.push(unsub);
    }

    _listenForThrows() {
        const throwsRef = ref(db, `rooms/${this.roomCode}/throws`);

        const unsub = onChildAdded(throwsRef, (snapshot) => {
            const data = snapshot.val();
            if (data.from === this.playerId) return; // Ignore own throws

            if (data.type === 'powder') {
                // Opponent threw color powder — show explosion on our screen
                const x = data.x * this.canvasWidth;
                const y = data.y * this.canvasHeight;
                this.particles.emitPowderBurst(x, y, data.color, 40, 0, 0, data.force || 0.8);
            } else if (data.type === 'balloon') {
                // Opponent threw water balloon — animate it flying in
                const targetX = data.x * this.canvasWidth;
                const targetY = data.y * this.canvasHeight;
                this.flyingBalloons.push(
                    new FlyingBalloon(null, targetX, targetY, data.color, this.canvasWidth, this.canvasHeight)
                );
            }

            // Remove processed throw
            remove(snapshot.ref);
        });
        this._listeners.push(unsub);
    }

    async _sendThrow(type, position, color, force = 0.5) {
        if (!this.roomCode || !this.playerId) return;

        const throwsRef = ref(db, `rooms/${this.roomCode}/throws`);
        await push(throwsRef, {
            from: this.playerId,
            type: type, // 'powder' or 'balloon'
            x: position.x / this.canvasWidth,
            y: position.y / this.canvasHeight,
            color: color,
            force: force,
            timestamp: Date.now()
        });

        // Update score
        this.myScore++;
        const playerRef = ref(db, `rooms/${this.roomCode}/players/${this.playerId}`);
        await update(playerRef, { score: this.myScore });
        if (this.onScoreUpdate) this.onScoreUpdate(this.myScore, this.opponentScore);
    }

    activate() {
        this.isActive = true;
    }

    deactivate() {
        this.isActive = false;
    }

    resize(w, h) {
        this.canvasWidth = w;
        this.canvasHeight = h;
    }

    setupGestures(gestureDetector) {
        // Palm → Fist = Throw color powder at friend
        gestureDetector.onGestureTransition(GESTURES.OPEN_PALM, GESTURES.FIST, (data) => {
            if (!this.isActive || !this.roomCode) return;
            const color = this.currentColor;
            // Show local effect too
            this.particles.emitPowderBurst(data.position.x, data.position.y, color, 20, 0, 0, 0.5);
            this._sendThrow('powder', data.position, color, 0.8);
            this.nextColor();
        });

        // Pinch → Open Palm = Throw water balloon at friend
        gestureDetector.onGestureTransition(GESTURES.PINCH, GESTURES.OPEN_PALM, (data) => {
            if (!this.isActive || !this.roomCode) return;
            const color = randomHoliColor();
            this._sendThrow('balloon', data.position, color, 1);
        });
    }

    update(gesture, position) {
        if (!this.isActive) return;

        // Charge effect for powder
        if (gesture === GESTURES.OPEN_PALM && position) {
            this.particles.emitCharge(position.x, position.y, this.currentColor);
        }

        // Update flying balloons (incoming from opponent)
        this.flyingBalloons = this.flyingBalloons.filter(b => {
            const alive = b.update();
            if (b.burst) {
                // SPLAT! Water burst at impact point
                this.particles.emitWaterBurst(b.targetX, b.targetY, b.color, this.canvasHeight, 60);
            }
            return alive;
        });
    }

    draw(ctx) {
        if (!this.isActive) return;
        // Draw flying balloons
        for (const b of this.flyingBalloons) {
            b.draw(ctx);
        }
    }

    // ===================================
    // Admin Approval & WebRTC Networking
    // ===================================

    _listenForJoinRequests() {
        const requestsRef = ref(db, `rooms/${this.roomCode}/join_requests`);
        const unsub = onChildAdded(requestsRef, (snapshot) => {
            const val = snapshot.val();
            if (val.status === 'pending') {
                this.pendingGuestId = snapshot.key;
                this.pendingGuestName = val.name;
                if (this.onJoinRequest) this.onJoinRequest(val.name);
            }
        });
        this._listeners.push(unsub);
    }

    async acceptJoinRequest() {
        if (!this.pendingGuestId) return;

        // Move to players
        await update(ref(db, `rooms/${this.roomCode}/players`), {
            [this.pendingGuestId]: { name: this.pendingGuestName, score: 0, online: true }
        });

        // Update request status
        await update(ref(db, `rooms/${this.roomCode}/join_requests/${this.pendingGuestId}`), {
            status: 'accepted'
        });

        this.opponentName = this.pendingGuestName;

        await this._setupWebRTC();
        await this._createOffer();

        this.pendingGuestId = null;
        this.pendingGuestName = null;

        if (this.onPlayerJoined) this.onPlayerJoined(this.opponentName);
    }

    async denyJoinRequest() {
        if (!this.pendingGuestId) return;
        await update(ref(db, `rooms/${this.roomCode}/join_requests/${this.pendingGuestId}`), {
            status: 'denied'
        });
        this.pendingGuestId = null;
    }

    async _setupLocalStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (e) {
            console.warn("Camera/Mic access denied for WebRTC", e);
        }
    }

    toggleMic() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                return !audioTrack.enabled; // returns true if muted
            }
        }
        return false;
    }

    async _setupWebRTC() {
        this.peerConnection = new RTCPeerConnection(this.rtcConfig);

        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Receive remote tracks
        this.peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                this.remoteStream = event.streams[0];
                if (this.onRemoteStreamReady) this.onRemoteStreamReady(this.remoteStream);
            }
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                const candidatesRef = ref(db, `rooms/${this.roomCode}/webrtc/candidates/${this.playerId}`);
                push(candidatesRef, event.candidate.toJSON());
            }
        };

        // Listen for remote ICE candidates
        const opponentId = this.playerId === 'player1' ? 'player2' : 'player1';
        const remoteCandidatesRef = ref(db, `rooms/${this.roomCode}/webrtc/candidates/${opponentId}`);
        const unsubCand = onChildAdded(remoteCandidatesRef, (snapshot) => {
            if (this.peerConnection && this.peerConnection.remoteDescription) {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
            } else {
                // If remote description isn't set yet, store candidates and add them later
                // For simplicity in this demo, we assume offer/answer completes fast enough.
            }
        });
        this.webrtcUnsubs.push(unsubCand);
    }

    async _createOffer() {
        // Host creates offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        await set(ref(db, `rooms/${this.roomCode}/webrtc/offer`), {
            type: offer.type,
            sdp: offer.sdp
        });

        // Listen for answer
        const answerRef = ref(db, `rooms/${this.roomCode}/webrtc/answer`);
        const unsubAns = onValue(answerRef, async (snapshot) => {
            if (snapshot.exists()) {
                const answer = snapshot.val();
                if (!this.peerConnection.currentRemoteDescription) {
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                }
            }
        });
        this.webrtcUnsubs.push(unsubAns);
    }

    async _listenForOffer() {
        // Guest listens for offer
        const offerRef = ref(db, `rooms/${this.roomCode}/webrtc/offer`);
        const unsubOffer = onValue(offerRef, async (snapshot) => {
            if (snapshot.exists() && this.peerConnection && !this.peerConnection.currentRemoteDescription) {
                const offer = snapshot.val();
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

                // Create answer
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);

                await set(ref(db, `rooms/${this.roomCode}/webrtc/answer`), {
                    type: answer.type,
                    sdp: answer.sdp
                });
            }
        });
        this.webrtcUnsubs.push(unsubOffer);
    }

    async leaveRoom() {
        if (this.roomCode && this.playerId) {
            try {
                const playerRef = ref(db, `rooms/${this.roomCode}/players/${this.playerId}`);
                await update(playerRef, { online: false });
            } catch (e) { /* ignore */ }
        }

        // Cleanup WebRTC
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        this.webrtcUnsubs.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this.webrtcUnsubs = [];

        // Clean up listeners
        this._listeners.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this._listeners = [];
        this.roomCode = null;
        this.playerId = null;
        this.myScore = 0;
        this.opponentScore = 0;
        this.flyingBalloons = [];
    }
}

export { HoliPartyMode };
