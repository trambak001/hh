// ============================================
// Balloon Burst Mode (Solo)
// ============================================

import { randomHoliColor, hexToRgb } from './particles.js';
import { GESTURES } from './gestures.js';

class Balloon {
    constructor(canvasWidth, canvasHeight) {
        this.x = Math.random() * (canvasWidth - 60) + 30;
        this.y = canvasHeight + 50;
        this.color = randomHoliColor();
        this.rgb = hexToRgb(this.color);
        this.size = 40 + Math.random() * 25;  // Much bigger balloons
        this.speed = 1 + Math.random() * 2;
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = 0.02 + Math.random() * 0.03;
        this.wobbleAmount = 1 + Math.random() * 2;
        this.popped = false;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
    }

    update() {
        this.y -= this.speed;
        this.wobble += this.wobbleSpeed;
        this.x += Math.sin(this.wobble) * this.wobbleAmount;
        return this.y > -this.size * 2 && !this.popped;
    }

    draw(ctx) {
        if (this.popped) return;

        ctx.save();

        // Balloon body
        const gradient = ctx.createRadialGradient(
            this.x - this.size * 0.2, this.y - this.size * 0.2, this.size * 0.1,
            this.x, this.y, this.size
        );
        gradient.addColorStop(0, `rgba(${Math.min(this.rgb.r + 60, 255)}, ${Math.min(this.rgb.g + 60, 255)}, ${Math.min(this.rgb.b + 60, 255)}, 0.9)`);
        gradient.addColorStop(0.7, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, 0.85)`);
        gradient.addColorStop(1, `rgba(${Math.max(this.rgb.r - 40, 0)}, ${Math.max(this.rgb.g - 40, 0)}, ${Math.max(this.rgb.b - 40, 0)}, 0.8)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, this.size * 0.8, this.size, 0, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = `rgba(255, 255, 255, 0.3)`;
        ctx.beginPath();
        ctx.ellipse(this.x - this.size * 0.25, this.y - this.size * 0.25, this.size * 0.15, this.size * 0.25, -0.5, 0, Math.PI * 2);
        ctx.fill();

        // Knot
        ctx.fillStyle = `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, 1)`;
        ctx.beginPath();
        ctx.moveTo(this.x - 4, this.y + this.size);
        ctx.lineTo(this.x + 4, this.y + this.size);
        ctx.lineTo(this.x, this.y + this.size + 6);
        ctx.closePath();
        ctx.fill();

        // String
        ctx.strokeStyle = `rgba(200, 200, 200, 0.5)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + this.size + 6);
        ctx.quadraticCurveTo(
            this.x + Math.sin(this.wobble * 2) * 10,
            this.y + this.size + 25,
            this.x + Math.sin(this.wobble * 3) * 5,
            this.y + this.size + 40
        );
        ctx.stroke();

        ctx.restore();
    }

    isNear(x, y, threshold = 70) {  // More forgiving detection
        const dx = this.x - x;
        const dy = this.y - y;
        return Math.sqrt(dx * dx + dy * dy) < threshold + this.size;
    }
}

class BalloonBurstMode {
    constructor(particleManager, canvasWidth, canvasHeight) {
        this.particles = particleManager;
        this.balloons = [];
        this.isActive = false;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.spawnTimer = 0;
        this.spawnInterval = 60; // frames
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.difficulty = 1;
    }

    activate() {
        this.isActive = true;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.balloons = [];
        this.difficulty = 1;
    }

    deactivate() {
        this.isActive = false;
        this.balloons = [];
    }

    resize(w, h) {
        this.canvasWidth = w;
        this.canvasHeight = h;
    }

    setupGestures(gestureDetector) {
        // Pinch to pop (handled in update via proximity check)
    }

    _tryPopBalloon(x, y) {
        for (let i = this.balloons.length - 1; i >= 0; i--) {
            const b = this.balloons[i];
            if (!b.popped && b.isNear(x, y)) {
                b.popped = true;
                this.score++;
                this.combo++;
                this.maxCombo = Math.max(this.maxCombo, this.combo);

                // BIG satisfying pop!
                this.particles.emitSparkle(b.x, b.y, b.color, 50);
                this.particles.emitPowderBurst(b.x, b.y, b.color, 30, 0, -1, 0.8);

                return true;
            }
        }
        this.combo = 0;
        return false;
    }

    update(gesture, position) {
        if (!this.isActive) return;

        // Spawn balloons
        this.spawnTimer++;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this.balloons.push(new Balloon(this.canvasWidth, this.canvasHeight));
            // Increase difficulty
            this.difficulty += 0.01;
            this.spawnInterval = Math.max(20, 60 - this.difficulty * 2);
        }

        // Update balloons
        this.balloons = this.balloons.filter(b => b.update());

        // Check for pinch OR fist near balloon (more forgiving)
        if ((gesture === GESTURES.PINCH || gesture === GESTURES.FIST) && position) {
            this._tryPopBalloon(position.x, position.y);
        }
    }

    draw(ctx) {
        if (!this.isActive) return;
        for (const b of this.balloons) {
            b.draw(ctx);
        }
    }
}

export { BalloonBurstMode };
