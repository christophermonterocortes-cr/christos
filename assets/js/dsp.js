/**
 * CHRISTOS Audiophile DSP Studio
 * 10-Band Graphic & Parametric EQ, Named Presets, Chu-Moy Crossfeed,
 * ReplayGain / Sonora LUFS Normalization, & Nightcore / Audio FX Studio
 */

const DSP = {
    context: null,
    inputNode: null,
    outputNode: null,
    activeTab: 'eq',
    
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

    // Nightcore & Pitch Engine
    nightcoreEnabled: false,
    nightcoreSpeed: 1.30,   // Base playback speed (0.25x - 2.0x)
    nightcorePitch: 4.0,    // Semitones shift (-12 to +12 st)
    nightcoreTreble: 4.0,   // High-shelf boost in dB (-12 to +12 dB at 8kHz)
    nightcoreTrebleNode: null,
    
    // Built-in EQ Presets
    presets: {
        'flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        'harman': [4.5, 3.5, 1.0, 0.0, 0.0, 1.0, 3.0, 2.5, 1.5, 0.5],
        'bass_boost': [6.0, 5.0, 3.5, 1.0, 0.0, 0.0, 0.0, 1.0, 2.0, 2.5],
        'vocal': [-1.5, -0.5, 0.0, 1.0, 2.0, 3.0, 3.5, 2.0, 1.0, 0.5],
        'electronic': [5.5, 4.5, 1.5, -1.0, -1.5, 0.5, 2.0, 3.5, 4.5, 4.0],
        'acoustic': [1.0, 1.5, 2.0, 1.5, 1.0, 1.5, 2.5, 3.5, 4.0, 4.5],
        'rock': [4.0, 3.0, 1.5, -0.5, -1.0, 1.0, 2.5, 3.5, 3.5, 3.0]
    },

    // Custom Named Presets
    customPresets: {},

    // Nightcore Presets (Nofuf Standard)
    nightcorePresets: {
        'nightcore': { speed: 1.30, pitch: 4.0, treble: 4.0, label: 'Nightcore (1.30× / +4 st)' },
        'slowed':    { speed: 0.80, pitch: -3.0, treble: -2.0, label: 'Slowed & Reverb (0.80× / -3 st)' },
        'vaporwave': { speed: 0.72, pitch: -5.0, treble: 0.0, label: 'Vaporwave (0.72× / -5 st)' },
        'speed':     { speed: 1.50, pitch: 0.0, treble: 2.0, label: 'Speed Up (1.50× / 0 st)' }
    },

    init(audioContext, sourceNode, destinationNode) {
        this.context = audioContext;
        this.inputNode = sourceNode;
        this.outputNode = destinationNode;

        // Load saved gains & preferences
        const saved = localStorage.getItem('christos_dsp_gains');
        if (saved) {
            try { this.gains = JSON.parse(saved); } catch (e) {}
        }
        const savedCustom = localStorage.getItem('christos_custom_eq_presets');
        if (savedCustom) {
            try { this.customPresets = JSON.parse(savedCustom); } catch (e) {}
        }

        this.crossfeedEnabled = localStorage.getItem('christos_dsp_crossfeed') === 'true';
        this.replayGainMode = localStorage.getItem('christos_replaygain_mode') || 'track';
        this.preampDb = parseFloat(localStorage.getItem('christos_replaygain_preamp') || '0.0');
        this.antiClipping = localStorage.getItem('christos_replaygain_anticlip') !== 'false';
        this.sonoraNormalizerEnabled = localStorage.getItem('christos_sonora_normalization') !== 'false';
        this.sonoraTargetLufs = parseFloat(localStorage.getItem('christos_sonora_lufs') || '-14');

        // Load Nightcore state
        this.nightcoreEnabled = localStorage.getItem('christos_nightcore_enabled') === 'true';
        this.nightcoreSpeed = parseFloat(localStorage.getItem('christos_nightcore_speed') || '1.30');
        this.nightcorePitch = parseFloat(localStorage.getItem('christos_nightcore_pitch') || '4.0');
        this.nightcoreTreble = parseFloat(localStorage.getItem('christos_nightcore_treble') || '4.0');

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

        // Create Nightcore High-Shelf Treble Filter (8 kHz)
        this.nightcoreTrebleNode = this.context.createBiquadFilter();
        this.nightcoreTrebleNode.type = 'highshelf';
        this.nightcoreTrebleNode.frequency.value = 8000;
        this.nightcoreTrebleNode.gain.value = this.nightcoreEnabled ? this.nightcoreTreble : 0;

        // Audio Chain: input -> ReplayGain -> SonoraNormalizer -> Filter[0] -> ... -> Filter[9] -> NightcoreTreble -> outputNode
        this.inputNode.connect(this.replayGainNode);
        this.replayGainNode.connect(this.sonoraNormalizerNode);
        this.sonoraNormalizerNode.connect(this.filters[0]);
        for (let i = 0; i < this.filters.length - 1; i++) {
            this.filters[i].connect(this.filters[i + 1]);
        }
        this.filters[this.filters.length - 1].connect(this.nightcoreTrebleNode);
        this.nightcoreTrebleNode.connect(this.outputNode);

        if (this.nightcoreEnabled) {
            this.applyNightcore();
        }
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
            if (this.filters[index] && this.context) {
                this.filters[index].gain.setTargetAtTime(this.gains[index], this.context.currentTime, 0.05);
            }
            localStorage.setItem('christos_dsp_gains', JSON.stringify(this.gains));
        }
    },

    applyPreset(presetKey) {
        let p = this.presets[presetKey];
        if (!p && this.customPresets[presetKey]) {
            p = this.customPresets[presetKey];
        }
        if (p) {
            p.forEach((val, idx) => {
                this.setBandGain(idx, val);
                const slider = document.getElementById('eq-slider-' + idx);
                const valLabel = document.getElementById('eq-val-' + idx);
                if (slider) slider.value = val;
                if (valLabel) valLabel.textContent = (val > 0 ? '+' : '') + parseFloat(val).toFixed(1) + 'dB';
            });
            localStorage.setItem('christos_dsp_preset', presetKey);
        }
    },

    saveCustomPreset(name) {
        if (!name || !name.trim()) return;
        const key = name.trim();
        this.customPresets[key] = [...this.gains];
        localStorage.setItem('christos_custom_eq_presets', JSON.stringify(this.customPresets));
        this.openModal('eq');
    },

    deleteCustomPreset(name) {
        if (!name || !this.customPresets[name]) return;
        delete this.customPresets[name];
        localStorage.setItem('christos_custom_eq_presets', JSON.stringify(this.customPresets));
        this.openModal('eq');
    },

    toggleCrossfeed(enabled) {
        this.crossfeedEnabled = enabled;
        localStorage.setItem('christos_dsp_crossfeed', enabled);
    },

    // ═══════════════════════════════════════════════════════════════
    // NIGHTCORE & AUDIO EFFECTS ENGINE
    // ═══════════════════════════════════════════════════════════════

    applyNightcore() {
        const audios = [document.getElementById('audio1'), document.getElementById('audio2')];
        const badge = document.getElementById('player-nc-badge');
        const ncBtn = document.getElementById('nightcore-btn');
        const fsBtn = document.getElementById('fs-nightcore-btn');

        if (this.nightcoreEnabled) {
            // Speed * 2^(semitones / 12)
            const pitchMult = Math.pow(2, this.nightcorePitch / 12);
            const finalRate = Math.min(4.0, Math.max(0.05, this.nightcoreSpeed * pitchMult));

            audios.forEach(a => {
                if (a) {
                    a.preservesPitch = false;
                    a.mozPreservePitch = false;
                    a.webkitPreservePitch = false;
                    a.playbackRate = finalRate;
                }
            });

            if (this.nightcoreTrebleNode && this.context) {
                this.nightcoreTrebleNode.gain.setTargetAtTime(this.nightcoreTreble, this.context.currentTime, 0.02);
            }

            if (badge) {
                badge.style.display = 'inline-block';
                badge.textContent = finalRate.toFixed(2) + '×';
            }
            if (ncBtn) ncBtn.classList.add('active');
            if (fsBtn) fsBtn.classList.add('active');
        } else {
            audios.forEach(a => {
                if (a) {
                    a.preservesPitch = true;
                    a.playbackRate = 1.0;
                }
            });

            if (this.nightcoreTrebleNode && this.context) {
                this.nightcoreTrebleNode.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
            }

            if (badge) badge.style.display = 'none';
            if (ncBtn) ncBtn.classList.remove('active');
            if (fsBtn) fsBtn.classList.remove('active');
        }

        this.updateNightcoreUI();
    },

    toggleNightcore(enabled) {
        this.nightcoreEnabled = !!enabled;
        localStorage.setItem('christos_nightcore_enabled', this.nightcoreEnabled);
        this.applyNightcore();
    },

    setNightcoreSpeed(speed) {
        this.nightcoreSpeed = parseFloat(speed);
        localStorage.setItem('christos_nightcore_speed', this.nightcoreSpeed);
        if (this.nightcoreEnabled) this.applyNightcore();
        else this.updateNightcoreUI();
    },

    setNightcorePitch(pitch) {
        this.nightcorePitch = parseFloat(pitch);
        localStorage.setItem('christos_nightcore_pitch', this.nightcorePitch);
        if (this.nightcoreEnabled) this.applyNightcore();
        else this.updateNightcoreUI();
    },

    setNightcoreTreble(treble) {
        this.nightcoreTreble = parseFloat(treble);
        localStorage.setItem('christos_nightcore_treble', this.nightcoreTreble);
        if (this.nightcoreEnabled) this.applyNightcore();
        else this.updateNightcoreUI();
    },

    applyNightcorePreset(presetName) {
        const p = this.nightcorePresets[presetName];
        if (!p) return;
        this.nightcoreSpeed = p.speed;
        this.nightcorePitch = p.pitch;
        this.nightcoreTreble = p.treble;
        this.nightcoreEnabled = true;
        localStorage.setItem('christos_nightcore_speed', this.nightcoreSpeed);
        localStorage.setItem('christos_nightcore_pitch', this.nightcorePitch);
        localStorage.setItem('christos_nightcore_treble', this.nightcoreTreble);
        localStorage.setItem('christos_nightcore_enabled', 'true');
        this.applyNightcore();
    },

    updateNightcoreUI() {
        const spdInput = document.getElementById('nc-speed-slider');
        const pitchInput = document.getElementById('nc-pitch-slider');
        const trebleInput = document.getElementById('nc-treble-slider');
        const spdVal = document.getElementById('nc-speed-val');
        const pitchVal = document.getElementById('nc-pitch-val');
        const trebleVal = document.getElementById('nc-treble-val');
        const finalVal = document.getElementById('nc-final-val');
        const toggle = document.getElementById('nc-toggle');

        if (spdInput) spdInput.value = this.nightcoreSpeed;
        if (pitchInput) pitchInput.value = this.nightcorePitch;
        if (trebleInput) trebleInput.value = this.nightcoreTreble;
        if (toggle) toggle.checked = this.nightcoreEnabled;

        if (spdVal) spdVal.textContent = this.nightcoreSpeed.toFixed(2) + '×';
        if (pitchVal) pitchVal.textContent = (this.nightcorePitch >= 0 ? '+' : '') + this.nightcorePitch.toFixed(1) + ' st';
        if (trebleVal) trebleVal.textContent = (this.nightcoreTreble >= 0 ? '+' : '') + this.nightcoreTreble.toFixed(1) + ' dB';

        if (finalVal) {
            if (this.nightcoreEnabled) {
                const finalRate = Math.min(4.0, Math.max(0.05, this.nightcoreSpeed * Math.pow(2, this.nightcorePitch / 12)));
                finalVal.textContent = finalRate.toFixed(2) + '×';
            } else {
                finalVal.textContent = '1.00× (Bypassed)';
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════
    // REPLAYGAIN ENGINE
    // ═══════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════
    // UI MODAL ENGINE
    // ═══════════════════════════════════════════════════════════════

    openNightcoreModal() {
        this.openModal('nightcore');
    },

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('.dsp-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.dsp-tab-content').forEach(c => {
            c.style.display = (c.dataset.tab === tab) ? 'block' : 'none';
        });
    },

    openModal(initialTab = 'eq') {
        this.activeTab = initialTab;
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
                    <span class="eq-gain-val" id="eq-val-${idx}">${val > 0 ? '+' : ''}${parseFloat(val).toFixed(1)}dB</span>
                    <input type="range" class="eq-vertical-slider" id="eq-slider-${idx}" min="-12" max="12" step="0.5" value="${val}" oninput="DSP.onSliderChange(${idx}, this.value)">
                    <span class="eq-freq-label">${label}</span>
                </div>
            `;
        });

        // Custom presets options
        let customOptionsHtml = '';
        Object.keys(this.customPresets).forEach(k => {
            customOptionsHtml += `<option value="${k}" ${currentPreset === k ? 'selected' : ''}>★ ${k}</option>`;
        });

        modal.innerHTML = `
            <div class="dsp-modal-card">
                <div class="dsp-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent-color)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        <h3 style="font-size:1.2rem; font-weight:800; color:#fff;">Audiophile DSP & Effects Studio</h3>
                    </div>
                    <button class="fullscreen-exit-btn" onclick="DSP.closeModal()">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>

                <!-- DSP NAVIGATION TABS -->
                <div class="dsp-nav-tabs" style="display:flex; gap:8px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:10px; margin-bottom:16px;">
                    <button class="dsp-tab-btn ${this.activeTab==='eq'?'active':''}" data-tab="eq" onclick="DSP.switchTab('eq')">
                        🎚️ 10-Band Equalizer
                    </button>
                    <button class="dsp-tab-btn ${this.activeTab==='nightcore'?'active':''}" data-tab="nightcore" onclick="DSP.switchTab('nightcore')">
                        ⚡ Nightcore & Speed Studio
                    </button>
                    <button class="dsp-tab-btn ${this.activeTab==='loudness'?'active':''}" data-tab="loudness" onclick="DSP.switchTab('loudness')">
                        🔊 ReplayGain & Normalizer
                    </button>
                </div>

                <!-- TAB 1: 10-BAND EQ -->
                <div class="dsp-tab-content" data-tab="eq" style="display:${this.activeTab==='eq'?'block':'none'};">
                    <div class="dsp-controls-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <label style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">Sound Target / Preset:</label>
                            <select class="form-select" id="dsp-preset-select" onchange="DSP.applyPreset(this.value)" style="padding:6px 12px; background:rgba(255,255,255,0.08); border:1px solid var(--border-color); border-radius:8px; color:#fff;">
                                <optgroup label="Target Curves">
                                    <option value="harman" ${currentPreset==='harman'?'selected':''}>Harman Audiophile Target</option>
                                    <option value="bass_boost" ${currentPreset==='bass_boost'?'selected':''}>Bass Boost & Warmth</option>
                                    <option value="vocal" ${currentPreset==='vocal'?'selected':''}>Vocal Clarity & Presence</option>
                                    <option value="electronic" ${currentPreset==='electronic'?'selected':''}>Electronic Punch & Treble</option>
                                    <option value="acoustic" ${currentPreset==='acoustic'?'selected':''}>Acoustic Air & Detail</option>
                                    <option value="rock" ${currentPreset==='rock'?'selected':''}>Rock & Energetic Drive</option>
                                    <option value="flat" ${currentPreset==='flat'?'selected':''}>Flat / Direct Studio (0 dB)</option>
                                </optgroup>
                                ${customOptionsHtml ? `<optgroup label="Custom User Presets">${customOptionsHtml}</optgroup>` : ''}
                            </select>
                        </div>

                        <div style="display:flex; gap:8px;">
                            <button class="btn btn-secondary" onclick="DSP.promptSavePreset()" style="padding:6px 12px; font-size:0.82rem;">
                                💾 Save Custom
                            </button>
                            <button class="btn btn-secondary" onclick="DSP.applyPreset('flat')" style="padding:6px 12px; font-size:0.82rem;">
                                Reset Flat
                            </button>
                        </div>
                    </div>

                    <!-- 10-Band Sliders Grid -->
                    <div class="eq-sliders-grid">
                        ${slidersHtml}
                    </div>
                </div>

                <!-- TAB 2: NIGHTCORE & SPEED STUDIO -->
                <div class="dsp-tab-content" data-tab="nightcore" style="display:${this.activeTab==='nightcore'?'block':'none'};">
                    <div style="background:rgba(168,85,247,0.06); border:1px solid rgba(168,85,247,0.2); border-radius:12px; padding:16px 20px; margin-bottom:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                            <div>
                                <h4 style="color:#fff; font-size:1.05rem; font-weight:700; margin-bottom:2px;">Nightcore & Audio Pitch Engine</h4>
                                <p style="color:var(--text-secondary); font-size:0.8rem; margin:0;">Pitch-shifted live resampling with 8kHz Air High-Shelf Treble boost.</p>
                            </div>
                            <label class="switch-toggle" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" id="nc-toggle" ${this.nightcoreEnabled?'checked':''} onchange="DSP.toggleNightcore(this.checked)">
                                <span style="color:#fff; font-size:0.85rem; font-weight:700;">Active</span>
                            </label>
                        </div>

                        <!-- Presets Quick Bar -->
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
                            <button class="btn btn-secondary" style="font-size:0.8rem; padding:6px 12px;" onclick="DSP.applyNightcorePreset('nightcore')">
                                ⚡ Nightcore (1.30× / +4 st)
                            </button>
                            <button class="btn btn-secondary" style="font-size:0.8rem; padding:6px 12px;" onclick="DSP.applyNightcorePreset('slowed')">
                                🌌 Slowed & Reverb (0.80× / -3 st)
                            </button>
                            <button class="btn btn-secondary" style="font-size:0.8rem; padding:6px 12px;" onclick="DSP.applyNightcorePreset('vaporwave')">
                                📼 Vaporwave (0.72× / -5 st)
                            </button>
                            <button class="btn btn-secondary" style="font-size:0.8rem; padding:6px 12px;" onclick="DSP.applyNightcorePreset('speed')">
                                🚀 Speed Up (1.50× / 0 st)
                            </button>
                        </div>

                        <!-- Live Controls -->
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                            <!-- Speed -->
                            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:12px;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                                    <span style="font-size:0.85rem; color:#fff; font-weight:600;">Playback Speed</span>
                                    <span id="nc-speed-val" style="font-size:0.85rem; color:var(--accent-color); font-weight:700;">${this.nightcoreSpeed.toFixed(2)}×</span>
                                </div>
                                <input type="range" id="nc-speed-slider" min="0.25" max="2.0" step="0.05" value="${this.nightcoreSpeed}" oninput="DSP.setNightcoreSpeed(this.value)" style="width:100%;">
                                <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#777; margin-top:4px;">
                                    <span>0.25×</span><span>1.0× Normal</span><span>2.0×</span>
                                </div>
                            </div>

                            <!-- Pitch -->
                            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:12px;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                                    <span style="font-size:0.85rem; color:#fff; font-weight:600;">Pitch Shift (Semitones)</span>
                                    <span id="nc-pitch-val" style="font-size:0.85rem; color:var(--accent-color); font-weight:700;">${this.nightcorePitch >= 0 ? '+' : ''}${this.nightcorePitch.toFixed(1)} st</span>
                                </div>
                                <input type="range" id="nc-pitch-slider" min="-12" max="12" step="1" value="${this.nightcorePitch}" oninput="DSP.setNightcorePitch(this.value)" style="width:100%;">
                                <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#777; margin-top:4px;">
                                    <span>-12 st (Deep)</span><span>0 st</span><span>+12 st (Chipmunk)</span>
                                </div>
                            </div>

                            <!-- Treble Boost -->
                            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:12px;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                                    <span style="font-size:0.85rem; color:#fff; font-weight:600;">Air Treble Shelf (8 kHz)</span>
                                    <span id="nc-treble-val" style="font-size:0.85rem; color:var(--accent-color); font-weight:700;">${this.nightcoreTreble >= 0 ? '+' : ''}${this.nightcoreTreble.toFixed(1)} dB</span>
                                </div>
                                <input type="range" id="nc-treble-slider" min="-12" max="12" step="0.5" value="${this.nightcoreTreble}" oninput="DSP.setNightcoreTreble(this.value)" style="width:100%;">
                                <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#777; margin-top:4px;">
                                    <span>-12 dB Dark</span><span>0 dB</span><span>+12 dB Sparkle</span>
                                </div>
                            </div>

                            <!-- Final Resampled Rate Display -->
                            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:12px; display:flex; flex-direction:column; justify-content:center;">
                                <span style="font-size:0.8rem; color:var(--text-secondary);">Calculated Web Audio Playback Rate:</span>
                                <span id="nc-final-val" style="font-size:1.3rem; font-weight:800; color:#fff; margin-top:4px;">
                                    ${this.nightcoreEnabled ? (this.nightcoreSpeed * Math.pow(2, this.nightcorePitch / 12)).toFixed(2) + '×' : '1.00× (Bypassed)'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: REPLAYGAIN & NORMALIZER -->
                <div class="dsp-tab-content" data-tab="loudness" style="display:${this.activeTab==='loudness'?'block':'none'};">
                    <!-- ReplayGain Section -->
                    <div class="dsp-rg-section" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:14px 18px; margin-bottom:16px;">
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

                    <!-- Sonora EBU R128 Dynamics Section -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:14px 18px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div>
                                <span style="font-weight:700; color:#fff; font-size:0.95rem;">Sonora EBU R128 Studio Normalizer</span>
                                <p style="color:var(--text-secondary); font-size:0.8rem; margin:2px 0 0 0;">True Peak & Loudness Compressor Target</p>
                            </div>
                            <label style="display:flex; align-items:center; gap:8px; color:#fff; cursor:pointer; font-weight:600; font-size:0.85rem;">
                                <input type="checkbox" ${this.sonoraNormalizerEnabled?'checked':''} onchange="DSP.toggleSonoraNormalization(this.checked)">
                                Enabled
                            </label>
                        </div>
                        <div style="display:flex; align-items:center; gap:12px; font-size:0.85rem;">
                            <label style="color:var(--text-secondary); white-space:nowrap;">Target LUFS:</label>
                            <select class="form-select" onchange="DSP.setSonoraTargetLufs(this.value)" style="padding:4px 10px; background:rgba(255,255,255,0.08); border:1px solid var(--border-color); border-radius:6px; color:#fff;">
                                <option value="-14" ${this.sonoraTargetLufs===-14?'selected':''}>-14 LUFS (Spotify / YouTube Music)</option>
                                <option value="-16" ${this.sonoraTargetLufs===-16?'selected':''}>-16 LUFS (Apple Music Standard)</option>
                                <option value="-18" ${this.sonoraTargetLufs===-18?'selected':''}>-18 LUFS (Qobuz / Audiophile High Dynamic)</option>
                                <option value="-23" ${this.sonoraTargetLufs===-23?'selected':''}>-23 LUFS (EBU R128 Broadcast Master)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modal.classList.add('active');
        if (window.Player && window.Player.currentTrack) {
            this.applyReplayGain(window.Player.currentTrack);
        }
    },

    promptSavePreset() {
        const name = prompt("Enter a name for your custom EQ curve:");
        if (name && name.trim()) {
            this.saveCustomPreset(name.trim());
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
