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
        // Palm -> Fist = Throw color
        gestureDetector.onGestureTransition(GESTURES.OPEN_PALM, GESTURES.FIST, (data) => {
            if (!this.isActive) return;
            this._throwColor(data.position, data.velocity);
        });
    }

    _throwColor(position, velocity) {
        const force = Math.min(Math.sqrt(velocity.x ** 2 + velocity.y ** 2) / 15, 1);
        const actualForce = Math.max(force, 0.3); // Minimum throw force
        const dirX = velocity.x / (Math.abs(velocity.x) + Math.abs(velocity.y) + 0.01);
        const dirY = velocity.y / (Math.abs(velocity.x) + Math.abs(velocity.y) + 0.01);

        this.particles.emitPowderBurst(
            position.x, position.y,
            this.currentColor,
            30 + Math.floor(actualForce * 30),
            dirX, dirY,
            actualForce
        );
        this.nextColor();
    }

    update(gesture, position) {
        if (!this.isActive) return;

        // Show charge effect when palm is open
        if (gesture === GESTURES.OPEN_PALM) {
            if (!this.isCharging) {
                this.isCharging = true;
                this.chargeStartTime = Date.now();
            }
            this.particles.emitCharge(position.x, position.y, this.currentColor);
        } else {
            this.isCharging = false;
        }
    }

    draw(ctx) {
        // Mode-specific UI drawn by app.js
    }
}

export { ColorSplashMode };
