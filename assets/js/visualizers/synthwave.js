// CHRISTOS Visualizer 8: Cyberpunk Synthwave 3D Grid & Pulsing Neon Sun
const SynthwaveVisualizer = {
    offset: 0,
    mountains: [],

    init() {
        this.mountains = [];
        for (let i = 0; i < 40; i++) {
            this.mountains.push(Math.random() * 80 + 20);
        }
    },

    draw(ctx, width, height, freqData, timeData) {
        if (this.mountains.length === 0) this.init();

        const cx = width / 2;
        const horizonY = height * 0.55;

        let bass = 0;
        for (let i = 0; i < 16; i++) bass += freqData[i] || 0;
        bass = (bass / 16) / 255.0;

        let treble = 0;
        for (let i = 80; i < 160; i++) treble += freqData[i] || 0;
        treble = (treble / 80) / 255.0;

        // 1. Dark retrowave sky with star particles
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, '#05021a');
        skyGrad.addColorStop(0.6, '#180436');
        skyGrad.addColorStop(1, '#3b064d');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, horizonY);

        // 2. Pulsing Neon Sun
        const sunRadius = Math.min(width, height) * 0.18 + (bass * 30);
        const sunX = cx;
        const sunY = horizonY - sunRadius * 0.5;

        ctx.save();
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
        const sunGrad = ctx.createLinearGradient(sunX, sunY - sunRadius, sunX, sunY + sunRadius);
        sunGrad.addColorStop(0, '#fffa65');
        sunGrad.addColorStop(0.4, '#ff3838');
        sunGrad.addColorStop(0.8, '#ff1361');
        sunGrad.addColorStop(1, '#5e0b68');
        ctx.fillStyle = sunGrad;
        ctx.shadowColor = '#ff3838';
        ctx.shadowBlur = 40 + bass * 40;
        ctx.fill();

        // Sun horizontal laser bars
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#05021a';
        for (let i = 1; i <= 7; i++) {
            const barH = 2 + i * 1.5;
            const barY = sunY + (i * (sunRadius / 7.5)) - 10;
            if (barY < horizonY) {
                ctx.fillRect(sunX - sunRadius, barY, sunRadius * 2, barH);
            }
        }
        ctx.restore();

        // 3. Mountains silhouette reacting to audio frequencies
        ctx.fillStyle = '#10052b';
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        const mountainSegments = 24;
        const mStep = width / mountainSegments;
        for (let i = 0; i <= mountainSegments; i++) {
            const fIdx = Math.floor((i / mountainSegments) * (freqData.length * 0.4));
            const audioElev = (freqData[fIdx] || 0) * 0.5;
            const baseH = (i % 2 === 0 ? 50 : 90) + audioElev;
            const my = horizonY - baseH;
            ctx.lineTo(i * mStep, my);
        }
        ctx.lineTo(width, horizonY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 4. Ground Grid in 3D Perspective
        const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
        groundGrad.addColorStop(0, '#000000');
        groundGrad.addColorStop(1, '#0c021c');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, horizonY, width, height - horizonY);

        this.offset = (this.offset + 2 + bass * 8) % 40;

        ctx.save();
        ctx.strokeStyle = '#00f7ff';
        ctx.shadowColor = '#00f7ff';
        ctx.shadowBlur = 8 + bass * 12;
        ctx.lineWidth = 1.5;

        // Perspective vertical vanishing lines
        const numVLines = 24;
        for (let i = -numVLines; i <= numVLines; i++) {
            const bottomX = cx + i * (width / 12);
            ctx.beginPath();
            ctx.moveTo(cx + i * 2, horizonY);
            ctx.lineTo(bottomX, height);
            ctx.stroke();
        }

        // Perspective horizontal scrolling lines
        const numHLines = 14;
        for (let i = 0; i < numHLines; i++) {
            const normalized = ((i * 40 + this.offset) % (numHLines * 40)) / (numHLines * 40);
            const hy = horizonY + Math.pow(normalized, 2.2) * (height - horizonY);
            ctx.beginPath();
            ctx.moveTo(0, hy);
            ctx.lineTo(width, hy);
            ctx.stroke();
        }
        ctx.restore();

        // Horizon neon glow laser
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(width, horizonY);
        ctx.stroke();
    }
};

window.SynthwaveVisualizer = SynthwaveVisualizer;
