window.escapeHtml = window.escapeHtml || function(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const Player = {
    audio1: null,
    audio2: null,
    activeAudio: null,
    inactiveAudio: null,

    context: null,
    analyser: null,
    gainNode: null,
    source1: null,
    source2: null,

    queue: [],
    queueIndex: 0,
    currentTrack: null,

    isShuffle: false,
    repeatMode: 'off', // 'off', 'all', 'one'
    isMuted: false,
    previousVolume: 0.8,

    lyrics: [],
    currentLyricIndex: -1,

    isFullscreen: false,
    fullscreenLayout: 'split', // 'split', 'ambient', 'lyrics', 'visualizer'

    init() {
        this.audio1 = document.getElementById('audio1');
        this.audio2 = document.getElementById('audio2');

        if (!this.audio1 || !this.audio2) {
            console.error("Audio elements #audio1 or #audio2 not found");
            return;
        }

        this.activeAudio = this.audio1;
        this.inactiveAudio = this.audio2;

        this.setupAudioEvents(this.audio1);
        this.setupAudioEvents(this.audio2);
        this.setupUIEvents();
        this.setupKeyboardShortcuts();

        // Restore volume
        const savedVol = localStorage.getItem('christos_volume');
        if (savedVol !== null) {
            this.setVolume(parseFloat(savedVol));
        } else {
            this.setVolume(0.8);
        }

        // Restore layout
        const savedLayout = localStorage.getItem('christos_fullscreen_layout') || 'split';
        this.changeFullscreenLayout(savedLayout);
    },

    setupAudioContext() {
        if (this.context) return;

        if (!this.audio1) this.audio1 = document.getElementById('audio1');
        if (!this.audio2) this.audio2 = document.getElementById('audio2');
        if (!this.audio1 || !this.audio2) return;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        const fftSize = parseInt(localStorage.getItem('christos_fft_size') || '512', 10);

        this.context = new AudioCtx();
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = fftSize;
        this.analyser.smoothingTimeConstant = 0.78;
        this.analyser.minDecibels = -90;
        this.analyser.maxDecibels = -10;

        this.gainNode = this.context.createGain();
        this.gainNode.gain.value = 1.0;

        try {
            this.source1 = this.context.createMediaElementSource(this.audio1);
            this.source1.connect(this.analyser);
            this.analyser.connect(this.gainNode);

            this.source2 = this.context.createMediaElementSource(this.audio2);
            this.source2.connect(this.analyser);

            if (typeof DSP !== 'undefined') {
                DSP.init(this.context, this.gainNode, this.context.destination);
            } else {
                this.gainNode.connect(this.context.destination);
            }
        } catch (e) {
            console.warn("Web Audio MediaElement routing notice:", e);
        }

        if (typeof Visualizer !== 'undefined' && this.analyser) {
            Visualizer.analyser = this.analyser;
        }
    },

    ensureAudioContext() {
        this.setupAudioContext();
        if (this.context && this.context.state === 'suspended') {
            this.context.resume();
        }
    },

    setupAudioEvents(audio) {
        audio.addEventListener('timeupdate', () => {
            if (audio === this.activeAudio) {
                this.onTimeUpdate();
            }
        });

        audio.addEventListener('ended', () => {
            if (audio === this.activeAudio) {
                this.onTrackEnded();
            }
        });

        audio.addEventListener('play', () => {
            if (audio === this.activeAudio) {
                this.updatePlayStateUI(true);
            }
        });

        audio.addEventListener('pause', () => {
            if (audio === this.activeAudio) {
                this.updatePlayStateUI(false);
            }
        });

        audio.addEventListener('error', (e) => {
            console.error("Audio error:", e);
        });
    },

    setupUIEvents() {
        const seekBar = document.getElementById('seek-bar');
        if (seekBar) {
            seekBar.addEventListener('input', (e) => {
                const dur = this.getDuration();
                if (dur > 0 && this.activeAudio) {
                    const seekTo = (e.target.value / 100) * dur;
                    this.activeAudio.currentTime = seekTo;
                }
            });
        }

        const fsSeekBar = document.getElementById('fullscreen-seek-bar');
        if (fsSeekBar) {
            fsSeekBar.addEventListener('input', (e) => {
                const dur = this.getDuration();
                if (dur > 0 && this.activeAudio) {
                    const seekTo = (e.target.value / 100) * dur;
                    this.activeAudio.currentTime = seekTo;
                }
            });
        }

        const volumeBar = document.getElementById('volume-bar');
        if (volumeBar) {
            volumeBar.addEventListener('input', (e) => {
                this.setVolume(parseFloat(e.target.value));
            });
        }

        const fsVolumeBar = document.getElementById('fullscreen-volume-bar');
        if (fsVolumeBar) {
            fsVolumeBar.addEventListener('input', (e) => {
                this.setVolume(parseFloat(e.target.value));
            });
        }

        // Delegate layout buttons
        document.querySelectorAll('.layout-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const layout = btn.getAttribute('data-layout');
                if (layout) {
                    this.changeFullscreenLayout(layout);
                }
            });
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement && this.isFullscreen) {
                this.toggleFullscreen(false);
            }
        });
    },

    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'KeyF':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case 'KeyL':
                    e.preventDefault();
                    window.toggleLyrics();
                    break;
                case 'Escape':
                    if (this.isFullscreen) {
                        e.preventDefault();
                        this.toggleFullscreen(false);
                    }
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (this.activeAudio) {
                        this.activeAudio.currentTime = Math.max(0, this.activeAudio.currentTime - 5);
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (this.activeAudio) {
                        this.activeAudio.currentTime = Math.min(this.getDuration(), this.activeAudio.currentTime + 5);
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.setVolume(Math.min(1, (this.activeAudio ? this.activeAudio.volume : 0.8) + 0.05));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.setVolume(Math.max(0, (this.activeAudio ? this.activeAudio.volume : 0.8) - 0.05));
                    break;
            }
        });
    },

    async playTrack(track) {
        if (!track) return;
        this.ensureAudioContext();

        this.currentTrack = track;
        this.hasScrobbledCurrent = false;
        this.updateMetadataUI(track);

        // Apply ReplayGain loudness normalization if DSP is ready
        if (typeof DSP !== 'undefined' && DSP.applyReplayGain) {
            DSP.applyReplayGain(track);
        }

        const dur = track.duration || 0;
        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) timeDisplay.textContent = `0:00 / ${this.formatTime(dur)}`;
        const fsCur = document.getElementById('fullscreen-current-time');
        const fsTot = document.getElementById('fullscreen-total-time');
        if (fsCur) fsCur.textContent = '0:00';
        if (fsTot) fsTot.textContent = this.formatTime(dur);

        const seekBar = document.getElementById('seek-bar');
        if (seekBar) seekBar.value = 0;
        const fsSeekBar = document.getElementById('fullscreen-seek-bar');
        if (fsSeekBar) fsSeekBar.value = 0;

        this.fetchLyrics(track.id);

        const streamUrl = `/api/stream.php?id=${track.id}`;
        this.activeAudio.src = streamUrl;
        this.activeAudio.currentTime = 0;

        try {
            await this.activeAudio.play();
            if (typeof Visualizer !== 'undefined' && this.analyser) {
                Visualizer.start(this.analyser);
            }
            this.updateMediaSession(track);

            // Trigger Now Playing scrobble (Last.fm & ListenBrainz)
            fetch(`/api/enrichment.php?action=scrobble_now_playing&track_id=${track.id}`, { method: 'POST' }).catch(() => {});
        } catch (err) {
            console.error("Playback start error:", err);
        }

        this.preloadNext();
    },

    updateMediaSession(track) {
        if ('mediaSession' in navigator) {
            const artUrl = '/api/library.php?action=art&album_id=' + (track.album_id || 0);
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title || 'Lossless Stream',
                artist: track.artist || 'Unknown Artist',
                album: track.album || 'Hi-Fi Collection',
                artwork: [
                    { src: artUrl, sizes: '96x96', type: 'image/jpeg' },
                    { src: artUrl, sizes: '256x256', type: 'image/jpeg' },
                    { src: artUrl, sizes: '512x512', type: 'image/jpeg' }
                ]
            });
            navigator.mediaSession.playbackState = 'playing';
            navigator.mediaSession.setActionHandler('play', () => Player.togglePlay());
            navigator.mediaSession.setActionHandler('pause', () => Player.togglePlay());
            navigator.mediaSession.setActionHandler('previoustrack', () => Player.prev());
            navigator.mediaSession.setActionHandler('nexttrack', () => Player.next());
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (Player.activeAudio && details.seekTime !== undefined) {
                    Player.activeAudio.currentTime = details.seekTime;
                }
            });
        }
    },

    preloadNext() {
        let nextIdx = this.queueIndex + 1;
        if (this.isShuffle) {
            nextIdx = Math.floor(Math.random() * this.queue.length);
        }
        if (this.queue[nextIdx]) {
            this.inactiveAudio.src = `/api/stream.php?id=${this.queue[nextIdx].id}`;
            this.inactiveAudio.load();
        }
    },

    togglePlay() {
        this.ensureAudioContext();
        if (!this.activeAudio.src && this.queue.length > 0) {
            this.playTrack(this.queue[this.queueIndex]);
            return;
        }

        if (this.activeAudio.paused) {
            this.activeAudio.play();
            if (typeof Visualizer !== 'undefined' && this.analyser) {
                Visualizer.start(this.analyser);
            }
        } else {
            this.activeAudio.pause();
        }
    },

    next() {
        if (this.queue.length === 0) return;

        if (this.repeatMode === 'one') {
            this.playTrack(this.queue[this.queueIndex]);
            return;
        }

        if (this.isShuffle) {
            this.queueIndex = Math.floor(Math.random() * this.queue.length);
        } else {
            this.queueIndex++;
            if (this.queueIndex >= this.queue.length) {
                if (this.repeatMode === 'all') {
                    this.queueIndex = 0;
                } else {
                    this.queueIndex = this.queue.length - 1;
                    return;
                }
            }
        }

        this.playTrack(this.queue[this.queueIndex]);
    },

    prev() {
        if (this.queue.length === 0) return;

        if (this.activeAudio && this.activeAudio.currentTime > 3) {
            this.activeAudio.currentTime = 0;
            return;
        }

        if (this.isShuffle) {
            this.queueIndex = Math.floor(Math.random() * this.queue.length);
        } else {
            this.queueIndex--;
            if (this.queueIndex < 0) {
                this.queueIndex = this.repeatMode === 'all' ? this.queue.length - 1 : 0;
            }
        }

        this.playTrack(this.queue[this.queueIndex]);
    },

    onTrackEnded() {
        if (this.repeatMode === 'one') {
            this.playTrack(this.queue[this.queueIndex]);
            return;
        }

        let nextIdx = this.queueIndex + 1;
        if (this.isShuffle) {
            nextIdx = Math.floor(Math.random() * this.queue.length);
        }

        if (nextIdx < this.queue.length || this.repeatMode === 'all') {
            if (nextIdx >= this.queue.length) nextIdx = 0;
            this.queueIndex = nextIdx;

            const temp = this.activeAudio;
            this.activeAudio = this.inactiveAudio;
            this.inactiveAudio = temp;

            this.currentTrack = this.queue[this.queueIndex];
            this.updateMetadataUI(this.currentTrack);
            this.fetchLyrics(this.currentTrack.id);

            this.activeAudio.play().then(() => {
                if (typeof Visualizer !== 'undefined' && this.analyser) {
                    Visualizer.start(this.analyser);
                }
                this.updateMediaSession(this.currentTrack);
            }).catch(e => console.error("Gapless transition play error:", e));

            this.preloadNext();
        } else {
            this.updatePlayStateUI(false);
        }
    },

    onTimeUpdate() {
        if (!this.activeAudio) return;

        const cur = this.activeAudio.currentTime || 0;
        const dur = this.getDuration();

        const pct = dur > 0 ? (cur / dur) * 100 : 0;

        const seekBar = document.getElementById('seek-bar');
        if (seekBar) seekBar.value = pct;

        const timeDisplay = document.getElementById('time-display');
        if (timeDisplay) {
            timeDisplay.textContent = `${this.formatTime(cur)} / ${this.formatTime(dur)}`;
        }

        const fsSeekBar = document.getElementById('fullscreen-seek-bar');
        if (fsSeekBar) fsSeekBar.value = pct;

        const fsCur = document.getElementById('fullscreen-current-time');
        const fsTot = document.getElementById('fullscreen-total-time');
        if (fsCur) fsCur.textContent = this.formatTime(cur);
        if (fsTot) fsTot.textContent = this.formatTime(dur);

        // Scrobble trigger (Last.fm & ListenBrainz standard: 50% duration or 240s)
        if (!this.hasScrobbledCurrent && this.currentTrack && dur >= 30) {
            if (cur >= 240 || cur >= (dur * 0.5)) {
                this.hasScrobbledCurrent = true;
                const ts = Math.floor(Date.now() / 1000);
                fetch(`/api/enrichment.php?action=scrobble_track&track_id=${this.currentTrack.id}&timestamp=${ts}`, { method: 'POST' }).catch(() => {});
            }
        }

        this.syncLyrics(cur);
    },

    syncLyrics(currentTime) {
        if (!this.lyrics || this.lyrics.length === 0) return;

        let activeIdx = -1;
        for (let i = 0; i < this.lyrics.length; i++) {
            if (currentTime >= this.lyrics[i].time) {
                activeIdx = i;
            } else {
                break;
            }
        }

        if (activeIdx !== this.currentLyricIndex) {
            this.currentLyricIndex = activeIdx;
            
            // 1. Normal Drawer Scrolling
            const drawerLines = document.querySelectorAll('#lyrics-overlay .lrc-line');
            drawerLines.forEach((el, idx) => {
                el.classList.toggle('active', idx === activeIdx);
            });

            const drawerContainer = document.querySelector('#lyrics-overlay .lyrics-content');
            if (drawerContainer && activeIdx >= 0 && drawerLines[activeIdx]) {
                const activeEl = drawerLines[activeIdx];
                const targetTop = activeEl.offsetTop - (drawerContainer.clientHeight / 2) + (activeEl.clientHeight / 2);
                drawerContainer.scrollTo({
                    top: Math.max(0, targetTop),
                    behavior: 'smooth'
                });
            }

            // 2. Fullscreen Stream Scrolling
            const fsLines = document.querySelectorAll('#fullscreen-lyrics-scroll .fs-lrc-line');
            fsLines.forEach((el, idx) => {
                el.classList.toggle('active', idx === activeIdx);
            });

            const fsContainer = document.getElementById('fullscreen-lyrics-scroll');
            if (fsContainer && activeIdx >= 0 && fsLines[activeIdx]) {
                const activeEl = fsLines[activeIdx];
                const targetTop = activeEl.offsetTop - (fsContainer.clientHeight / 2) + (activeEl.clientHeight / 2);
                fsContainer.scrollTo({
                    top: Math.max(0, targetTop),
                    behavior: 'smooth'
                });
            }
        }
    },

    async fetchLyrics(trackId) {
        this.lyrics = [];
        this.currentLyricIndex = -1;

        const drawerContent = document.querySelector('#lyrics-overlay .lyrics-content');
        const fsContent = document.getElementById('fullscreen-lyrics-scroll');

        if (drawerContent) drawerContent.innerHTML = '<div class="lrc-line">Looking for lyrics...</div>';
        if (fsContent) fsContent.innerHTML = '<div class="fs-lrc-line active">Looking for lyrics...</div>';

        try {
            const res = await fetch(`/api/library.php?action=lyrics&track_id=${trackId}`);
            const data = await res.json();
            if (data && data.lrc_text) {
                this.parseLrc(data.lrc_text);
            } else {
                const noLrcHtml = `
                    <div style="text-align:center; padding:30px 10px;">
                        <div style="font-size:1.1rem; color:var(--text-secondary); margin-bottom:12px;">No local lyrics found</div>
                        <button id="search-lyrics-online-btn" class="btn btn-secondary" style="font-size:0.85rem; padding:8px 16px;" onclick="window.fetchOnlineLyrics(${trackId})">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:6px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <span>Search Online Lyrics (LRCLIB)</span>
                        </button>
                    </div>
                `;
                if (drawerContent) drawerContent.innerHTML = noLrcHtml;
                if (fsContent) fsContent.innerHTML = noLrcHtml;
            }
        } catch (e) {
            if (drawerContent) drawerContent.innerHTML = '<div class="lrc-line">No lyrics available</div>';
            if (fsContent) fsContent.innerHTML = '<div class="fs-lrc-line active">Instrumental / No lyrics available</div>';
        }
    },

    parseLrc(lrcText) {
        const lines = lrcText.split(/\r?\n/);
        this.lyrics = [];

        lines.forEach(line => {
            const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
            if (match) {
                const mins = parseInt(match[1]);
                const secs = parseFloat(match[2]);
                const text = match[3].trim();
                if (text) {
                    this.lyrics.push({ time: mins * 60 + secs, text });
                }
            }
        });

        const drawerContent = document.querySelector('#lyrics-overlay .lyrics-content');
        const fsContent = document.getElementById('fullscreen-lyrics-scroll');

        if (this.lyrics.length === 0) {
            if (drawerContent) drawerContent.innerHTML = '<div class="lrc-line">Lyrics formatted as plain text</div>';
            if (fsContent) fsContent.innerHTML = '<div class="fs-lrc-line active">' + escapeHtml(lrcText) + '</div>';
            return;
        }

        let drawerHtml = '';
        let fsHtml = '';

        this.lyrics.forEach((l, idx) => {
            drawerHtml += `<div class="lrc-line" onclick="Player.seekToTime(${l.time})">${escapeHtml(l.text)}</div>`;
            fsHtml += `<div class="fs-lrc-line" onclick="Player.seekToTime(${l.time})">${escapeHtml(l.text)}</div>`;
        });

        if (drawerContent) drawerContent.innerHTML = drawerHtml;
        if (fsContent) fsContent.innerHTML = fsHtml;
    },

    seekToTime(seconds) {
        if (this.activeAudio) {
            this.activeAudio.currentTime = seconds;
        }
    },

    setVolume(vol) {
        if (this.activeAudio) this.activeAudio.volume = vol;
        if (this.inactiveAudio) this.inactiveAudio.volume = vol;

        localStorage.setItem('christos_volume', vol);

        const volBar = document.getElementById('volume-bar');
        const fsVolBar = document.getElementById('fullscreen-volume-bar');
        if (volBar) volBar.value = vol;
        if (fsVolBar) fsVolBar.value = vol;

        document.querySelectorAll('.vol-icon').forEach(icon => {
            if (vol === 0) {
                icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
            } else {
                icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
            }
        });
    },

    toggleMute() {
        if (this.isMuted) {
            this.setVolume(this.previousVolume || 0.8);
            this.isMuted = false;
        } else {
            this.previousVolume = this.activeAudio ? this.activeAudio.volume : 0.8;
            this.setVolume(0);
            this.isMuted = true;
        }
    },

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        document.querySelectorAll('#shuffle-btn, #fs-shuffle-btn').forEach(btn => {
            btn.classList.toggle('active', this.isShuffle);
            btn.style.color = this.isShuffle ? 'var(--accent-color)' : '';
        });
    },

    toggleRepeat() {
        const modes = ['off', 'all', 'one'];
        const nextIdx = (modes.indexOf(this.repeatMode) + 1) % modes.length;
        this.repeatMode = modes[nextIdx];

        document.querySelectorAll('#repeat-btn, #fs-repeat-btn').forEach(btn => {
            btn.classList.toggle('active', this.repeatMode !== 'off');
            if (this.repeatMode === 'one') {
                btn.title = 'Repeat One Track';
                btn.style.color = 'var(--accent-color)';
            } else if (this.repeatMode === 'all') {
                btn.title = 'Repeat All Tracks';
                btn.style.color = 'var(--accent-color)';
            } else {
                btn.title = 'Repeat Off';
                btn.style.color = '';
            }
        });
    },

    changeFullscreenLayout(layout) {
        this.fullscreenLayout = layout;
        localStorage.setItem('christos_fullscreen_layout', layout);

        const overlay = document.getElementById('fullscreen-view');
        if (overlay) {
            overlay.setAttribute('data-layout', layout);
            overlay.dataset.layout = layout;
        }

        document.querySelectorAll('.layout-toggle-btn').forEach(btn => {
            const btnLayout = btn.getAttribute('data-layout');
            btn.classList.toggle('active', btnLayout === layout);
        });

        if (typeof Visualizer !== 'undefined') {
            Visualizer.resize();
            if (this.analyser) Visualizer.start(this.analyser);
        }
    },

    toggleFullscreen(forceState = null) {
        const overlay = document.getElementById('fullscreen-view');
        if (!overlay) return;

        this.ensureAudioContext();

        this.isFullscreen = forceState !== null ? forceState : !this.isFullscreen;
        document.body.classList.toggle('fullscreen-active', this.isFullscreen);
        overlay.classList.toggle('active', this.isFullscreen);
        overlay.setAttribute('data-layout', this.fullscreenLayout);
        overlay.dataset.layout = this.fullscreenLayout;

        if (this.isFullscreen) {
            if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
            if (this.currentTrack) {
                this.updateMetadataUI(this.currentTrack);
            }
        } else {
            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
        }

        if (typeof Visualizer !== 'undefined') {
            Visualizer.resize();
            if (this.analyser) Visualizer.start(this.analyser);
        }
    },

    updateMetadataUI(track) {
        if (!track) return;
        const artUrl = `/api/library.php?action=art&album_id=${track.album_id || 0}&track_id=${track.id}&t=${Date.now()}`;

        // Bottom Player Bar
        const art = document.getElementById('now-playing-art');
        const title = document.getElementById('now-playing-title');
        const artist = document.getElementById('now-playing-artist');
        const badge = document.getElementById('audio-quality-badge');

        if (art) art.src = artUrl;
        if (title) title.textContent = track.title || 'Lossless Audio';
        if (artist) artist.textContent = `${track.artist || 'Unknown'} • ${track.album || ''}`;

        const formatLabel = `${(track.format || 'FLAC').toUpperCase()}${track.bit_depth ? ` • ${track.bit_depth}-Bit` : ''}${track.sample_rate ? ` / ${(track.sample_rate/1000).toFixed(0)}kHz` : ''}`;

        if (badge) {
            badge.textContent = formatLabel;
            badge.style.display = 'inline-block';
        }

        // Fullscreen Cinema Immersion Elements
        const fsArt = document.getElementById('fullscreen-art-img');
        const fsTitle = document.getElementById('fullscreen-track-title');
        const fsArtist = document.getElementById('fullscreen-track-artist');
        const fsAlbum = document.getElementById('fullscreen-track-album');
        const fsFormatTag = document.getElementById('fullscreen-format-tag');

        const miniArt = document.getElementById('fullscreen-mini-art');
        const tagTitle = document.getElementById('fullscreen-tag-title');
        const tagArtist = document.getElementById('fullscreen-tag-artist');

        if (fsArt) fsArt.src = artUrl;
        if (fsTitle) fsTitle.textContent = track.title || 'Unknown Title';
        if (fsArtist) fsArtist.textContent = track.artist || 'Unknown Artist';
        if (fsAlbum) fsAlbum.textContent = track.album || '';
        if (fsFormatTag) fsFormatTag.textContent = `${formatLabel} LOSSLESS MASTER`;

        if (miniArt) miniArt.src = artUrl;
        if (tagTitle) tagTitle.textContent = track.title || 'CHRISTOS Hi-Fi';
        if (tagArtist) tagArtist.textContent = track.artist || 'Lossless Audio Studio';

        // Update Favorite State
        const isFav = !!(track.is_favorite == 1 || track.is_favorite === true);
        window.updateFavoriteUI(track.id, isFav);

        // Update Star Rating State (0-5)
        const rating = parseInt(track.rating || 0, 10);
        window.updateRatingUI(track.id, rating);

        document.querySelectorAll('.track-row').forEach(row => {
            row.classList.toggle('playing', row.dataset.trackId == track.id);
        });
    },

    get isPlaying() {
        return this.activeAudio && !this.activeAudio.paused;
    },

    pause() {
        if (this.activeAudio && !this.activeAudio.paused) {
            this.activeAudio.pause();
        }
    },

    setQueue(tracks, startIndex = 0) {
        if (!tracks || tracks.length === 0) return;
        this.queue = tracks;
        this.queueIndex = startIndex;
        this.playTrack(this.queue[this.queueIndex]);
    },

    setSingleTrack(trackMeta, streamUrl) {
        this.ensureAudioContext();
        this.queue = [trackMeta];
        this.queueIndex = 0;
        this.currentTrack = trackMeta;
        this.updateMetadataUI(trackMeta);

        if (!streamUrl) streamUrl = `/api/stream.php?id=${trackMeta.id}`;
        this.activeAudio.src = streamUrl;
        this.activeAudio.currentTime = 0;
        this.activeAudio.play().then(() => {
            if (typeof Visualizer !== 'undefined' && this.analyser) {
                Visualizer.start(this.analyser);
            }
            this.updateMediaSession(trackMeta);
        }).catch(err => console.error("Playback error:", err));
    },

    updatePlayStateUI(isPlaying) {
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const fsPlayIcon = document.getElementById('fs-play-icon');
        const fsPauseIcon = document.getElementById('fs-pause-icon');

        if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
        if (pauseIcon) pauseIcon.style.display = isPlaying ? 'block' : 'none';

        if (fsPlayIcon) fsPlayIcon.style.display = isPlaying ? 'none' : 'block';
        if (fsPauseIcon) fsPauseIcon.style.display = isPlaying ? 'block' : 'none';
    },

    getDuration() {
        if (this.activeAudio && !isNaN(this.activeAudio.duration) && this.activeAudio.duration > 0) {
            return this.activeAudio.duration;
        }
        if (this.currentTrack && this.currentTrack.duration) {
            return this.currentTrack.duration;
        }
        return 0;
    },

    formatTime(sec) {
        if (!sec || isNaN(sec)) return '0:00';
        if (!isFinite(sec)) return 'Live';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }
};

/* ============================================================
   GLOBAL FAVORITE TOGGLING ENGINE
   ============================================================ */
window.toggleLike = async function(trackId = null) {
    const targetId = trackId || (Player.currentTrack ? Player.currentTrack.id : null);
    if (!targetId) return;

    try {
        const res = await fetch('/api/library.php?action=toggle_favorite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_id: targetId })
        });
        const data = await res.json();
        if (data && data.success) {
            const isFav = !!data.is_favorite;
            if (Player.currentTrack && Player.currentTrack.id == targetId) {
                Player.currentTrack.is_favorite = isFav ? 1 : 0;
            }
            window.updateFavoriteUI(targetId, isFav);

            // If in favorites view, re-render
            if (typeof currentView !== 'undefined' && currentView === 'favorites') {
                renderFavoritesView();
            }
        }
    } catch (e) {
        console.error("Failed to toggle favorite:", e);
    }
};

window.updateFavoriteUI = function(trackId, isFavorite) {
    const heartFill = isFavorite ? 'var(--accent-color)' : 'none';
    const heartStroke = isFavorite ? 'var(--accent-color)' : 'currentColor';

    // Player bottom bar
    const likeBtn = document.getElementById('like-btn');
    if (likeBtn) {
        likeBtn.classList.toggle('active', isFavorite);
        const svg = likeBtn.querySelector('svg');
        if (svg) {
            svg.setAttribute('fill', heartFill);
            svg.setAttribute('stroke', heartStroke);
        }
    }

    // Fullscreen bottom deck
    const fsLikeBtn = document.getElementById('fs-like-btn');
    if (fsLikeBtn) {
        fsLikeBtn.classList.toggle('active', isFavorite);
        const svg = fsLikeBtn.querySelector('svg');
        if (svg) {
            svg.setAttribute('fill', heartFill);
            svg.setAttribute('stroke', heartStroke);
        }
    }

    // Track rows
    document.querySelectorAll(`.track-like-btn-${trackId}`).forEach(btn => {
        btn.classList.toggle('active', isFavorite);
        const svg = btn.querySelector('svg');
        if (svg) {
            svg.setAttribute('fill', heartFill);
            svg.setAttribute('stroke', heartStroke);
        }
    });
};

/* ============================================================
   5-STAR RATINGS ENGINE
   ============================================================ */
window.rateTrack = async function(trackId = null, stars = 0) {
    const targetId = trackId || (Player.currentTrack ? Player.currentTrack.id : null);
    if (!targetId) return;

    // Toggle off if same rating clicked
    if (Player.currentTrack && Player.currentTrack.id == targetId && Player.currentTrack.rating === stars) {
        stars = 0;
    }

    try {
        const res = await fetch('/api/library.php?action=rate_track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_id: targetId, rating: stars })
        });
        const data = await res.json();
        if (data && data.success) {
            if (Player.currentTrack && Player.currentTrack.id == targetId) {
                Player.currentTrack.rating = stars;
            }
            window.updateRatingUI(targetId, stars);
        }
    } catch (e) {
        console.error("Failed to rate track:", e);
    }
};

window.rateAlbum = async function(albumId, stars = 0) {
    if (!albumId) return;
    try {
        const res = await fetch('/api/library.php?action=rate_album', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ album_id: albumId, rating: stars })
        });
        const data = await res.json();
        if (data && data.success) {
            window.updateAlbumRatingUI(albumId, stars);
        }
    } catch (e) {
        console.error("Failed to rate album:", e);
    }
};

window.updateRatingUI = function(trackId, rating) {
    // Player bar stars
    for (let i = 1; i <= 5; i++) {
        const star = document.getElementById(`track-star-${i}`);
        if (star) {
            star.classList.toggle('active', i <= rating);
            star.style.color = (i <= rating) ? '#f59e0b' : 'rgba(255,255,255,0.2)';
            star.style.fill = (i <= rating) ? '#f59e0b' : 'none';
        }
        const fsStar = document.getElementById(`fs-track-star-${i}`);
        if (fsStar) {
            fsStar.classList.toggle('active', i <= rating);
            fsStar.style.color = (i <= rating) ? '#f59e0b' : 'rgba(255,255,255,0.2)';
            fsStar.style.fill = (i <= rating) ? '#f59e0b' : 'none';
        }
    }

    // Row stars in library
    document.querySelectorAll(`.track-stars-${trackId} .star-icon`).forEach(btn => {
        const val = parseInt(btn.getAttribute('data-star') || '0', 10);
        btn.classList.toggle('active', val <= rating);
        btn.style.color = (val <= rating) ? '#f59e0b' : 'rgba(255,255,255,0.2)';
        btn.style.fill = (val <= rating) ? '#f59e0b' : 'none';
    });
};

window.updateAlbumRatingUI = function(albumId, rating) {
    document.querySelectorAll(`.album-stars-${albumId} .star-icon`).forEach(btn => {
        const val = parseInt(btn.getAttribute('data-star') || '0', 10);
        btn.classList.toggle('active', val <= rating);
        btn.style.color = (val <= rating) ? '#f59e0b' : 'rgba(255,255,255,0.2)';
        btn.style.fill = (val <= rating) ? '#f59e0b' : 'none';
    });
};

// Global Helpers
window.Player = Player;
window.toggleFullscreen = (force) => Player.toggleFullscreen(force);
window.setFullscreenLayout = (layout) => Player.changeFullscreenLayout(layout);
window.togglePlay = () => Player.togglePlay();
window.nextTrack = () => Player.next();
window.prevTrack = () => Player.prev();
window.toggleShuffle = () => Player.toggleShuffle();
window.toggleRepeat = () => Player.toggleRepeat();
window.toggleMute = () => Player.toggleMute();

window.toggleLyrics = () => {
    const overlay = document.getElementById('lyrics-overlay');
    if (overlay) {
        overlay.classList.toggle('active');
        overlay.classList.toggle('open');
    }
};

/* ============================================================
   ONLINE LYRICS SEARCH (LRCLIB.NET)
   ============================================================ */
window.fetchOnlineLyrics = async function(trackId) {
    const track = Player.currentTrack;
    if (!track) return;

    const btn = document.getElementById('search-lyrics-online-btn');
    if (btn) btn.innerHTML = '<span>Searching LRCLIB...</span>';

    try {
        const artist = encodeURIComponent(track.artist || '');
        const title = encodeURIComponent(track.title || '');
        const duration = track.duration ? Math.round(track.duration) : '';

        let url = `https://lrclib.net/api/search?artist_name=${artist}&track_name=${title}`;
        if (duration) url += `&duration=${duration}`;

        const res = await fetch(url);
        const results = await res.json();

        if (results && results.length > 0) {
            // Prefer synced lyrics, fallback to plain
            const best = results.find(r => r.syncedLyrics) || results[0];
            const lrcText = best.syncedLyrics || best.plainLyrics || '';

            if (lrcText) {
                Player.parseLrc(lrcText);

                // Persist to server
                try {
                    await fetch('/api/library.php?action=save_lyrics', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            track_id: trackId,
                            lrc_text: lrcText,
                            is_synced: best.syncedLyrics ? 1 : 0
                        })
                    });
                } catch (saveErr) {
                    console.warn('Could not save lyrics to server:', saveErr);
                }
            } else {
                showNoLyricsMessage();
            }
        } else {
            showNoLyricsMessage();
        }
    } catch (e) {
        console.error('LRCLIB search failed:', e);
        showNoLyricsMessage();
    }

    function showNoLyricsMessage() {
        const drawerContent = document.querySelector('#lyrics-overlay .lyrics-content');
        const fsContent = document.getElementById('fullscreen-lyrics-scroll');
        const noLrcHtml = '<div style="text-align:center; padding:30px 10px; color:var(--text-secondary);">No lyrics found online for this track.</div>';
        if (drawerContent) drawerContent.innerHTML = noLrcHtml;
        if (fsContent) fsContent.innerHTML = noLrcHtml;
    }
};
