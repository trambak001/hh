// ============================================
// Particle System v2 — BIGGER, MORE VIBRANT
// ============================================

const HOLI_COLORS = [
    '#FF1493', // Deep Pink
    '#FF6B35', // Orange
    '#FFD700', // Gold
    '#00E676', // Green
    '#00BCD4', // Cyan
    '#7C4DFF', // Purple
    '#E91E63', // Hot Pink
    '#FF9800', // Amber
    '#4CAF50', // Medium Green
    '#2196F3', // Blue
    '#F44336', // Red
    '#9C27B0', // Deep Purple
];

function randomHoliColor() {
    return HOLI_COLORS[Math.floor(Math.random() * HOLI_COLORS.length)];
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

// ---- Base Particle ----
class Particle {
    constructor(x, y, color, options = {}) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.rgb = hexToRgb(color);
        this.size = options.size || (Math.random() * 8 + 3);
        this.speedX = options.speedX || (Math.random() - 0.5) * 12;
        this.speedY = options.speedY || (Math.random() - 0.5) * 12;
        this.gravity = options.gravity || 0;
        this.friction = options.friction || 0.97;
        this.lifetime = options.lifetime || 100;
        this.age = 0;
        this.opacity = 1;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.2;
    }

    update() {
        this.speedX *= this.friction;
        this.speedY *= this.friction;
        this.speedY += this.gravity;
        this.x += this.speedX;
        this.y += this.speedY;
        this.age++;
        this.rotation += this.rotSpeed;
        this.opacity = Math.max(0, 1 - (this.age / this.lifetime));
        return this.age < this.lifetime;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity})`;
        // Draw a star shape for more festive look
        const s = this.size;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
            const outerX = Math.cos(angle) * s;
            const outerY = Math.sin(angle) * s;
            const innerAngle = angle + Math.PI / 5;
            const innerX = Math.cos(innerAngle) * s * 0.4;
            const innerY = Math.sin(innerAngle) * s * 0.4;
            if (i === 0) ctx.moveTo(outerX, outerY);
            else ctx.lineTo(outerX, outerY);
            ctx.lineTo(innerX, innerY);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

// ---- Powder Cloud Particle (BIGGER, glowing) ----
class PowderParticle extends Particle {
    constructor(x, y, color, options = {}) {
        super(x, y, color, {
            size: Math.random() * 20 + 8,   // Much bigger
            friction: 0.95,
            gravity: 0.03,
            lifetime: options.lifetime || 150,
            ...options
        });
        this.sizeDecay = 0.98;
    }

    update() {
        this.size *= this.sizeDecay;
        return super.update() && this.size > 0.5;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity * 0.6;
        // Double glow effect for richer color
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.size * 2.5
        );
        gradient.addColorStop(0, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity})`);
        gradient.addColorStop(0.3, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity * 0.6})`);
        gradient.addColorStop(1, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright core
        ctx.globalAlpha = this.opacity * 0.8;
        ctx.fillStyle = `rgba(${Math.min(this.rgb.r + 80, 255)}, ${Math.min(this.rgb.g + 80, 255)}, ${Math.min(this.rgb.b + 80, 255)}, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ---- Water Splash Particle (with trails) ----
class WaterParticle extends Particle {
    constructor(x, y, color, options = {}) {
        super(x, y, color, {
            size: Math.random() * 10 + 4,
            friction: 0.94,
            gravity: 0.2,
            lifetime: options.lifetime || 120,
            ...options
        });
        this.trail = [];
        this.maxTrailLength = 12;
    }

    update() {
        this.trail.push({ x: this.x, y: this.y, size: this.size, opacity: this.opacity });
        if (this.trail.length > this.maxTrailLength) this.trail.shift();
        return super.update();
    }

    draw(ctx) {
        // Draw trail (drip/streak effect)
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const trailOpacity = (i / this.trail.length) * this.opacity * 0.5;
            ctx.save();
            ctx.globalAlpha = trailOpacity;
            ctx.fillStyle = `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${trailOpacity})`;
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // Main droplet with glossy highlight
        ctx.save();
        ctx.globalAlpha = this.opacity;
        const gradient = ctx.createRadialGradient(
            this.x - this.size * 0.2, this.y - this.size * 0.2, 0,
            this.x, this.y, this.size
        );
        gradient.addColorStop(0, `rgba(${Math.min(this.rgb.r + 100, 255)}, ${Math.min(this.rgb.g + 100, 255)}, ${Math.min(this.rgb.b + 100, 255)}, ${this.opacity})`);
        gradient.addColorStop(1, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity})`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ---- Drip Particle (runs down screen) ----
class DripParticle {
    constructor(x, y, color, canvasHeight) {
        this.x = x + (Math.random() - 0.5) * 30;
        this.y = y;
        this.color = color;
        this.rgb = hexToRgb(color);
        this.width = Math.random() * 6 + 3;
        this.speed = Math.random() * 3 + 1.5;
        this.maxY = y + Math.random() * canvasHeight * 0.5 + 80;
        this.opacity = 0.85;
        this.done = false;
    }

    update() {
        if (this.y < this.maxY) {
            this.y += this.speed;
            this.speed *= 0.998;
        } else {
            this.opacity -= 0.008;
        }
        this.done = this.opacity <= 0;
        return !this.done;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        const gradient = ctx.createLinearGradient(this.x, this.y - 30, this.x, this.y);
        gradient.addColorStop(0, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, 0)`);
        gradient.addColorStop(1, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity})`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y - 15, this.width, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        // Fat drip tip
        ctx.fillStyle = `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ---- Ripple Effect (BIGGER) ----
class Ripple {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.rgb = hexToRgb(color);
        this.radius = 5;
        this.maxRadius = 120 + Math.random() * 60;
        this.opacity = 0.8;
        this.speed = 3;
        this.lineWidth = 4;
    }

    update() {
        this.radius += this.speed;
        this.speed *= 0.98;
        this.lineWidth = Math.max(1, 4 * (1 - this.radius / this.maxRadius));
        this.opacity = Math.max(0, 0.8 * (1 - this.radius / this.maxRadius));
        return this.radius < this.maxRadius;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.strokeStyle = `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity})`;
        ctx.lineWidth = this.lineWidth;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// ---- Color Stain (permanent on screen, BIGGER) ----
class ColorStain {
    constructor(x, y, color, size) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.rgb = hexToRgb(color);
        this.size = size || (Math.random() * 50 + 25);
        this.opacity = 0.35 + Math.random() * 0.25;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.size
        );
        gradient.addColorStop(0, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity})`);
        gradient.addColorStop(0.5, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity * 0.5})`);
        gradient.addColorStop(1, `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ---- Confetti Particle (festive!) ----
class ConfettiParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.rgb = hexToRgb(color);
        this.width = Math.random() * 8 + 4;
        this.height = Math.random() * 6 + 3;
        this.speedX = (Math.random() - 0.5) * 6;
        this.speedY = Math.random() * -4 - 2;
        this.gravity = 0.08;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.3;
        this.opacity = 1;
        this.lifetime = 150 + Math.random() * 100;
        this.age = 0;
    }

    update() {
        this.speedY += this.gravity;
        this.speedX *= 0.99;
        this.x += this.speedX;
        this.y += this.speedY;
        this.rotation += this.rotSpeed;
        this.age++;
        this.opacity = Math.max(0, 1 - (this.age / this.lifetime));
        return this.age < this.lifetime;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.opacity})`;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
    }
}

// ---- Particle Manager ----
class ParticleManager {
    constructor() {
        this.particles = [];
        this.drips = [];
        this.ripples = [];
        this.stains = [];
        this.confetti = [];
        this.screenShake = { x: 0, y: 0, intensity: 0 };
        this.MAX_PARTICLES = 800;
        this.MAX_DRIPS = 150;
        this.MAX_STAINS = 300;
    }

    // Screen shake effect
    shake(intensity = 10) {
        this.screenShake.intensity = intensity;
    }

    updateShake() {
        if (this.screenShake.intensity > 0) {
            this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity;
            this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity;
            this.screenShake.intensity *= 0.9;
            if (this.screenShake.intensity < 0.5) this.screenShake.intensity = 0;
        } else {
            this.screenShake.x = 0;
            this.screenShake.y = 0;
        }
    }

    // MASSIVE powder explosion
    emitPowderBurst(x, y, color, count = 60, dirX = 0, dirY = 0, force = 1) {
        // More particles, bigger, multi-colored
        for (let i = 0; i < count && this.particles.length < this.MAX_PARTICLES; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 6 + 3) * force;
            const useColor = Math.random() > 0.7 ? randomHoliColor() : color; // Mix in random colors
            this.particles.push(new PowderParticle(x, y, useColor, {
                speedX: Math.cos(angle) * speed + dirX * force * 5,
                speedY: Math.sin(angle) * speed + dirY * force * 5,
            }));
        }
        // Sparkle particles mixed in
        for (let i = 0; i < count * 0.3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 8 + 4) * force;
            this.particles.push(new Particle(x, y, color, {
                speedX: Math.cos(angle) * speed + dirX * force * 4,
                speedY: Math.sin(angle) * speed + dirY * force * 4,
                size: Math.random() * 4 + 1,
                lifetime: 60,
                gravity: 0.05,
            }));
        }
        // Big stain at burst point
        if (this.stains.length < this.MAX_STAINS) {
            this.stains.push(new ColorStain(x, y, color, 30 + force * 30));
        }
        // Confetti!
        for (let i = 0; i < 8; i++) {
            this.confetti.push(new ConfettiParticle(x, y, randomHoliColor()));
        }
        // Screen shake on big throws
        this.shake(force * 8);
    }

    // MASSIVE water balloon burst
    emitWaterBurst(x, y, color, canvasHeight, count = 70) {
        // Water droplets - lots of them
        for (let i = 0; i < count && this.particles.length < this.MAX_PARTICLES; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 14 + 5;
            this.particles.push(new WaterParticle(x, y, color, {
                speedX: Math.cos(angle) * speed,
                speedY: Math.sin(angle) * speed - 3,
            }));
        }
        // Heavy drips running down
        const dripCount = Math.floor(Math.random() * 10 + 6);
        for (let i = 0; i < dripCount && this.drips.length < this.MAX_DRIPS; i++) {
            this.drips.push(new DripParticle(x, y, color, canvasHeight));
        }
        // Multiple ripple rings
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                this.ripples.push(new Ripple(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20, color));
            }, i * 80);
        }
        // Huge stain
        if (this.stains.length < this.MAX_STAINS) {
            this.stains.push(new ColorStain(x, y, color, 60 + Math.random() * 40));
        }
        // Confetti burst
        for (let i = 0; i < 15; i++) {
            this.confetti.push(new ConfettiParticle(x, y, randomHoliColor()));
        }
        // BIG screen shake
        this.shake(15);
    }

    // Continuous water stream (Water Gun)
    emitWaterStream(x, y, color, dirX = 0, dirY = -1) {
        // Emit just a few particles per frame for a continuous stream
        for (let i = 0; i < 3 && this.particles.length < this.MAX_PARTICLES; i++) {
            const spread = 0.5; // Narrow spread for a stream
            const speed = Math.random() * 8 + 8; // Fast

            this.particles.push(new WaterParticle(x, y, color, {
                speedX: (dirX + (Math.random() - 0.5) * spread) * speed,
                speedY: (dirY + (Math.random() - 0.5) * spread) * speed,
                size: Math.random() * 6 + 3,
                lifetime: 80
            }));
        }

        // Occasional drip if aiming down
        if (dirY > 0 && Math.random() < 0.1 && this.drips.length < this.MAX_DRIPS) {
            this.drips.push(new DripParticle(x, y, color, 1000)); // Default high canvas height assumption
        }

        // Occasional small stain on screen
        if (Math.random() < 0.05 && this.stains.length < this.MAX_STAINS) {
            this.stains.push(new ColorStain(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, color, 15 + Math.random() * 15));
        }
    }

    // Sparkle burst (balloon pop, more festive)
    emitSparkle(x, y, color, count = 40) {
        for (let i = 0; i < count && this.particles.length < this.MAX_PARTICLES; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 10 + 3;
            this.particles.push(new Particle(x, y, Math.random() > 0.5 ? color : randomHoliColor(), {
                speedX: Math.cos(angle) * speed,
                speedY: Math.sin(angle) * speed,
                size: Math.random() * 6 + 2,
                gravity: 0.06,
                lifetime: 80,
            }));
        }
        this.shake(8);
        // Confetti
        for (let i = 0; i < 10; i++) {
            this.confetti.push(new ConfettiParticle(x, y, randomHoliColor()));
        }
    }

    // Charge effect around hand (more visible)
    emitCharge(x, y, color) {
        for (let i = 0; i < 5 && this.particles.length < this.MAX_PARTICLES; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 40 + Math.random() * 30;
            this.particles.push(new PowderParticle(
                x + Math.cos(angle) * dist,
                y + Math.sin(angle) * dist,
                Math.random() > 0.5 ? color : randomHoliColor(), {
                speedX: -Math.cos(angle) * 2,
                speedY: -Math.sin(angle) * 2,
                size: Math.random() * 8 + 3,
                lifetime: 25,
                gravity: 0,
                friction: 0.92,
            }
            ));
        }
    }

    update() {
        this.updateShake();
        this.particles = this.particles.filter(p => p.update());
        this.drips = this.drips.filter(d => d.update());
        this.ripples = this.ripples.filter(r => r.update());
        this.confetti = this.confetti.filter(c => c.update());
    }

    draw(ctx) {
        ctx.save();
        // Apply screen shake
        if (this.screenShake.intensity > 0) {
            ctx.translate(this.screenShake.x, this.screenShake.y);
        }
        // Stains (background)
        for (const stain of this.stains) stain.draw(ctx);
        // Drips
        for (const drip of this.drips) drip.draw(ctx);
        // Ripples
        for (const ripple of this.ripples) ripple.draw(ctx);
        // Confetti
        for (const c of this.confetti) c.draw(ctx);
        // Particles on top
        for (const p of this.particles) p.draw(ctx);
        ctx.restore();
    }

    clear() {
        this.particles = [];
        this.drips = [];
        this.ripples = [];
        this.stains = [];
        this.confetti = [];
    }
}

export { ParticleManager, HOLI_COLORS, randomHoliColor, hexToRgb };
