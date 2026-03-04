// ============================================
// Color Splash Mode (Solo)
// ============================================

import { HOLI_COLORS, randomHoliColor } from './particles.js';
import { GESTURES } from './gestures.js';

class ColorSplashMode {
    constructor(particleManager) {
        this.particles = particleManager;
        this.isActive = false;
        this.currentColorIndex = 0;
        this.isCharging = false;
        this.chargeStartTime = 0;
    }

    get currentColor() {
        return HOLI_COLORS[this.currentColorIndex];
    }

    nextColor() {
        this.currentColorIndex = (this.currentColorIndex + 1) % HOLI_COLORS.length;
    }

    activate() {
        this.isActive = true;
    }

    deactivate() {
        this.isActive = false;
        this.isCharging = false;
    }

    setupGestures(gestureDetector) {
        // Change color when opening hand, but only trigger once per open
        gestureDetector.onGestureTransition(GESTURES.NONE, GESTURES.OPEN_PALM, () => {
            if (!this.isActive) return;
            this.nextColor();
            if (window.app && window.app.socialManager) {
                window.app.socialManager.logActivity(`Switched Splash Color to ${this.currentColor}`);
            }
        });
        gestureDetector.onGestureTransition(GESTURES.POINT, GESTURES.OPEN_PALM, () => {
            if (!this.isActive) return;
            this.nextColor();
        });
        gestureDetector.onGestureTransition(GESTURES.FIST, GESTURES.OPEN_PALM, () => {
            if (!this.isActive) return;
            this.nextColor();
        });
    }

    update(gesture, position, prevPosition) {
        if (!this.isActive) return;

        if (gesture === GESTURES.POINT) {
            this.isCharging = true;

            // Calculate direction of stream based on finger movement, or default upwards
            let dirX = 0;
            let dirY = -1; // Default shoot UP

            if (prevPosition) {
                const dx = position.x - prevPosition.x;
                const dy = position.y - prevPosition.y;
                // If moving fast enough, aim in that direction
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    const absM = Math.sqrt(dx * dx + dy * dy);
                    dirX = dx / absM;
                    dirY = dy / absM;
                }
            }

            // Shoot the continuous water stream!
            this.particles.emitWaterStream(position.x, position.y, this.currentColor, dirX, dirY);

        } else if (gesture === GESTURES.OPEN_PALM) {
            // Show "ready to shoot" glowing charge effect
            this.particles.emitCharge(position.x, position.y, this.currentColor);
            this.isCharging = false;
        } else {
            this.isCharging = false;
        }
    }

    draw(ctx) {
        // Mode-specific UI drawn by app.js
    }
}

export { ColorSplashMode };
