import { db, ref, set, push, onChildAdded, onValue, remove, update, get } from './firebase-config.js';
import { HOLI_COLORS } from './particles.js';
import { GESTURES } from './gestures.js';

class FlyingBalloon {
    constructor(id, targetX, targetY, color, cw, ch) {
        this.id = id;
        this.targetX = targetX;
        this.targetY = targetY;
        this.color = color;
        this.x = cw / 2;
        this.y = ch;
        this.speed = 15;
        this.size = 20;
        this.burst = false;

        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.hypot(dx, dy);
        this.vx = (dx / dist) * this.speed;
        this.vy = (dy / dist) * this.speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        const distToTarget = Math.hypot(this.targetX - this.x, this.targetY - this.y);
        if (distToTarget < this.speed || this.y < 0) {
            this.burst = true;
            return false; // kill balloon
        }
        return true;
    }

    draw(ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        // little tie at the bottom
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.size);
        ctx.lineTo(this.x - 5, this.y + this.size + 8);
        ctx.lineTo(this.x + 5, this.y + this.size + 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

class HoliPartyMode {
    constructor(particleManager, canvasWidth, canvasHeight) {
        this.particles = particleManager;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.isActive = false;

        this.roomCode = null;
        this.playerName = 'Player';
        this.playerId = null; // Will be set to auth UID
        this.isHost = false;

        this.currentColorIndex = 0;
        this.currentColor = HOLI_COLORS[0];

        this.myScore = 0;
        this.players = {}; // Key: userId, Value: {name, score, online}

        // Projectiles
        this.flyingBalloons = [];

        // Callbacks
        this.onRoomCreated = null;
        this.onPlayerJoined = null;       // (userId, name)
        this.onPlayerLeft = null;         // (userId)
        this.onScoreUpdate = null;        // (playersObj)
        this.onJoinRequest = null;        // Host only: (reqId, guestName)
        this.onWaitingForHost = null;     // Guest only
        this.onHostRejected = null;       // Guest only

        // WebRTC Mesh Network
        this.peerConnections = {}; // Key: userId, Value: RTCPeerConnection
        this.localStream = null;
        this.onTrackAdded = null;   // (userId, track, stream)
        this.onTrackRemoved = null; // (userId)
        this._listeners = [];

        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    nextColor() {
        this.currentColor = HOLI_COLORS[this.currentColorIndex];
        this.currentColorIndex = (this.currentColorIndex + 1) % HOLI_COLORS.length;
    }

    _generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    async createRoom(uid, playerName) {
        this.roomCode = this._generateRoomCode();
        this.playerId = uid;
        this.playerName = playerName;
        this.isHost = true;
        this.myScore = 0;
        this.players = {};

        const roomRef = ref(db, `rooms/${this.roomCode}`);

        await set(roomRef, {
            hostId: this.playerId,
            status: 'active',
            createdAt: Date.now()
        });

        // Add self to players
        await set(ref(db, `rooms/${this.roomCode}/players/${this.playerId}`), {
            name: this.playerName,
            score: 0,
            online: true,
            joinedAt: Date.now()
        });

        await this._setupLocalStream();

        this._listenForJoinRequests();
        this._listenForPlayers();
        this._listenForThrows();
        this._listenForSignals();

        if (this.onRoomCreated) this.onRoomCreated(this.roomCode);
        return this.roomCode;
    }

    async joinRoom(roomCode, uid, playerName) {
        this.roomCode = roomCode.toUpperCase();
        this.playerId = uid;
        this.playerName = playerName;
        this.isHost = false;
        this.myScore = 0;
        this.players = {};

        const roomRef = ref(db, `rooms/${this.roomCode}`);
        const snapshot = await get(roomRef);

        if (!snapshot.exists()) {
            throw new Error('Room not found!');
        }

        await this._setupLocalStream();

        // Write join request
        const requestRef = ref(db, `rooms/${this.roomCode}/join_requests/${this.playerId}`);
        await set(requestRef, {
            name: this.playerName,
            status: 'pending',
            timestamp: Date.now()
        });

        if (this.onWaitingForHost) this.onWaitingForHost();

        // Listen for Host Approval
        return new Promise((resolve, reject) => {
            const unsub = onValue(requestRef, async (reqSnap) => {
                if (!reqSnap.exists()) return;
                const reqStatus = reqSnap.val().status;

                if (reqStatus === 'accepted') {
                    unsub();

                    // Add self to players list
                    await set(ref(db, `rooms/${this.roomCode}/players/${this.playerId}`), {
                        name: this.playerName,
                        score: 0,
                        online: true,
                        joinedAt: Date.now()
                    });

                    this._listenForPlayers();
                    this._listenForThrows();
                    this._listenForSignals();

                    if (this.onPlayerJoined) this.onPlayerJoined(this.playerId, this.playerName);
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

    // ===================================
    // Player State Sync
    // ===================================

    _listenForPlayers() {
        const playersRef = ref(db, `rooms/${this.roomCode}/players`);
        const unsub = onValue(playersRef, (snapshot) => {
            if (!snapshot.exists()) return;
            const currentPlayers = snapshot.val();

            // Detect new players
            for (const uid in currentPlayers) {
                if (!this.players[uid]) {
                    this.players[uid] = currentPlayers[uid];
                    if (uid !== this.playerId) {
                        if (this.onPlayerJoined) this.onPlayerJoined(uid, currentPlayers[uid].name);

                        // MESH LOGIC: If the remote player joined AFTER me, I create the offer to them.
                        // This prevents both sides trying to create an offer at the same time.
                        if (currentPlayers[uid].joinedAt > this.players[this.playerId].joinedAt) {
                            this._createOffer(uid);
                        }
                    }
                } else {
                    // Update scores
                    this.players[uid] = currentPlayers[uid];
                }
            }

            // Detect dropped players
            for (const uid in this.players) {
                if (!currentPlayers[uid] || !currentPlayers[uid].online) {
                    if (this.onPlayerLeft) this.onPlayerLeft(uid);
                    this._cleanupPeer(uid);
                    delete this.players[uid];
                }
            }

            if (this.onScoreUpdate) this.onScoreUpdate(this.players);
        });
        this._listeners.push(unsub);
    }

    _listenForThrows() {
        const throwsRef = ref(db, `rooms/${this.roomCode}/throws`);
        const unsub = onChildAdded(throwsRef, (snapshot) => {
            const data = snapshot.val();
            if (data.from === this.playerId) return;

            if (data.type === 'powder') {
                const x = data.x * this.canvasWidth;
                const y = data.y * this.canvasHeight;
                this.particles.emitPowderBurst(x, y, data.color, 40, 0, 0, data.force || 0.8);
            } else if (data.type === 'water') {
                const x = data.x * this.canvasWidth;
                const y = data.y * this.canvasHeight;
                this.particles.emitWaterStream(x, y, data.color, data.dirX, data.dirY);
            } else if (data.type === 'balloon') {
                const targetX = data.x * this.canvasWidth;
                const targetY = data.y * this.canvasHeight;
                this.flyingBalloons.push(
                    new FlyingBalloon(null, targetX, targetY, data.color, this.canvasWidth, this.canvasHeight)
                );
            }
            // Throw cleanup logic could be handled by Host to prevent N deletes, 
            // but for safety we'll just let anyone delete if they process it first, Firebase handles concurrency.
            remove(snapshot.ref).catch(() => { });
        });
        this._listeners.push(unsub);
    }

    async _sendThrow(type, position, color, force = 0.5, dirX = 0, dirY = -1) {
        if (!this.roomCode || !this.playerId) return;

        const throwsRef = ref(db, `rooms/${this.roomCode}/throws`);
        await push(throwsRef, {
            from: this.playerId,
            type: type,
            x: position.x / this.canvasWidth,
            y: position.y / this.canvasHeight,
            color: color,
            force: force,
            dirX: dirX,
            dirY: dirY,
            timestamp: Date.now()
        });

        this.myScore++;
        const playerRef = ref(db, `rooms/${this.roomCode}/players/${this.playerId}`);
        await update(playerRef, { score: this.myScore });
    }

    activate() { this.isActive = true; }
    deactivate() { this.isActive = false; }
    resize(w, h) {
        this.canvasWidth = w;
        this.canvasHeight = h;
    }

    setupGestures(gestureDetector) {
        gestureDetector.onGestureTransition(GESTURES.NONE, GESTURES.OPEN_PALM, () => {
            if (!this.isActive) return;
            this.nextColor();
        });
        gestureDetector.onGestureTransition(GESTURES.POINT, GESTURES.OPEN_PALM, () => {
            if (!this.isActive) return;
            this.nextColor();
        });
        gestureDetector.onGestureTransition(GESTURES.FIST, GESTURES.OPEN_PALM, () => {
            if (!this.isActive) return;
            this.nextColor();
        });

        gestureDetector.onGestureTransition(GESTURES.PINCH, GESTURES.OPEN_PALM, (data) => {
            if (!this.isActive || !this.roomCode) return;
            const color = randomHoliColor();
            this._sendThrow('balloon', data.position, color, 1);
        });
    }

    update(gesture, position, prevPosition) {
        if (!this.isActive) return;

        if (gesture === GESTURES.POINT && position) {
            let dirX = 0;
            let dirY = -1;

            if (prevPosition) {
                const dx = position.x - prevPosition.x;
                const dy = position.y - prevPosition.y;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    const absM = Math.sqrt(dx * dx + dy * dy);
                    dirX = dx / absM;
                    dirY = dy / absM;
                }
            }

            this.particles.emitWaterStream(position.x, position.y, this.currentColor, dirX, dirY);

            // Throttle network throws so we don't spam Firebase too hard (e.g. 10fps instead of 60fps)
            if (!this.lastPointTime || Date.now() - this.lastPointTime > 100) {
                this.lastPointTime = Date.now();
                this._sendThrow('water', position, this.currentColor, 1, dirX, dirY);
            }
        } else if (gesture === GESTURES.OPEN_PALM && position) {
            this.particles.emitCharge(position.x, position.y, this.currentColor);
        }

        this.flyingBalloons = this.flyingBalloons.filter(b => {
            const alive = b.update();
            if (b.burst) {
                this.particles.emitWaterBurst(b.targetX, b.targetY, b.color, this.canvasHeight, 60);
            }
            return alive;
        });
    }

    draw(ctx) {
        if (!this.isActive) return;
        for (const b of this.flyingBalloons) b.draw(ctx);
    }

    // ===================================
    // Admin Approval
    // ===================================
    _listenForJoinRequests() {
        const requestsRef = ref(db, `rooms/${this.roomCode}/join_requests`);
        const unsub = onChildAdded(requestsRef, (snapshot) => {
            const val = snapshot.val();
            if (val.status === 'pending') {
                if (this.onJoinRequest) this.onJoinRequest(snapshot.key, val.name);
            }
        });
        this._listeners.push(unsub);
    }

    async acceptJoinRequest(reqId) {
        await update(ref(db, `rooms/${this.roomCode}/join_requests/${reqId}`), {
            status: 'accepted'
        });
        if (window.app && window.app.socialManager) {
            window.app.socialManager.logActivity(`Approved Join Request for ${reqId}`);
        }
    }

    async denyJoinRequest(reqId) {
        await update(ref(db, `rooms/${this.roomCode}/join_requests/${reqId}`), {
            status: 'denied'
        });
    }

    // ===================================
    // WebRTC Mesh Networking
    // ===================================

    async _setupLocalStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            // Let the App handle drawing the local UI stream via camera.js, we just need the tracks
        } catch (e) {
            console.warn("Camera/Mic access denied for WebRTC", e);
        }
    }

    toggleMic() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                return !audioTrack.enabled;
            }
        }
        return false;
    }

    _getPeerConnection(remoteUid) {
        if (this.peerConnections[remoteUid]) {
            return this.peerConnections[remoteUid];
        }

        console.log(`Creating PeerConnection for ${remoteUid}`);
        const pc = new RTCPeerConnection(this.iceServers);
        this.peerConnections[remoteUid] = pc;

        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
            if (this.onTrackAdded) {
                this.onTrackAdded(remoteUid, event.track, event.streams[0]);
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                const signalRef = ref(db, `rooms/${this.roomCode}/signals/${remoteUid}/${this.playerId}/candidates`);
                push(signalRef, event.candidate.toJSON());
            }
        };

        return pc;
    }

    _cleanupPeer(remoteUid) {
        if (this.peerConnections[remoteUid]) {
            this.peerConnections[remoteUid].close();
            delete this.peerConnections[remoteUid];
        }
        if (this.onTrackRemoved) {
            this.onTrackRemoved(remoteUid);
        }
    }

    // Listens for SDP offers, answers, and ICE candidates directed at ME
    _listenForSignals() {
        const mySignalsRef = ref(db, `rooms/${this.roomCode}/signals/${this.playerId}`);

        const unsub = onChildAdded(mySignalsRef, async (snapshot) => {
            const senderUid = snapshot.key; // Who is sending to me

            // Listen to their offer
            const offerRef = ref(db, `rooms/${this.roomCode}/signals/${this.playerId}/${senderUid}/offer`);
            onValue(offerRef, async (offerSnap) => {
                if (offerSnap.exists()) {
                    const offer = offerSnap.val();
                    const pc = this._getPeerConnection(senderUid);
                    if (pc.signalingState !== "stable") return; // Already negotiating

                    await pc.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    // Send answer back
                    await set(ref(db, `rooms/${this.roomCode}/signals/${senderUid}/${this.playerId}/answer`), {
                        type: answer.type,
                        sdp: answer.sdp
                    });
                }
            });

            // Listen to their answer
            const answerRef = ref(db, `rooms/${this.roomCode}/signals/${this.playerId}/${senderUid}/answer`);
            onValue(answerRef, async (ansSnap) => {
                if (ansSnap.exists()) {
                    const answer = ansSnap.val();
                    const pc = this._getPeerConnection(senderUid);
                    if (pc.signalingState === "have-local-offer") {
                        await pc.setRemoteDescription(new RTCSessionDescription(answer));
                    }
                }
            });

            // Listen to their ICE candidates
            const candidatesRef = ref(db, `rooms/${this.roomCode}/signals/${this.playerId}/${senderUid}/candidates`);
            onChildAdded(candidatesRef, async (candSnap) => {
                const candidate = candSnap.val();
                const pc = this._getPeerConnection(senderUid);
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) { console.error("Error adding ICE candidate", e); }
            });
        });
        this._listeners.push(unsub);
    }

    async _createOffer(remoteUid) {
        const pc = this._getPeerConnection(remoteUid);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await set(ref(db, `rooms/${this.roomCode}/signals/${remoteUid}/${this.playerId}/offer`), {
            type: offer.type,
            sdp: offer.sdp
        });
    }

    leaveRoom() {
        // Remove self from room players
        if (this.roomCode && this.playerId) {
            remove(ref(db, `rooms/${this.roomCode}/players/${this.playerId}`));
            // Remove signaling data sent to/from us
            remove(ref(db, `rooms/${this.roomCode}/signals/${this.playerId}`));
        }

        // Close all peer connections
        for (const uid in this.peerConnections) {
            this._cleanupPeer(uid);
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
        }

        this._listeners.forEach(unsub => unsub());
        this._listeners = [];
        this.roomCode = null;
        this.isActive = false;
        this.players = {};
    }
}

// Utility for dynamic colors
function randomHoliColor() {
    return HOLI_COLORS[Math.floor(Math.random() * HOLI_COLORS.length)];
}

export { HoliPartyMode, HOLI_COLORS };
