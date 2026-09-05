// CHRISTOS Master Audio Visualizer Engine
// Featuring Legacy 2D/3D visualizers + NofufAudio Studio Visualizer Engine
// Styles: Bars, Mirror, Wave, Floating Dots, Pulsing Circle with Destination-Out Top Fadeout

const Visualizer = {
    canvas2d: null,
    canvas3d: null,
    ctx: null,
    currentViz: 7, // Default to Xbox 2001 Neon
    animationId: null,
    analyser: null,
    isInitialized: false,

    // NofufAudio Visualizer Settings
    vizSensitivity: 1.5,
    vizOpacity: 90,
    vizShadow: true,
    vizColor: 'accent', // 'accent', '#ffffff', '#38bdf8', '#4ade80', '#f43f5e', '#fbbf24'

    init() {
        if (this.isInitialized) return;

        this.canvas2d = document.getElementById('visualizer-canvas-2d');
        this.canvas3d = document.getElementById('visualizer-canvas-3d');

        if (this.canvas2d) this.ctx = this.canvas2d.getContext('2d');

        // Load saved visualizer preferences
        this.vizSensitivity = parseFloat(localStorage.getItem('christos_viz_sensitivity') || '1.5');
        this.vizOpacity = parseInt(localStorage.getItem('christos_viz_opacity') || '90', 10);
        this.vizShadow = localStorage.getItem('christos_viz_shadow') !== 'false';
        this.vizColor = localStorage.getItem('christos_viz_color') || 'accent';

        this.applyCanvasOpacity();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.isInitialized = true;
    },

    applyCanvasOpacity() {
        if (this.canvas2d) {
            this.canvas2d.style.opacity = (this.vizOpacity / 100).toString();
        }
        if (this.canvas3d) {
            this.canvas3d.style.opacity = (this.vizOpacity / 100).toString();
        }
    },

    getResolvedColor() {
        if (this.vizColor === 'accent' || !this.vizColor) {
            return getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#fa233b';
        }
        return this.vizColor;
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

        const container = document.getElementById('visualizer-container');
        if (this.currentViz === 0) {
            if (this.canvas2d) this.canvas2d.style.display = 'none';
            if (this.canvas3d) this.canvas3d.style.display = 'none';
            if (container) container.classList.remove('viz-active');
            return;
        } else {
            if (container) container.classList.add('viz-active');
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
            case 11:
                this.drawNofufBars(ctx, W, H, freqData);
                break;
            case 12:
                this.drawNofufMirror(ctx, W, H, freqData);
                break;
            case 13:
                this.drawNofufWave(ctx, W, H, freqData);
                break;
            case 14:
                this.drawNofufDots(ctx, W, H, freqData);
                break;
            case 15:
                this.drawNofufCircle(ctx, W, H, freqData);
                break;
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

    // ═══════════════════════════════════════════════════════════════
    // NOFUFAUDIO VISUALIZER SUITE (BARS, MIRROR, WAVE, DOTS, CIRCLE)
    // ═══════════════════════════════════════════════════════════════

    clearCanvasWithBackground(ctx, W, H) {
        ctx.clearRect(0, 0, W, H);
        const grad = ctx.createRadialGradient(W / 2, H * 0.55, 20, W / 2, H * 0.55, Math.max(W, H) * 0.75);
        grad.addColorStop(0, '#131526');
        grad.addColorStop(1, '#07080f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    },

    applyTopFadeout(ctx, W, H) {
        ctx.shadowBlur = 0;
        const fadeH = Math.round(H * 0.35);
        const fade = ctx.createLinearGradient(0, 0, 0, fadeH);
        fade.addColorStop(0, '#07080f');
        fade.addColorStop(0.65, 'rgba(7, 8, 15, 0.65)');
        fade.addColorStop(1, 'rgba(7, 8, 15, 0)');
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, W, fadeH);
    },

    drawNofufBars(ctx, W, H, freqData) {
        this.clearCanvasWithBackground(ctx, W, H);
        const color = this.getResolvedColor();
        const sens = this.vizSensitivity;

        if (this.vizShadow) {
            ctx.shadowBlur = 14;
            ctx.shadowColor = color;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = color;
        const n = freqData.length;
        const useBins = Math.floor(n * 0.60);
        const barW = W / useBins;

        for (let i = 0; i < useBins; i++) {
            const v = (freqData[i] / 255) * sens;
            const bh = Math.min(H, v * H);
            ctx.fillRect(i * barW, H - bh, Math.max(1, barW - 1), bh);
        }

        this.applyTopFadeout(ctx, W, H);
    },

    drawNofufMirror(ctx, W, H, freqData) {
        this.clearCanvasWithBackground(ctx, W, H);
        const color = this.getResolvedColor();
        const sens = this.vizSensitivity;

        if (this.vizShadow) {
            ctx.shadowBlur = 14;
            ctx.shadowColor = color;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = color;
        const n = freqData.length;
        const useBins = Math.floor(n * 0.60);
        const barW = W / useBins;

        for (let i = 0; i < useBins; i++) {
            const v = (freqData[i] / 255) * sens;
            const bh = Math.min(H, v * H);
            ctx.fillRect(i * barW, (H - bh) / 2, Math.max(1, barW - 1), bh);
        }

        this.applyTopFadeout(ctx, W, H);
    },

    drawNofufWave(ctx, W, H, freqData) {
        this.clearCanvasWithBackground(ctx, W, H);
        const color = this.getResolvedColor();
        const sens = this.vizSensitivity;

        if (this.vizShadow) {
            ctx.shadowBlur = 14;
            ctx.shadowColor = color;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        const n = freqData.length;
        const useBins = Math.floor(n * 0.60);

        ctx.beginPath();
        for (let i = 0; i < useBins; i++) {
            const x = (i / useBins) * W;
            const v = (freqData[i] / 255) * sens;
            const y = H - v * H * 0.90;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.stroke();

        this.applyTopFadeout(ctx, W, H);
    },

    drawNofufDots(ctx, W, H, freqData) {
        this.clearCanvasWithBackground(ctx, W, H);
        const color = this.getResolvedColor();
        const sens = this.vizSensitivity;

        if (this.vizShadow) {
            ctx.shadowBlur = 14;
            ctx.shadowColor = color;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = color;
        const n = freqData.length;
        const useBins = Math.floor(n * 0.60);

        for (let i = 0; i < useBins; i++) {
            const x = (i / useBins) * W;
            const v = (freqData[i] / 255) * sens;
            const r = Math.max(1.5, v * 6.5);
            ctx.beginPath();
            ctx.arc(x, H - v * H * 0.85, r, 0, Math.PI * 2);
            ctx.fill();
        }

        this.applyTopFadeout(ctx, W, H);
    },

    drawNofufCircle(ctx, W, H, freqData) {
        this.clearCanvasWithBackground(ctx, W, H);
        const color = this.getResolvedColor();
        const sens = this.vizSensitivity;

        if (this.vizShadow) {
            ctx.shadowBlur = 14;
            ctx.shadowColor = color;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = color;
        ctx.strokeStyle = color;

        const cx = W / 2;
        const cy = H / 2;
        const baseR = Math.min(W, H) * 0.22;
        const n = freqData.length;
        const useBins = Math.floor(n * 0.60);

        ctx.lineWidth = 2.2;
        for (let i = 0; i < useBins; i++) {
            const angle = (i / useBins) * Math.PI * 2 - Math.PI / 2;
            const v = (freqData[i] / 255) * sens;
            const r = baseR + v * baseR * 1.25;
            const x1 = cx + Math.cos(angle) * baseR;
            const y1 = cy + Math.sin(angle) * baseR;
            const x2 = cx + Math.cos(angle) * r;
            const y2 = cy + Math.sin(angle) * r;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1.0;
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

        // Sync pills in settings drawer
        document.querySelectorAll('.viz-style-pill').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            const match = oc.match(/change\((\d+)\)/);
            if (match) {
                btn.classList.toggle('active', parseInt(match[1], 10) === this.currentViz);
            }
        });

        if (typeof Player !== 'undefined' && Player.analyser) {
            this.start(Player.analyser);
        }
    },

    cycle() {
        const next = (this.currentViz % 15) + 1;
        this.change(next);
    },

    // ═══════════════════════════════════════════════════════════════
    // VISUALIZER TUNING DRAWER ENGINE
    // ═══════════════════════════════════════════════════════════════

    setupDrawerEvents() {
        if (this._drawerEventsBound) return;
        this._drawerEventsBound = true;
        document.addEventListener('pointerdown', (e) => {
            const drawer = document.getElementById('viz-settings-drawer');
            if (drawer && drawer.classList.contains('open')) {
                if (!drawer.contains(e.target) && !e.target.closest('[onclick*="toggleSettingsDrawer"]')) {
                    this.closeSettingsDrawer();
                }
            }
        });
    },

    updateDrawerState() {
        const drawer = document.getElementById('viz-settings-drawer');
        if (!drawer) return;

        drawer.querySelectorAll('.viz-style-pill').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            const match = oc.match(/change\((\d+)\)/);
            if (match) {
                btn.classList.toggle('active', parseInt(match[1], 10) === this.currentViz);
            }
        });

        const sensInp = drawer.querySelector('input[type="range"][oninput*="setSensitivity"]');
        if (sensInp) sensInp.value = this.vizSensitivity;
        const sensLbl = document.getElementById('viz-sd-sens-val');
        if (sensLbl) sensLbl.textContent = this.vizSensitivity.toFixed(1) + '×';

        const opInp = drawer.querySelector('input[type="range"][oninput*="setOpacity"]');
        if (opInp) opInp.value = this.vizOpacity;
        const opLbl = document.getElementById('viz-sd-op-val');
        if (opLbl) opLbl.textContent = this.vizOpacity + '%';

        const glowInp = drawer.querySelector('input[type="checkbox"][onchange*="setShadow"]');
        if (glowInp) glowInp.checked = !!this.vizShadow;

        drawer.querySelectorAll('.viz-qc').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.vc === this.vizColor);
        });
    },

    toggleSettingsDrawer() {
        let drawer = document.getElementById('viz-settings-drawer');
        if (!drawer) {
            this.createSettingsDrawer();
            drawer = document.getElementById('viz-settings-drawer');
        }
        this.setupDrawerEvents();
        this.updateDrawerState();
        drawer.classList.toggle('open');
    },

    openSettingsDrawer() {
        let drawer = document.getElementById('viz-settings-drawer');
        if (!drawer) {
            this.createSettingsDrawer();
            drawer = document.getElementById('viz-settings-drawer');
        }
        this.setupDrawerEvents();
        this.updateDrawerState();
        drawer.classList.add('open');
    },

    closeSettingsDrawer() {
        const drawer = document.getElementById('viz-settings-drawer');
        if (drawer) drawer.classList.remove('open');
    },

    setSensitivity(val) {
        this.vizSensitivity = parseFloat(val);
        localStorage.setItem('christos_viz_sensitivity', this.vizSensitivity);
        const lbl = document.getElementById('viz-sd-sens-val');
        if (lbl) lbl.textContent = this.vizSensitivity.toFixed(1) + '×';
    },

    setOpacity(val) {
        this.vizOpacity = parseInt(val, 10);
        localStorage.setItem('christos_viz_opacity', this.vizOpacity);
        this.applyCanvasOpacity();
        const lbl = document.getElementById('viz-sd-op-val');
        if (lbl) lbl.textContent = this.vizOpacity + '%';
    },

    setShadow(val) {
        this.vizShadow = !!val;
        localStorage.setItem('christos_viz_shadow', this.vizShadow);
    },

    setColor(val) {
        this.vizColor = val;
        localStorage.setItem('christos_viz_color', this.vizColor);
        document.querySelectorAll('.viz-qc').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.vc === val);
        });
    },

    createSettingsDrawer() {
        const drawer = document.createElement('div');
        drawer.id = 'viz-settings-drawer';
        drawer.className = 'viz-settings-drawer';

        const curSens = this.vizSensitivity;
        const curOp = this.vizOpacity;
        const curGlow = this.vizShadow;
        const curColor = this.vizColor;

        drawer.innerHTML = `
            <div class="viz-drawer-header">
                <div style="display:flex; align-items:center; gap:8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent-color)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <h4 style="margin:0; font-size:1rem; font-weight:700; color:#fff;">Visualizer Tuning</h4>
                </div>
                <button class="fullscreen-exit-btn" onclick="Visualizer.closeSettingsDrawer()">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            <!-- Style Selector Pills -->
            <div style="margin-bottom:16px;">
                <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:6px; font-weight:600;">ACTIVE STYLE</label>
                <div class="viz-style-grid">
                    <button class="viz-style-pill ${this.currentViz===11?'active':''}" onclick="Visualizer.change(11)">Nofuf Bars</button>
                    <button class="viz-style-pill ${this.currentViz===12?'active':''}" onclick="Visualizer.change(12)">Mirror Bars</button>
                    <button class="viz-style-pill ${this.currentViz===13?'active':''}" onclick="Visualizer.change(13)">Audio Wave</button>
                    <button class="viz-style-pill ${this.currentViz===14?'active':''}" onclick="Visualizer.change(14)">Star Dots</button>
                    <button class="viz-style-pill ${this.currentViz===15?'active':''}" onclick="Visualizer.change(15)">Core Circle</button>
                    <button class="viz-style-pill ${this.currentViz===7?'active':''}" onclick="Visualizer.change(7)">Xbox 2001</button>
                    <button class="viz-style-pill ${this.currentViz===8?'active':''}" onclick="Visualizer.change(8)">Synthwave</button>
                    <button class="viz-style-pill ${this.currentViz===9?'active':''}" onclick="Visualizer.change(9)">VU Meter</button>
                </div>
            </div>

            <!-- Sensitivity -->
            <div style="margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span style="font-size:0.8rem; color:#fff; font-weight:600;">Sensitivity</span>
                    <span id="viz-sd-sens-val" style="font-size:0.8rem; color:var(--accent-color); font-weight:700;">${curSens.toFixed(1)}×</span>
                </div>
                <input type="range" min="0.5" max="3.0" step="0.1" value="${curSens}" oninput="Visualizer.setSensitivity(this.value)" style="width:100%;">
                <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:#777; margin-top:2px;">
                    <span>0.5× Calm</span><span>1.5× Default</span><span>3.0× High</span>
                </div>
            </div>

            <!-- Opacity -->
            <div style="margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span style="font-size:0.8rem; color:#fff; font-weight:600;">Opacity</span>
                    <span id="viz-sd-op-val" style="font-size:0.8rem; color:var(--accent-color); font-weight:700;">${curOp}%</span>
                </div>
                <input type="range" min="20" max="100" step="5" value="${curOp}" oninput="Visualizer.setOpacity(this.value)" style="width:100%;">
            </div>

            <!-- Glow / Shadow -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <span style="font-size:0.8rem; color:#fff; font-weight:600;">Neon Shadow Glow</span>
                <label class="switch-toggle" style="cursor:pointer;">
                    <input type="checkbox" ${curGlow?'checked':''} onchange="Visualizer.setShadow(this.checked)">
                    <span style="color:var(--text-secondary); font-size:0.75rem;">Enable</span>
                </label>
            </div>

            <!-- Color Options -->
            <div>
                <label style="display:block; font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px; font-weight:600;">COLOR THEME</label>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="viz-qc ${curColor==='accent'?'active':''}" data-vc="accent" onclick="Visualizer.setColor('accent')" title="Theme Accent" style="background:var(--accent-color);"></button>
                    <button class="viz-qc ${curColor==='#ffffff'?'active':''}" data-vc="#ffffff" onclick="Visualizer.setColor('#ffffff')" title="Pure White" style="background:#ffffff;"></button>
                    <button class="viz-qc ${curColor==='#38bdf8'?'active':''}" data-vc="#38bdf8" onclick="Visualizer.setColor('#38bdf8')" title="Electric Cyan" style="background:#38bdf8;"></button>
                    <button class="viz-qc ${curColor==='#4ade80'?'active':''}" data-vc="#4ade80" onclick="Visualizer.setColor('#4ade80')" title="Matrix Green" style="background:#4ade80;"></button>
                    <button class="viz-qc ${curColor==='#f43f5e'?'active':''}" data-vc="#f43f5e" onclick="Visualizer.setColor('#f43f5e')" title="Neon Pink" style="background:#f43f5e;"></button>
                    <button class="viz-qc ${curColor==='#fbbf24'?'active':''}" data-vc="#fbbf24" onclick="Visualizer.setColor('#fbbf24')" title="Amber Sun" style="background:#fbbf24;"></button>
                </div>
            </div>
        `;

        document.body.appendChild(drawer);
    }
};

window.Visualizer = Visualizer;
window.changeVisualizer = (vizId) => Visualizer.change(vizId);
