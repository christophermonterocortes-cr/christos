// CHRISTOS Visualizer 9: Audiophile Dual Analog VU Meters
const VUMeterVisualizer = {
    leftNeedle: 0,
    rightNeedle: 0,
    leftVelocity: 0,
    rightVelocity: 0,

    draw(ctx, width, height, freqData, timeData) {
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, width, height);

        // Calculate stereo/frequency energies
        let leftEnergy = 0;
        let rightEnergy = 0;
        const half = Math.floor(freqData.length / 2);
        for (let i = 0; i < half; i++) leftEnergy += freqData[i] || 0;
        for (let i = half; i < freqData.length; i++) rightEnergy += freqData[i] || 0;

        const leftTarget = Math.min(1.0, (leftEnergy / half) / 160.0);
        const rightTarget = Math.min(1.0, (rightEnergy / half) / 160.0);

        // Realistic ballistic needle spring physics
        const spring = 0.22;
        const damping = 0.72;

        this.leftVelocity += (leftTarget - this.leftNeedle) * spring;
        this.leftVelocity *= damping;
        this.leftNeedle = Math.max(0, Math.min(1.15, this.leftNeedle + this.leftVelocity));

        this.rightVelocity += (rightTarget - this.rightNeedle) * spring;
        this.rightVelocity *= damping;
        this.rightNeedle = Math.max(0, Math.min(1.15, this.rightNeedle + this.rightVelocity));

        // Draw dual meter housing
        const margin = Math.min(width, height) * 0.06;
        const meterW = Math.min(500, (width - margin * 3) / 2);
        const meterH = meterW * 0.65;
        const centerY = height / 2;

        const leftX = (width / 2) - meterW - (margin / 2);
        const rightX = (width / 2) + (margin / 2);
        const meterY = centerY - (meterH / 2);

        this.renderSingleMeter(ctx, leftX, meterY, meterW, meterH, this.leftNeedle, 'LEFT CHANNEL');
        this.renderSingleMeter(ctx, rightX, meterY, meterW, meterH, this.rightNeedle, 'RIGHT CHANNEL');
    },

    renderSingleMeter(ctx, x, y, w, h, val, channelLabel) {
        ctx.save();
        
        // Meter Outer Bezel & Brushed Aluminum Frame
        ctx.fillStyle = '#1e1e24';
        ctx.strokeStyle = '#3a3a46';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 14);
        ctx.fill();
        ctx.stroke();

        // Meter Faceplate (Warm Vintage Amber Glow)
        const faceMargin = 12;
        const faceX = x + faceMargin;
        const faceY = y + faceMargin;
        const faceW = w - faceMargin * 2;
        const faceH = h - faceMargin * 2;

        const faceGrad = ctx.createRadialGradient(faceX + faceW/2, faceY + faceH * 0.9, faceH * 0.2, faceX + faceW/2, faceY + faceH/2, faceW * 0.7);
        faceGrad.addColorStop(0, '#f9ecd0');
        faceGrad.addColorStop(0.8, '#e6d3a7');
        faceGrad.addColorStop(1, '#c5ad7a');
        ctx.fillStyle = faceGrad;
        ctx.beginPath();
        ctx.roundRect(faceX, faceY, faceW, faceH, 8);
        ctx.fill();

        // Inner shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Meter Pivot Point at bottom center of faceplate
        const pivotX = faceX + faceW / 2;
        const pivotY = faceY + faceH * 1.12;
        const radius = faceH * 0.88;

        // Draw Arc Scales (-20dB to +3dB)
        const startAngle = -Math.PI * 0.75;
        const endAngle = -Math.PI * 0.25;

        // Normal zone arc (Black: -20 to 0 dB)
        const zeroAngle = startAngle + (endAngle - startAngle) * 0.72;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, radius, startAngle, zeroAngle);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Redline peak zone arc (Red: 0 to +3 dB)
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, radius, zeroAngle, endAngle);
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Scale Ticks & dB Labels
        const dbMarks = [
            { val: 0.0, label: '-20' },
            { val: 0.2, label: '-10' },
            { val: 0.4, label: '-7' },
            { val: 0.55, label: '-5' },
            { val: 0.65, label: '-3' },
            { val: 0.72, label: '0' },
            { val: 0.85, label: '+1' },
            { val: 0.94, label: '+2' },
            { val: 1.0, label: '+3' }
        ];

        ctx.font = `bold ${Math.max(9, Math.round(w * 0.032))}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        dbMarks.forEach(mark => {
            const angle = startAngle + (endAngle - startAngle) * mark.val;
            const isRed = mark.val >= 0.72;
            ctx.fillStyle = isRed ? '#c0392b' : '#222';
            ctx.strokeStyle = isRed ? '#c0392b' : '#222';

            const x1 = pivotX + Math.cos(angle) * (radius - 8);
            const y1 = pivotY + Math.sin(angle) * (radius - 8);
            const x2 = pivotX + Math.cos(angle) * (radius + 2);
            const y2 = pivotY + Math.sin(angle) * (radius + 2);

            ctx.lineWidth = mark.val === 0.72 ? 2.5 : 1.5;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            const lx = pivotX + Math.cos(angle) * (radius - 18);
            const ly = pivotY + Math.sin(angle) * (radius - 18);
            ctx.fillText(mark.label, lx, ly);
        });

        // "VU" and Channel Labels
        ctx.fillStyle = '#333';
        ctx.font = `bold ${Math.max(12, Math.round(w * 0.045))}px -apple-system, sans-serif`;
        ctx.fillText('VU', pivotX, faceY + faceH * 0.42);
        ctx.font = `600 ${Math.max(9, Math.round(w * 0.026))}px -apple-system, sans-serif`;
        ctx.fillStyle = '#665533';
        ctx.fillText(channelLabel, pivotX, faceY + faceH * 0.54);

        // Peak Indicator LED
        const ledX = faceX + faceW * 0.85;
        const ledY = faceY + faceH * 0.22;
        const isPeaking = val >= 0.75;
        ctx.beginPath();
        ctx.arc(ledX, ledY, 5, 0, Math.PI * 2);
        ctx.fillStyle = isPeaking ? '#ff2222' : '#551111';
        if (isPeaking) {
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 12;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#444';
        ctx.font = '8px sans-serif';
        ctx.fillText('PEAK', ledX, ledY + 10);

        // Draw Needle with ballistic shadow
        const needleAngle = startAngle + (endAngle - startAngle) * val;
        const needleLen = radius + 8;
        const needleTipX = pivotX + Math.cos(needleAngle) * needleLen;
        const needleTipY = pivotY + Math.sin(needleAngle) * needleLen;

        // Needle Shadow
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pivotX + 3, pivotY + 3);
        ctx.lineTo(needleTipX + 4, needleTipY + 4);
        ctx.stroke();

        // Needle Line (Gloss black with sharp red tip)
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(needleTipX, needleTipY);
        ctx.stroke();

        // Needle Center Hub
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#222';
        ctx.fill();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }
};

window.VUMeterVisualizer = VUMeterVisualizer;
