const NCS = {
    animationId: null,

    draw(analyser, ctx) {
        this.stop();
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const render = () => {
            this.animationId = requestAnimationFrame(render);
            Visualizer.animationId = this.animationId;
            analyser.getByteFrequencyData(dataArray);

            const W = ctx.canvas.width;
            const H = ctx.canvas.height;
            const cx = W / 2;
            const cy = H / 2;

            ctx.fillStyle = 'rgba(10, 10, 15, 0.25)';
            ctx.fillRect(0, 0, W, H);

            // Calculate average bass
            let bassSum = 0;
            const bassCount = Math.min(16, bufferLength);
            for (let i = 0; i < bassCount; i++) {
                bassSum += dataArray[i];
            }
            const bassAvg = bassSum / bassCount;
            const baseRadius = Math.min(W, H) * 0.15 + (bassAvg * 0.35);

            // Center glow
            const glow = ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * 1.5);
            glow.addColorStop(0, `rgba(250, 35, 59, ${0.15 + (bassAvg / 512)})`);
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, cy, baseRadius * 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Circular frequency bars
            const numBars = 90;
            const step = (Math.PI * 2) / numBars;

            for (let i = 0; i < numBars; i++) {
                const angle = i * step;
                const dataIndex = Math.floor((i / numBars) * (bufferLength * 0.7));
                const val = dataArray[dataIndex] || 0;
                const barHeight = (val / 255) * (Math.min(W, H) * 0.22);

                const x1 = cx + Math.cos(angle) * baseRadius;
                const y1 = cy + Math.sin(angle) * baseRadius;
                const x2 = cx + Math.cos(angle) * (baseRadius + barHeight + 4);
                const y2 = cy + Math.sin(angle) * (baseRadius + barHeight + 4);

                const hue = (i / numBars) * 360;
                ctx.strokeStyle = `hsl(${hue}, 85%, ${50 + (val / 255) * 30}%)`;
                ctx.lineWidth = Math.max(2, (W / 1920) * 4);
                ctx.lineCap = 'round';

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            // Center Ring
            ctx.beginPath();
            ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fa233b';
            ctx.stroke();
            ctx.shadowBlur = 0;
        };

        render();
    },

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
};

window.NCS = NCS;