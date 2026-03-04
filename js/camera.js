// ============================================
// Camera & MediaPipe Hands Setup
// ============================================

class CameraManager {
    constructor(videoElement) {
        this.video = videoElement;
        this.hands = null;
        this.camera = null;
        this.onResults = null;
        this.isRunning = false;
    }

    async init(onResultsCallback) {
        this.onResults = onResultsCallback;

        // Initialize MediaPipe Hands
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 0, // 0 is much faster for mobile devices, avoids lag
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.5,
        });

        this.hands.onResults((results) => {
            if (this.onResults) this.onResults(results);
        });

        // Start camera
        this.camera = new Camera(this.video, {
            onFrame: async () => {
                if (this.isRunning) {
                    await this.hands.send({ image: this.video });
                }
            },
            width: 640,  // Lower resolution for better frame rate
            height: 480,
        });

        this.isRunning = true;
        await this.camera.start();
    }

    stop() {
        this.isRunning = false;
        if (this.camera) {
            this.camera.stop();
        }
    }
}

export { CameraManager };
