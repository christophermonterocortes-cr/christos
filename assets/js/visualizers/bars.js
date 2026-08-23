const Bars = {
    peaks: [],

    drawDirect(ctx, W, H, dataArray) {
        if (!this.peaks || this.peaks.length !== dataArray.length) {
            this.peaks = new Array(dataArray.length).fill(0);
        }

        ctx.fillStyle = 'rgba(8, 8, 14, 0.28)';
        ctx.fillRect(0, 0, W, H);

        const numBars = Math.min(64, Math.floor(W / 14));
        const barWidth = (W / numBars) * 0.75;
        const gap = (W / numBars) * 0.25;

        const grad = ctx.createLinearGradient(0, H, 0, H * 0.15);
        grad.addColorStop(0, '#fa233b');
        grad.addColorStop(0.4, '#ff7a00');
        grad.addColorStop(0.8, '#00f0ff');
        grad.addColorStop(1, '#ffffff');

        for (let i = 0; i < numBars; i++) {
            const dataIndex = Math.floor((i / numBars) * (dataArray.length * 0.8));
            const value = dataArray[dataIndex] || 0;
            const barHeight = (value / 255) * (H * 0.72);
            const x = i * (barWidth + gap) + (gap / 2);
            const y = H - barHeight;

            if (barHeight > this.peaks[i]) {
                this.peaks[i] = barHeight;
            } else {
                this.peaks[i] = Math.max(0, this.peaks[i] - 2.2);
            }

            ctx.fillStyle = grad;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, barWidth, barHeight, [6, 6, 0, 0]);
            } else {
                ctx.rect(x, y, barWidth, barHeight);
            }
            ctx.fill();

            if (this.peaks[i] > 3) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x, H - this.peaks[i] - 4, barWidth, 3);
            }
        }
    }
};

window.Bars = Bars;