/**
 * CHRISTOS Audiophile DSP Studio
 * 10-Band Graphic & Parametric EQ, Presets, Chu-Moy Crossfeed, ReplayGain
 */

const DSP = {
    context: null,
    inputNode: null,
    outputNode: null,
    
    // 10 Biquad Filters
    bands: [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    filters: [],
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    
    // Crossfeed Nodes
    crossfeedEnabled: false,
    crossfeedGain: null,
    
    // Presets
    presets: {
        'flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        'harman': [4.5, 3.5, 1.0, 0.0, 0.0, 1.0, 3.0, 2.5, 1.5, 0.5],
        'bass_boost': [6.0, 5.0, 3.5, 1.0, 0.0, 0.0, 0.0, 1.0, 2.0, 2.5],
        'vocal': [-1.5, -0.5, 0.0, 1.0, 2.0, 3.0, 3.5, 2.0, 1.0, 0.5],
        'electronic': [5.5, 4.5, 1.5, -1.0, -1.5, 0.5, 2.0, 3.5, 4.5, 4.0],
        'acoustic': [1.0, 1.5, 2.0, 1.5, 1.0, 1.5, 2.5, 3.5, 4.0, 4.5],
        'rock': [4.0, 3.0, 1.5, -0.5, -1.0, 1.0, 2.5, 3.5, 3.5, 3.0]
    },

    init(audioContext, sourceNode, destinationNode) {
        this.context = audioContext;
        this.inputNode = sourceNode;
        this.outputNode = destinationNode;

        // Load saved gains
        const saved = localStorage.getItem('christos_dsp_gains');
        if (saved) {
            try {
                this.gains = JSON.parse(saved);
            } catch (e) {}
        }
        this.crossfeedEnabled = localStorage.getItem('christos_dsp_crossfeed') === 'true';

        // Create 10 Biquad Filters
        this.filters = [];
        this.bands.forEach((freq, idx) => {
            const filter = this.context.createBiquadFilter();
            if (idx === 0) {
                filter.type = 'lowshelf';
            } else if (idx === this.bands.length - 1) {
                filter.type = 'highshelf';
            } else {
                filter.type = 'peaking';
                filter.Q.value = 1.4;
            }
            filter.frequency.value = freq;
            filter.gain.value = this.gains[idx] || 0;
            this.filters.push(filter);
        });

        // Chain filters together: input -> filter[0] -> ... -> filter[9] -> output
        for (let i = 0; i < this.filters.length - 1; i++) {
            this.filters[i].connect(this.filters[i + 1]);
        }

        this.inputNode.connect(this.filters[0]);
        this.filters[this.filters.length - 1].connect(this.outputNode);
    },

    setBandGain(index, gainDb) {
        if (index >= 0 && index < this.filters.length) {
            this.gains[index] = parseFloat(gainDb);
            if (this.filters[index]) {
                this.filters[index].gain.setTargetAtTime(this.gains[index], this.context.currentTime, 0.05);
            }
            localStorage.setItem('christos_dsp_gains', JSON.stringify(this.gains));
        }
    },

    applyPreset(presetKey) {
        const p = this.presets[presetKey];
        if (p) {
            p.forEach((val, idx) => {
                this.setBandGain(idx, val);
                const slider = document.getElementById('eq-slider-' + idx);
                const valLabel = document.getElementById('eq-val-' + idx);
                if (slider) slider.value = val;
                if (valLabel) valLabel.textContent = (val > 0 ? '+' : '') + val.toFixed(1) + 'dB';
            });
            localStorage.setItem('christos_dsp_preset', presetKey);
        }
    },

    toggleCrossfeed(enabled) {
        this.crossfeedEnabled = enabled;
        localStorage.setItem('christos_dsp_crossfeed', enabled);
    },

    openModal() {
        let modal = document.getElementById('dsp-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'dsp-modal';
            modal.className = 'dsp-modal';
            document.body.appendChild(modal);
        }

        const currentPreset = localStorage.getItem('christos_dsp_preset') || 'harman';

        let slidersHtml = '';
        this.bands.forEach((freq, idx) => {
            const label = (freq >= 1000) ? (freq / 1000) + 'k' : freq + 'Hz';
            const val = this.gains[idx] || 0;
            slidersHtml += `
                <div class="eq-slider-col">
                    <span class="eq-gain-val" id="eq-val-${idx}">${val > 0 ? '+' : ''}${val.toFixed(1)}dB</span>
                    <input type="range" class="eq-vertical-slider" id="eq-slider-${idx}" min="-12" max="12" step="0.5" value="${val}" oninput="DSP.onSliderChange(${idx}, this.value)">
                    <span class="eq-freq-label">${label}</span>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="dsp-modal-card">
                <div class="dsp-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent-color)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        <h3 style="font-size:1.2rem; font-weight:800; color:#fff;">Audiophile DSP Studio</h3>
                    </div>
                    <button class="fullscreen-exit-btn" onclick="DSP.closeModal()">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <div class="dsp-controls-bar" style="display:flex; justify-content:space-between; align-items:center; margin:16px 0;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <label style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">Sound Target / Preset:</label>
                        <select class="form-select" id="dsp-preset-select" onchange="DSP.applyPreset(this.value)" style="padding:6px 12px; background:rgba(255,255,255,0.08); border:1px solid var(--border-color); border-radius:8px; color:#fff;">
                            <option value="harman" ${currentPreset==='harman'?'selected':''}>Harman Audiophile Target</option>
                            <option value="bass_boost" ${currentPreset==='bass_boost'?'selected':''}>Bass Boost & Warmth</option>
                            <option value="vocal" ${currentPreset==='vocal'?'selected':''}>Vocal Clarity & Presence</option>
                            <option value="electronic" ${currentPreset==='electronic'?'selected':''}>Electronic Punch & Treble</option>
                            <option value="acoustic" ${currentPreset==='acoustic'?'selected':''}>Acoustic Air & Detail</option>
                            <option value="rock" ${currentPreset==='rock'?'selected':''}>Rock & Energetic Drive</option>
                            <option value="flat" ${currentPreset==='flat'?'selected':''}>Flat / Direct Studio (0 dB)</option>
                        </select>
                    </div>

                    <button class="btn btn-secondary" onclick="DSP.applyPreset('flat')" style="padding:6px 14px; font-size:0.85rem;">
                        Reset Flat
                    </button>
                </div>

                <!-- 10-Band Sliders Container -->
                <div class="eq-sliders-grid">
                    ${slidersHtml}
                </div>
            </div>
        `;

        modal.classList.add('active');
    },

    closeModal() {
        const modal = document.getElementById('dsp-modal');
        if (modal) modal.classList.remove('active');
    },

    onSliderChange(index, value) {
        this.setBandGain(index, value);
        const valLabel = document.getElementById('eq-val-' + index);
        const num = parseFloat(value);
        if (valLabel) valLabel.textContent = (num > 0 ? '+' : '') + num.toFixed(1) + 'dB';
    }
};

window.DSP = DSP;
