// CHRISTOS - Xbox 2001 "Neon" Plasma Music Visualizer
// Recreating the iconic 2001 Xbox green phosphor plasma & Lissajous warp tunnel

const XboxVisualizer = {
    t: 0,
    particles: [],
    numParticles: 140,

    init() {
        this.particles = [];
        for (let i = 0; i < this.numParticles; i++) {
            this.particles.push({
                x: (Math.random() - 0.5) * 2000,
                y: (Math.random() - 0.5) * 2000,
                z: Math.random() * 1000 + 1,
                size: Math.random() * 3 + 1
            });
        }
    },

    draw(ctx, width, height, freqData, timeData) {
        if (!this.particles || this.particles.length === 0) {
            this.init();
        }

        const cx = width / 2;
        const cy = height / 2;

        // Calculate frequency bands
        let bass = 0;
        let mid = 0;
        let treble = 0;

        for (let i = 0; i < 16; i++) bass += freqData[i] || 0;
        bass = (bass / 16) / 255.0; // 0.0 - 1.0

        for (let i = 16; i < 96; i++) mid += freqData[i] || 0;
        mid = (mid / 80) / 255.0;

        for (let i = 96; i < 200; i++) treble += freqData[i] || 0;
        treble = (treble / 104) / 255.0;

        // Authentic CRT phosphor trail background
        ctx.fillStyle = `rgba(3, 8, 4, ${0.16 + (1.0 - bass) * 0.06})`;
        ctx.fillRect(0, 0, width, height);

        this.t += 0.025 + bass * 0.045;

        // 1. Draw 3D Hyperspace Warp Stars in toxic green
        const warpSpeed = 10 + bass * 40;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.z -= warpSpeed;
            if (p.z <= 0) {
                p.z = 1000;
                p.x = (Math.random() - 0.5) * width * 2.2;
                p.y = (Math.random() - 0.5) * height * 2.2;
            }

            const k = 320 / p.z;
            const px = p.x * k + cx;
            const py = p.y * k + cy;

            if (px >= 0 && px < width && py >= 0 && py < height) {
                const size = Math.max(1.5, (1.0 - p.z / 1000) * 5 * (1.0 + treble));
                const alpha = (1.0 - p.z / 1000) * 0.95;
                ctx.fillStyle = `rgba(32, 255, 110, ${alpha})`;
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 2. Draw Xbox 2001 Pulsing Organic Bio-Nucleus (Central Glowing Core)
        const coreRadius = (55 + bass * 100 + mid * 40) * (Math.min(width, height) / 700);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 2.4);
        grad.addColorStop(0, `rgba(235, 255, 240, ${0.9 + bass * 0.1})`);
        grad.addColorStop(0.2, `rgba(30, 255, 115, ${0.8 + bass * 0.2})`);
        grad.addColorStop(0.5, `rgba(0, 220, 70, ${0.4 + mid * 0.3})`);
        grad.addColorStop(0.85, 'rgba(0, 80, 25, 0.15)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreRadius * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // 3. Draw Morphing Lissajous Harmonic Plasma Rings (Signature Jeff Minter Neon aesthetic)
        const numRings = 4;
        for (let r = 0; r < numRings; r++) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(this.t * (r % 2 === 0 ? 0.75 : -0.75) + (r * Math.PI / numRings));

            ctx.beginPath();
            const points = 180;
            const a = 2 + r;
            const b = 3 + (r % 2);
            const delta = this.t * 1.6 + (r * Math.PI / 3);
            const scale = (90 + r * 50 + bass * 90) * (Math.min(width, height) / 680);

            for (let i = 0; i <= points; i++) {
                const phi = (i / points) * Math.PI * 2;
                const freqSample = (freqData[(i * 2 + r * 12) % freqData.length] || 0) / 255.0;
                const radMod = 1.0 + freqSample * 0.5 * (1.0 + bass);

                const lx = Math.sin(a * phi + delta) * scale * radMod;
                const ly = Math.sin(b * phi) * (scale * 0.88) * radMod;

                if (i === 0) ctx.moveTo(lx, ly);
                else ctx.lineTo(lx, ly);
            }
            ctx.closePath();

            // Radiant Xbox Green Neon Glow stroke
            const hue = 135 + r * 12 + Math.sin(this.t) * 15;
            ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${0.8 + bass * 0.2})`;
            ctx.lineWidth = 3.5 + bass * 4.0;
            ctx.shadowColor = '#00ff66';
            ctx.shadowBlur = 25 + bass * 30;
            ctx.stroke();

            ctx.restore();
        }

        // 4. Radiating Bio-Spike Waveform around the perimeter
        ctx.save();
        ctx.translate(cx, cy);
        const spokeCount = 72;
        const baseRadius = coreRadius * 1.15;
        ctx.beginPath();
        for (let i = 0; i < spokeCount; i++) {
            const angle = (i / spokeCount) * Math.PI * 2;
            const fVal = (freqData[i * 2] || 0) / 255.0;
            const spokeLen = (25 + fVal * 140 * (1.0 + bass)) * (Math.min(width, height) / 720);

            const x1 = Math.cos(angle) * baseRadius;
            const y1 = Math.sin(angle) * baseRadius;
            const x2 = Math.cos(angle) * (baseRadius + spokeLen);
            const y2 = Math.sin(angle) * (baseRadius + spokeLen);

            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.strokeStyle = `rgba(160, 255, 185, ${0.7 + bass * 0.3})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00ff66';
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();

        // 5. Center Xbox 2001 Glowing Shield Glyph
        ctx.save();
        ctx.translate(cx, cy);
        const emblemRadius = 24 + bass * 12;
        ctx.fillStyle = 'rgba(0, 20, 5, 0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, emblemRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#30ff85';
        ctx.lineWidth = 3.0;
        ctx.shadowColor = '#00ff66';
        ctx.shadowBlur = 20;
        ctx.stroke();

        // Inner neon X
        const xSpan = emblemRadius * 0.55;
        ctx.beginPath();
        ctx.moveTo(-xSpan, -xSpan);
        ctx.lineTo(xSpan, xSpan);
        ctx.moveTo(xSpan, -xSpan);
        ctx.lineTo(-xSpan, xSpan);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.restore();
        ctx.shadowBlur = 0;
    }
};

window.XboxVisualizer = XboxVisualizer;