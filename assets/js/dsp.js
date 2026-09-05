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
    
    // Sonora Audio Normalization Engine (EBU R128 / LUFS Compressor)
    sonoraNormalizerNode: null,
    sonoraNormalizerEnabled: true,
    sonoraTargetLufs: -14, // -14 LUFS Spotify/Sonora Standard
    
    // Crossfeed Nodes
    crossfeedEnabled: false,
    crossfeedGain: null,
    
    // ReplayGain Engine
    replayGainNode: null,
    replayGainMode: 'track', // 'track', 'album', 'off'
    preampDb: 0.0,
    antiClipping: true,
    currentTrackGainDb: 0,
    currentPeak: 1.0,
    appliedLinearGain: 1.0,
    
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

        // Load saved gains & ReplayGain preferences
        const saved = localStorage.getItem('christos_dsp_gains');
        if (saved) {
            try {
                this.gains = JSON.parse(saved);
            } catch (e) {}
        }
        this.crossfeedEnabled = localStorage.getItem('christos_dsp_crossfeed') === 'true';
        this.replayGainMode = localStorage.getItem('christos_replaygain_mode') || 'track';
        this.preampDb = parseFloat(localStorage.getItem('christos_replaygain_preamp') || '0.0');
        this.antiClipping = localStorage.getItem('christos_replaygain_anticlip') !== 'false';
        this.sonoraNormalizerEnabled = localStorage.getItem('christos_sonora_normalization') !== 'false';
        this.sonoraTargetLufs = parseFloat(localStorage.getItem('christos_sonora_lufs') || '-14');

        // Create ReplayGain GainNode
        this.replayGainNode = this.context.createGain();
        this.replayGainNode.gain.value = 1.0;

        // Create Sonora Audio Normalizer DynamicsCompressor Node
        this.sonoraNormalizerNode = this.context.createDynamicsCompressor();
        this.configureSonoraNormalizer();

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

        // Chain: input -> ReplayGainNode -> SonoraNormalizer -> Filter[0] -> ... -> Filter[9] -> outputNode
        this.inputNode.connect(this.replayGainNode);
        this.replayGainNode.connect(this.sonoraNormalizerNode);
        this.sonoraNormalizerNode.connect(this.filters[0]);
        for (let i = 0; i < this.filters.length - 1; i++) {
            this.filters[i].connect(this.filters[i + 1]);
        }
        this.filters[this.filters.length - 1].connect(this.outputNode);
    },

    configureSonoraNormalizer() {
        if (!this.sonoraNormalizerNode || !this.context) return;
        if (this.sonoraNormalizerEnabled) {
            this.sonoraNormalizerNode.threshold.setTargetAtTime(this.sonoraTargetLufs, this.context.currentTime, 0.05);
            this.sonoraNormalizerNode.knee.setTargetAtTime(24, this.context.currentTime, 0.05);
            this.sonoraNormalizerNode.ratio.setTargetAtTime(3.0, this.context.currentTime, 0.05);
            this.sonoraNormalizerNode.attack.setTargetAtTime(0.003, this.context.currentTime, 0.05);
            this.sonoraNormalizerNode.release.setTargetAtTime(0.250, this.context.currentTime, 0.05);
        } else {
            // Bypass mode
            this.sonoraNormalizerNode.threshold.setTargetAtTime(0, this.context.currentTime, 0.05);
            this.sonoraNormalizerNode.ratio.setTargetAtTime(1.0, this.context.currentTime, 0.05);
        }
    },

    toggleSonoraNormalization(enabled) {
        this.sonoraNormalizerEnabled = enabled;
        localStorage.setItem('christos_sonora_normalization', enabled);
        this.configureSonoraNormalizer();
    },

    setSonoraTargetLufs(lufs) {
        this.sonoraTargetLufs = parseFloat(lufs);
        localStorage.setItem('christos_sonora_lufs', this.sonoraTargetLufs);
        this.configureSonoraNormalizer();
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

    applyReplayGain(track) {
        if (!this.replayGainNode || !this.context) return;
        
        let targetGainDb = 0;
        let peak = 1.0;

        if (track) {
            const trackGain = (track.replaygain_track_gain !== null && track.replaygain_track_gain !== undefined) ? parseFloat(track.replaygain_track_gain) : null;
            const albumGain = (track.replaygain_album_gain !== null && track.replaygain_album_gain !== undefined) ? parseFloat(track.replaygain_album_gain) : null;
            const trackPeak = (track.replaygain_track_peak !== null && track.replaygain_track_peak !== undefined) ? parseFloat(track.replaygain_track_peak) : 1.0;
            const albumPeak = (track.replaygain_album_peak !== null && track.replaygain_album_peak !== undefined) ? parseFloat(track.replaygain_album_peak) : 1.0;

            if (this.replayGainMode === 'album' && albumGain !== null) {
                targetGainDb = albumGain;
                peak = albumPeak;
            } else if (this.replayGainMode !== 'off' && trackGain !== null) {
                targetGainDb = trackGain;
                peak = trackPeak;
            }
            this.currentTrackGainDb = targetGainDb;
            this.currentPeak = peak;
        }

        if (this.replayGainMode === 'off') {
            targetGainDb = 0;
            peak = 1.0;
        } else {
            targetGainDb += this.preampDb;
        }

        // Calculate linear gain
        let linearGain = Math.pow(10, targetGainDb / 20);

        // Anti-clipping peak protection
        if (this.antiClipping && peak > 0) {
            if (linearGain * peak > 1.0) {
                linearGain = 1.0 / peak;
            }
        }

        this.appliedLinearGain = linearGain;
        const now = this.context.currentTime;
        this.replayGainNode.gain.cancelScheduledValues(now);
        this.replayGainNode.gain.linearRampToValueAtTime(linearGain, now + 0.05);

        // Update ReplayGain badge if UI exists
        const badge = document.getElementById('dsp-rg-badge');
        if (badge) {
            if (this.replayGainMode === 'off') {
                badge.textContent = 'Disabled';
                badge.style.background = 'rgba(255,255,255,0.1)';
                badge.style.color = '#888';
            } else {
                const diffDb = 20 * Math.log10(linearGain);
                badge.textContent = `${diffDb >= 0 ? '+' : ''}${diffDb.toFixed(1)} dB (${this.replayGainMode.toUpperCase()})`;
                badge.style.background = 'rgba(34, 197, 94, 0.2)';
                badge.style.color = '#4ade80';
            }
        }
    },

    setReplayGainMode(mode) {
        this.replayGainMode = mode;
        localStorage.setItem('christos_replaygain_mode', mode);
        if (window.Player && window.Player.currentTrack) {
            this.applyReplayGain(window.Player.currentTrack);
        }
    },

    setPreamp(db) {
        this.preampDb = parseFloat(db);
        localStorage.setItem('christos_replaygain_preamp', this.preampDb);
        const lbl = document.getElementById('dsp-preamp-val');
        if (lbl) lbl.textContent = (this.preampDb > 0 ? '+' : '') + this.preampDb.toFixed(1) + ' dB';
        if (window.Player && window.Player.currentTrack) {
            this.applyReplayGain(window.Player.currentTrack);
        }
    },

    toggleAntiClipping(enabled) {
        this.antiClipping = enabled;
        localStorage.setItem('christos_replaygain_anticlip', enabled);
        if (window.Player && window.Player.currentTrack) {
            this.applyReplayGain(window.Player.currentTrack);
        }
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
                        <h3 style="font-size:1.2rem; font-weight:800; color:#fff;">Audiophile DSP & Loudness Engine</h3>
                    </div>
                    <button class="fullscreen-exit-btn" onclick="DSP.closeModal()">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <!-- ReplayGain Section -->
                <div class="dsp-rg-section" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:14px 18px; margin:14px 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-weight:700; color:#fff; font-size:0.95rem;">ReplayGain Loudness Normalization</span>
                            <span id="dsp-rg-badge" style="font-size:0.75rem; padding:2px 8px; border-radius:12px; font-weight:700; background:rgba(34,197,94,0.2); color:#4ade80;">Active</span>
                        </div>
                        <select class="form-select" onchange="DSP.setReplayGainMode(this.value)" style="padding:4px 10px; font-size:0.85rem; background:rgba(255,255,255,0.08); border:1px solid var(--border-color); border-radius:6px; color:#fff;">
                            <option value="track" ${this.replayGainMode==='track'?'selected':''}>Track Gain</option>
                            <option value="album" ${this.replayGainMode==='album'?'selected':''}>Album Gain</option>
                            <option value="off" ${this.replayGainMode==='off'?'selected':''}>Disabled</option>
                        </select>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; font-size:0.85rem;">
                        <div style="display:flex; align-items:center; gap:10px; flex:1;">
                            <label style="color:var(--text-secondary); white-space:nowrap;">Pre-Amp:</label>
                            <input type="range" min="-6" max="6" step="0.5" value="${this.preampDb}" oninput="DSP.setPreamp(this.value)" style="flex:1;">
                            <span id="dsp-preamp-val" style="font-weight:700; color:#fff; width:55px; text-align:right;">${this.preampDb > 0 ? '+' : ''}${this.preampDb.toFixed(1)} dB</span>
                        </div>
                        <label style="display:flex; align-items:center; gap:8px; color:var(--text-secondary); cursor:pointer; font-weight:600;">
                            <input type="checkbox" ${this.antiClipping?'checked':''} onchange="DSP.toggleAntiClipping(this.checked)">
                            Anti-Clipping Peak Guard
                        </label>
                    </div>
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
        if (window.Player && window.Player.currentTrack) {
            this.applyReplayGain(window.Player.currentTrack);
        }
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

