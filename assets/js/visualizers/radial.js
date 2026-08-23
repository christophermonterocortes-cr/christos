const Radial = {
    drawDirect(ctx, W, H, dataArray) {
        const cx = W / 2;
        const cy = H / 2;
        const radius = Math.min(W, H) * 0.22;

        ctx.fillStyle = 'rgba(8, 8, 14, 0.25)';
        ctx.fillRect(0, 0, W, H);

        const numPoints = 120;
        const step = (Math.PI * 2) / numPoints;

        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
            const angle = i * step;
            const dataIndex = Math.floor((i / numPoints) * (dataArray.length * 0.6));
            const val = dataArray[dataIndex] || 0;
            const r = radius + (val / 255) * (Math.min(W, H) * 0.22);

            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();

        const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.8);
        grad.addColorStop(0, 'rgba(250, 35, 59, 0.4)');
        grad.addColorStop(0.5, 'rgba(0, 240, 255, 0.3)');
        grad.addColorStop(1, 'rgba(255, 0, 128, 0)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
};

window.Radial = Radial;