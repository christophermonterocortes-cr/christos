// CHRISTOS Visualizer 10: Liquid Plasma Lava Fluid
const LiquidVisualizer = {
    blobs: [],
    numBlobs: 16,

    init(w, h) {
        this.blobs = [];
        for (let i = 0; i < this.numBlobs; i++) {
            this.blobs.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                radius: Math.random() * 60 + 40,
                hue: (i / this.numBlobs) * 360
            });
        }
    },

    draw(ctx, width, height, freqData, timeData) {
        if (this.blobs.length === 0) this.init(width, height);

        let bass = 0;
        for (let i = 0; i < 16; i++) bass += freqData[i] || 0;
        bass = (bass / 16) / 255.0;

        let mid = 0;
        for (let i = 16; i < 96; i++) mid += freqData[i] || 0;
        mid = (mid / 80) / 255.0;

        // Dark chromatic canvas
        ctx.fillStyle = 'rgba(5, 5, 10, 0.22)';
        ctx.fillRect(0, 0, width, height);

        const time = performance.now() / 1000;

        // Update and draw fluid metaballs with radial gradient blending
        ctx.globalCompositeOperation = 'screen';

        this.blobs.forEach((blob, i) => {
            const fVal = (freqData[i * 4] || 0) / 255.0;
            const currentR = blob.radius * (1.0 + fVal * 0.8 + bass * 0.5);

            blob.x += blob.vx * (1.0 + bass * 2.0);
            blob.y += blob.vy * (1.0 + mid * 2.0);

            if (blob.x < -currentR) blob.x = width + currentR;
            if (blob.x > width + currentR) blob.x = -currentR;
            if (blob.y < -currentR) blob.y = height + currentR;
            if (blob.y > height + currentR) blob.y = -currentR;

            const grad = ctx.createRadialGradient(blob.x, blob.y, currentR * 0.1, blob.x, blob.y, currentR);
            const hue = (blob.hue + time * 20) % 360;
            grad.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.8)`);
            grad.addColorStop(0.5, `hsla(${hue + 40}, 90%, 50%, 0.4)`);
            grad.addColorStop(1, `hsla(${hue + 80}, 80%, 30%, 0)`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(blob.x, blob.y, currentR, 0, Math.PI * 2);
            ctx.fill();
        });

        // Center Pulsing Harmonic Core
        const cx = width / 2;
        const cy = height / 2;
        const coreR = Math.min(width, height) * 0.15 * (1.0 + bass * 0.6);

        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.7 + bass * 0.3})`);
        coreGrad.addColorStop(0.4, `hsla(${(time * 40) % 360}, 100%, 60%, 0.5)`);
        coreGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
    }
};

window.LiquidVisualizer = LiquidVisualizer;
