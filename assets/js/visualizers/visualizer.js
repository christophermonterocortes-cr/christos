// CHRISTOS Master Audio Visualizer Engine
const Visualizer = {
    canvas2d: null,
    canvas3d: null,
    ctx: null,
    currentViz: 7, // Default to Xbox 2001 Neon
    animationId: null,
    analyser: null,
    isInitialized: false,

    init() {
        if (this.isInitialized) return;

        this.canvas2d = document.getElementById('visualizer-canvas-2d');
        this.canvas3d = document.getElementById('visualizer-canvas-3d');

        if (this.canvas2d) this.ctx = this.canvas2d.getContext('2d');

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.isInitialized = true;
    },

    resize() {
        const targetW = window.innerWidth;
        const targetH = window.innerHeight;

        const container = document.getElementById('visualizer-container');
        if (container) {
            container.classList.remove('docked-fullscreen');
            container.classList.remove('ambient-fullscreen');
        }

        if (this.canvas2d) {
            this.canvas2d.width = Math.max(300, targetW);
            this.canvas2d.height = Math.max(200, targetH);
        }
        if (this.canvas3d) {
            this.canvas3d.width = Math.max(300, targetW);
            this.canvas3d.height = Math.max(200, targetH);
            if (typeof Sphere !== 'undefined' && Sphere.onResize) Sphere.onResize(this.canvas3d.width, this.canvas3d.height);
            if (typeof Particles !== 'undefined' && Particles.onResize) Particles.onResize(this.canvas3d.width, this.canvas3d.height);
        }
    },

    start(analyser) {
        if (!this.isInitialized) this.init();
        if (analyser) this.analyser = analyser;
        if (!this.analyser) return;

        this.stop();
        this.resize();

        const is3D = (this.currentViz === 4 || this.currentViz === 5);

        if (this.currentViz === 0) {
            if (this.canvas2d) this.canvas2d.style.display = 'none';
            if (this.canvas3d) this.canvas3d.style.display = 'none';
            return;
        }

        if (is3D) {
            if (this.canvas2d) this.canvas2d.style.display = 'none';
            if (this.canvas3d) this.canvas3d.style.display = 'block';
        } else {
            if (this.canvas3d) this.canvas3d.style.display = 'none';
            if (this.canvas2d) this.canvas2d.style.display = 'block';
        }

        const bufferLength = this.analyser.frequencyBinCount;
        const freqData = new Uint8Array(bufferLength);
        const timeData = new Uint8Array(bufferLength);

        const render = () => {
            this.animationId = requestAnimationFrame(render);
            this.analyser.getByteFrequencyData(freqData);
            this.analyser.getByteTimeDomainData(timeData);

            // Energy check & harmonic pulse safeguard so visualizer NEVER goes black
            let totalEnergy = 0;
            for (let i = 0; i < 32; i++) totalEnergy += freqData[i] || 0;

            if (totalEnergy < 5) {
                const idleT = performance.now() / 1000;
                for (let i = 0; i < 64; i++) {
                    freqData[i] = Math.floor(Math.sin(idleT * 3.5 + i * 0.15) * 45 + 55);
                    timeData[i] = Math.floor(Math.sin(idleT * 2.5 + i * 0.08) * 30 + 128);
                }
            }

            if (!is3D && this.ctx && this.canvas2d) {
                const W = this.canvas2d.width;
                const H = this.canvas2d.height;
                this.drawViz(this.ctx, W, H, freqData, timeData);
            } else if (is3D && this.canvas3d) {
                if (this.currentViz === 4 && typeof Sphere !== 'undefined') {
                    if (!Sphere.isInit) Sphere.init(this.canvas3d);
                    Sphere.draw(this.analyser);
                } else if (this.currentViz === 5 && typeof Particles !== 'undefined') {
                    if (!Particles.isInit) Particles.init(this.canvas3d);
                    Particles.draw(this.analyser);
                }
            }
        };

        render();
    },

    drawViz(ctx, W, H, freqData, timeData) {
        if (!ctx || W <= 0 || H <= 0) return;

        switch (this.currentViz) {
            case 7:
                if (typeof XboxVisualizer !== 'undefined') {
                    XboxVisualizer.draw(ctx, W, H, freqData, timeData);
                }
                break;
            case 8:
                if (typeof SynthwaveVisualizer !== 'undefined') {
                    SynthwaveVisualizer.draw(ctx, W, H, freqData, timeData);
                }
                break;
            case 9:
                if (typeof VUMeterVisualizer !== 'undefined') {
                    VUMeterVisualizer.draw(ctx, W, H, freqData, timeData);
                }
                break;
            case 10:
                if (typeof LiquidVisualizer !== 'undefined') {
                    LiquidVisualizer.draw(ctx, W, H, freqData, timeData);
                }
                break;
            case 1:
                this.drawNCS(ctx, W, H, freqData);
                break;
            case 2:
                if (typeof Bars !== 'undefined') Bars.drawDirect(ctx, W, H, freqData);
                break;
            case 3:
                if (typeof Wave !== 'undefined') Wave.drawDirect(ctx, W, H, timeData);
                break;
            case 6:
                if (typeof Radial !== 'undefined') Radial.drawDirect(ctx, W, H, freqData);
                break;
            default:
                if (typeof XboxVisualizer !== 'undefined') {
                    XboxVisualizer.draw(ctx, W, H, freqData, timeData);
                } else {
                    this.drawNCS(ctx, W, H, freqData);
                }
                break;
        }
    },

    drawNCS(ctx, W, H, dataArray) {
        const cx = W / 2;
        const cy = H / 2;

        ctx.fillStyle = 'rgba(6, 6, 12, 0.28)';
        ctx.fillRect(0, 0, W, H);

        let bassSum = 0;
        const bassCount = 16;
        for (let i = 0; i < bassCount; i++) bassSum += dataArray[i] || 0;
        const bassAvg = bassSum / bassCount;
        const baseRadius = Math.min(W, H) * 0.18 + (bassAvg * 0.35);

        // Center Radial Pulsing Core
        const glow = ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * 1.8);
        glow.addColorStop(0, `rgba(250, 35, 59, ${0.4 + (bassAvg / 350)})`);
        glow.addColorStop(0.5, 'rgba(255, 0, 128, 0.2)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // 90 High-Energy Frequency Spikes
        const numBars = 90;
        const step = (Math.PI * 2) / numBars;

        for (let i = 0; i < numBars; i++) {
            const angle = i * step;
            const dataIndex = Math.floor((i / numBars) * (dataArray.length * 0.7));
            const val = dataArray[dataIndex] || 0;
            const barHeight = (val / 255) * (Math.min(W, H) * 0.28);

            const x1 = cx + Math.cos(angle) * baseRadius;
            const y1 = cy + Math.sin(angle) * baseRadius;
            const x2 = cx + Math.cos(angle) * (baseRadius + barHeight + 4);
            const y2 = cy + Math.sin(angle) * (baseRadius + barHeight + 4);

            const hue = (i / numBars) * 360;
            ctx.strokeStyle = `hsl(${hue}, 100%, ${55 + (val / 255) * 40}%)`;
            ctx.lineWidth = Math.max(3.0, (W / 700) * 3.5);
            ctx.lineCap = 'round';

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Center Halo Ring
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#fa233b';
        ctx.stroke();
        ctx.shadowBlur = 0;
    },

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.ctx && this.canvas2d) {
            this.ctx.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
        }
    },

    change(vizId) {
        this.currentViz = parseInt(vizId, 10);
        
        document.querySelectorAll('.viz-select, #visualizer-select, .viz-select-fs, #fullscreen-viz-select, #settings-default-viz').forEach(sel => {
            sel.value = this.currentViz;
        });

        if (typeof Player !== 'undefined' && Player.analyser) {
            this.start(Player.analyser);
        }
    },

    cycle() {
        const next = (this.currentViz % 10) + 1;
        this.change(next);
    }
};

window.Visualizer = Visualizer;
window.changeVisualizer = (vizId) => Visualizer.change(vizId);