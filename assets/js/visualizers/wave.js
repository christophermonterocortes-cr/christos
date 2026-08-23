const Wave = {
    drawDirect(ctx, W, H, dataArray) {
        ctx.fillStyle = 'rgba(8, 8, 14, 0.25)';
        ctx.fillRect(0, 0, W, H);

        const sliceWidth = W / dataArray.length;
        
        // Outer cyan glow wave
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 18;

        ctx.beginPath();
        let x = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * H) / 2;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);

            x += sliceWidth;
        }
        ctx.lineTo(W, H / 2);
        ctx.stroke();

        // Inner white laser core
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        x = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * H) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
        }
        ctx.lineTo(W, H / 2);
        ctx.stroke();
    }
};

window.Wave = Wave;