// ============================================
// Gesture Detection — IMPROVED v2
// ============================================

const GESTURES = {
    NONE: 'none',
    OPEN_PALM: 'open_palm',
    FIST: 'fist',
    PINCH: 'pinch',
    POINT: 'point',
    PEACE: 'peace',
};

class GestureDetector {
    constructor() {
        this.prevGesture = GESTURES.NONE;
        this.currentGesture = GESTURES.NONE;
        this.gestureStartTime = 0;
        this.handPosition = { x: 0, y: 0 };
        this.prevHandPosition = { x: 0, y: 0 };
        this.handVelocity = { x: 0, y: 0 };
        this.smoothVelocity = { x: 0, y: 0 };
        this.gestureCallbacks = {};
        this.positionHistory = [];
        this.maxHistoryLength = 10;
        // Debounce: prevent rapid gesture flipping
        this.gestureHoldFrames = 0;
        this.pendingGesture = GESTURES.NONE;
        this.HOLD_THRESHOLD = 2; // Must hold gesture for 2 frames to register
    }

    onGestureTransition(from, to, callback) {
        const key = `${from}->${to}`;
        if (!this.gestureCallbacks[key]) this.gestureCallbacks[key] = [];
        this.gestureCallbacks[key].push(callback);
    }

    _fireTransition(from, to, data) {
        // Exact match
        const exactKey = `${from}->${to}`;
        const exactCallbacks = this.gestureCallbacks[exactKey] || [];
        exactCallbacks.forEach(cb => cb(data));

        // Any previous gesture to specific
        const anyFromKey = `ANY->${to}`;
        const anyFromCallbacks = this.gestureCallbacks[anyFromKey] || [];
        anyFromCallbacks.forEach(cb => cb(data));

        // Specific gesture to any next
        const anyToKey = `${from}->ANY`;
        const anyToCallbacks = this.gestureCallbacks[anyToKey] || [];
        anyToCallbacks.forEach(cb => cb(data));
    }

    _isFingerExtended(landmarks, tipIdx, pipIdx, mcpIdx) {
        // More robust: check tip vs PIP AND tip vs MCP
        const tipAbovePip = landmarks[tipIdx].y < landmarks[pipIdx].y;
        const tipAboveMcp = landmarks[tipIdx].y < landmarks[mcpIdx].y;
        return tipAbovePip && tipAboveMcp;
    }

    _isFingerCurled(landmarks, tipIdx, pipIdx, mcpIdx) {
        // Finger is curled if tip is BELOW the MCP joint
        return landmarks[tipIdx].y > landmarks[mcpIdx].y;
    }

    _isThumbExtended(landmarks) {
        const tipDist = Math.abs(landmarks[4].x - landmarks[0].x);
        const ipDist = Math.abs(landmarks[3].x - landmarks[0].x);
        return tipDist > ipDist * 1.1; // Slightly more threshold
    }

    _distance(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    detectGesture(landmarks) {
        if (!landmarks || landmarks.length < 21) return GESTURES.NONE;

        const thumb = this._isThumbExtended(landmarks);
        const index = this._isFingerExtended(landmarks, 8, 6, 5);
        const middle = this._isFingerExtended(landmarks, 12, 10, 9);
        const ring = this._isFingerExtended(landmarks, 16, 14, 13);
        const pinky = this._isFingerExtended(landmarks, 20, 18, 17);

        const indexCurled = this._isFingerCurled(landmarks, 8, 6, 5);
        const middleCurled = this._isFingerCurled(landmarks, 12, 10, 9);
        const ringCurled = this._isFingerCurled(landmarks, 16, 14, 13);
        const pinkyCurled = this._isFingerCurled(landmarks, 20, 18, 17);

        const thumbIndexDist = this._distance(landmarks[4], landmarks[8]);
        const extendedCount = [thumb, index, middle, ring, pinky].filter(Boolean).length;
        const curledCount = [indexCurled, middleCurled, ringCurled, pinkyCurled].filter(Boolean).length;

        // PINCH: thumb and index tips very close (MORE FORGIVING — 0.08 threshold)
        if (thumbIndexDist < 0.08) {
            return GESTURES.PINCH;
        }

        // FIST: most fingers curled (MORE FORGIVING — 3 curled is enough)
        if (curledCount >= 3 && !index) {
            return GESTURES.FIST;
        }

        // PEACE: index and middle extended, others closed
        if (index && middle && !ring && !pinky) {
            return GESTURES.PEACE;
        }

        // POINT: only index extended
        if (index && !middle && !ring && !pinky) {
            return GESTURES.POINT;
        }

        // OPEN PALM: at least 3 fingers extended (MORE FORGIVING)
        if (extendedCount >= 3) {
            return GESTURES.OPEN_PALM;
        }

        return GESTURES.NONE;
    }

    update(landmarks, canvasWidth, canvasHeight) {
        if (!landmarks || landmarks.length < 21) {
            this.currentGesture = GESTURES.NONE;
            return;
        }

        // Use palm center (average of landmarks 0, 5, 9, 13, 17 for more stability)
        const palmLandmarks = [0, 5, 9, 13, 17];
        let sumX = 0, sumY = 0;
        for (const i of palmLandmarks) {
            sumX += landmarks[i].x;
            sumY += landmarks[i].y;
        }
        const centerX = (sumX / palmLandmarks.length) * canvasWidth;
        const centerY = (sumY / palmLandmarks.length) * canvasHeight;

        this.prevHandPosition = { ...this.handPosition };
        this.handPosition = { x: centerX, y: centerY };

        // Track position history for velocity smoothing
        this.positionHistory.push({ ...this.handPosition, time: Date.now() });
        if (this.positionHistory.length > this.maxHistoryLength) {
            this.positionHistory.shift();
        }

        // Compute velocity from history (more stable than frame-to-frame)
        if (this.positionHistory.length >= 3) {
            const recent = this.positionHistory[this.positionHistory.length - 1];
            const old = this.positionHistory[Math.max(0, this.positionHistory.length - 4)];
            const dt = Math.max(1, recent.time - old.time);
            this.handVelocity = {
                x: (recent.x - old.x) / dt * 16, // normalize to ~60fps
                y: (recent.y - old.y) / dt * 16,
            };
        } else {
            this.handVelocity = {
                x: this.handPosition.x - this.prevHandPosition.x,
                y: this.handPosition.y - this.prevHandPosition.y,
            };
        }

        // Smooth velocity (heavier smoothing for stability)
        this.smoothVelocity = {
            x: this.smoothVelocity.x * 0.5 + this.handVelocity.x * 0.5,
            y: this.smoothVelocity.y * 0.5 + this.handVelocity.y * 0.5,
        };

        // Detect current gesture with debounce
        const rawGesture = this.detectGesture(landmarks);

        if (rawGesture === this.pendingGesture) {
            this.gestureHoldFrames++;
        } else {
            this.pendingGesture = rawGesture;
            this.gestureHoldFrames = 1;
        }

        // Only switch gesture after holding for HOLD_THRESHOLD frames
        if (this.gestureHoldFrames >= this.HOLD_THRESHOLD && this.pendingGesture !== this.currentGesture) {
            this.prevGesture = this.currentGesture;
            this.currentGesture = this.pendingGesture;
            this.gestureStartTime = Date.now();
            this._fireTransition(this.prevGesture, this.currentGesture, {
                position: { ...this.handPosition },
                velocity: { ...this.smoothVelocity },
            });
        }
    }

    getGesture() { return this.currentGesture; }
    getHandPosition() { return { ...this.handPosition }; }
    getHandVelocity() { return { ...this.smoothVelocity }; }

    getThrowForce() {
        const speed = Math.sqrt(this.smoothVelocity.x ** 2 + this.smoothVelocity.y ** 2);
        return Math.min(speed / 12, 1); // Lower divisor = easier to get strong throws
    }

    getThrowAngle() {
        return Math.atan2(this.smoothVelocity.y, this.smoothVelocity.x);
    }
}

export { GestureDetector, GESTURES };
