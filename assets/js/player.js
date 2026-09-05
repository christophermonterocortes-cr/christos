window.escapeHtml = window.escapeHtml || function(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const SonoraRomanizer = {
    kanaMap: {
        'あ':'a','い':'i','う':'u','え':'e','お':'o',
        'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
        'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
        'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
        'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
        'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
        'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
        'や':'ya','ゆ':'yu','よ':'yo',
        'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
        'わ':'wa','を':'wo','ん':'n',
        'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
        'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
        'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
        'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
        'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
        'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
        'しゃ':'sha','しゅ':'shu','しょ':'sho',
        'ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
        'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
        'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
        'みゃ':'mya','みゅ':'myu','myo':'myo',
        'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
        'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
        'じゃ':'ja','じゅ':'ju','じょ':'jo',
        'びゃ':'bya','びゅ':'byu','びょ':'byo',
        'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
        'ア':'a','イ':'i','ウ':'u','エ':'e','オ':'o',
        'カ':'ka','キ':'ki','ク':'ku','ケ':'ke','コ':'ko',
        'サ':'sa','シ':'shi','ス':'su','セ':'se','ソ':'so',
        'タ':'ta','チ':'chi','ツ':'tsu','テ':'te','ト':'to',
        'ナ':'na','ニ':'ni','ヌ':'nu','ネ':'ne','ノ':'no',
        'ハ':'ha','ヒ':'hi','フ':'fu','ヘ':'he','ホ':'ho',
        'マ':'ma','ミ':'mi','ム':'mu','メ':'me','モ':'mo',
        'ヤ':'ya','ユ':'yu','ヨ':'yo',
        'ラ':'ra','リ':'ri','ル':'ru','レ':'re','ロ':'ro',
        'ワ':'wa','ヲ':'wo','ン':'n',
        'ガ':'ga','ギ':'gi','グ':'gu','ゲ':'ge','ゴ':'go',
        'ザ':'za','ジ':'ji','ズ':'zu','ゼ':'ze','ゾ':'zo',
        'ダ':'da','ヂ':'ji','ヅ':'zu','デ':'de','ド':'do',
        'バ':'ba','ビ':'bi','ブ':'bu','ベ':'be','ボ':'bo',
        'パ':'pa','ピ':'pi','プ':'pu','ペ':'pe','ポ':'po',
        'キャ':'kya','キュ':'kyu','キョ':'kyo',
        'シャ':'sha','シュ':'shu','ショ':'sho',
        'チャ':'cha','チュ':'chu','チョ':'cho',
        'ニャ':'nya','ニュ':'nyu','ニョ':'nyo',
        'ヒャ':'hya','ヒュ':'hyu','ヒョ':'hyo',
        'ミャ':'mya','ミュ':'myu','ミョ':'myo',
        'リャ':'rya','リュ':'ryu','リョ':'ryo',
        'ギャ':'gya','ギュ':'gyu','ギョ':'gyo',
        'ジャ':'ja','ジュ':'ju','ジョ':'jo',
        'ビャ':'bya','ビュ':'byu','ビョ':'byo',
        'ピャ':'pya','ピュ':'pyu','ピョ':'pyo'
    },

    romanizeHangul(text) {
        const initial = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
        const medial = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
        const final = ["","g","kk","gs","n","nj","nh","d","l","lg","lm","lb","ls","lt","lp","lh","m","b","bs","s","ss","ng","j","ch","k","t","p","h"];

        let res = "";
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if (code >= 0xAC00 && code <= 0xD7A3) {
                const syl = code - 0xAC00;
                const ini = Math.floor(syl / 588);
                const med = Math.floor((syl % 588) / 28);
                const fin = syl % 28;
                res += initial[ini] + medial[med] + final[fin];
            } else {
                res += text[i];
            }
        }
        return res;
    },

    romanize(text) {
        if (!text) return '';
        const hasCJK = /[\u3040-\u30ff\uac00-\ud7af]/.test(text);
        if (!hasCJK) return null;

        let out = '';
        let i = 0;
        while (i < text.length) {
            if (i + 1 < text.length) {
                const pair = text.substr(i, 2);
                if (this.kanaMap[pair]) {
                    out += this.kanaMap[pair];
                    i += 2;
                    continue;
                }
            }
            const single = text[i];
            if (this.kanaMap[single]) {
                out += this.kanaMap[single];
                i++;
                continue;
            }
            if (single === 'っ' || single === 'ッ') {
                if (i + 1 < text.length) {
                    const nextChar = text[i + 1];
                    const nextRomaji = this.kanaMap[nextChar] || '';
                    if (nextRomaji) {
                        out += nextRomaji[0];
                        i++;
                        continue;
                    }
                }
            }
            const code = text.charCodeAt(i);
            if (code >= 0xAC00 && code <= 0xD7A3) {
                out += this.romanizeHangul(single);
                i++;
                continue;
            }
            out += single;
            i++;
        }
        return (out && out !== text) ? out : null;
    }
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
    repeatMode: 'off', // 'off', 'all', 'one', 'n_times'
    repeatNTarget: 2,
    repeatNCurrent: 0,
    isMuted: false,
    previousVolume: 0.8,

    // Sleep Timer Engine
    sleepTimerRemaining: null, // seconds
    sleepTimerType: null, // 'minutes' or 'tracks'
    sleepTimerTracksRemaining: 0,
    sleepTimerInterval: null,

    // History tracking
    hasRecordedListen: false,

    lyrics: [],
    rawLrcText: '',
    currentLyricIndex: -1,
    lyricMode: localStorage.getItem('christos_lyric_mode') || 'synced', // 'synced' or 'plain'
    romanizeLyrics: localStorage.getItem('christos_romanize_lyrics') !== 'false',

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

        // Restore saved session if available
        this.restoreSavedSession();

        // Initialize lyric mode UI
        this.updateLyricModeUI();
    },

    restoreSavedSession() {
        try {
            const raw = localStorage.getItem('christos_saved_session');
            if (raw) {
                const sess = JSON.parse(raw);
                if (sess && sess.queue && sess.queue.length > 0) {
                    this.queue = sess.queue;
                    this.queueIndex = Math.min(sess.queueIndex || 0, this.queue.length - 1);
                    const track = this.queue[this.queueIndex];
                    if (track) {
                        this.currentTrack = track;
                        this.updateMetadataUI(track);
                        this.fetchLyrics(track.id);
                        this.activeAudio.src = track.stream_url || `/api/stream.php?id=${track.id}`;
                        if (sess.time && sess.time > 0) {
                            this.activeAudio.currentTime = sess.time;
                        }
                    }
                }
            }
        } catch (e) {}
    },

    saveSession() {
        if (!this.currentTrack || this.queue.length === 0) return;
        try {
            const sess = {
                queue: this.queue,
                queueIndex: this.queueIndex,
                trackId: this.currentTrack.id,
                time: this.activeAudio ? this.activeAudio.currentTime : 0
            };
            localStorage.setItem('christos_saved_session', JSON.stringify(sess));
        } catch (e) {}
    },

    startSleepTimer(type, value) {
        this.cancelSleepTimer();
        this.sleepTimerType = type;
        if (type === 'minutes') {
            this.sleepTimerRemaining = value * 60;
            this.sleepTimerInterval = setInterval(() => this.tickSleepTimer(), 1000);
        } else if (type === 'tracks') {
            this.sleepTimerTracksRemaining = value;
        }
        this.updateSleepTimerUI();
    },

    cancelSleepTimer() {
        if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);
        this.sleepTimerInterval = null;
        this.sleepTimerRemaining = null;
        this.sleepTimerType = null;
        this.sleepTimerTracksRemaining = 0;
        this.updateSleepTimerUI();
    },

    tickSleepTimer() {
        if (this.sleepTimerRemaining === null) return;
        this.sleepTimerRemaining--;
        this.updateSleepTimerUI();

        if (this.sleepTimerRemaining <= 5 && this.sleepTimerRemaining > 0) {
            // Gentle 5-second fadeout
            const targetVol = parseFloat(localStorage.getItem('christos_volume') || '0.8');
            const ramp = (this.sleepTimerRemaining / 5) * targetVol;
            this.setVolume(Math.max(0.01, ramp));
        } else if (this.sleepTimerRemaining <= 0) {
            this.cancelSleepTimer();
            this.fadePause(0.5);
            setTimeout(() => {
                this.setVolume(parseFloat(localStorage.getItem('christos_volume') || '0.8'));
            }, 600);
        }
    },

    updateSleepTimerUI() {
        const badges = document.querySelectorAll('.sleep-timer-badge');
        const btns = document.querySelectorAll('.sleep-timer-btn');
        if (this.sleepTimerType === 'minutes' && this.sleepTimerRemaining !== null) {
            const mins = Math.floor(this.sleepTimerRemaining / 60);
            const secs = this.sleepTimerRemaining % 60;
            const str = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            badges.forEach(b => { b.textContent = str; b.style.display = 'inline-block'; });
            btns.forEach(btn => btn.classList.add('active'));
        } else if (this.sleepTimerType === 'tracks' && this.sleepTimerTracksRemaining > 0) {
            badges.forEach(b => { b.textContent = `${this.sleepTimerTracksRemaining} trk`; b.style.display = 'inline-block'; });
            btns.forEach(btn => btn.classList.add('active'));
        } else {
            badges.forEach(b => b.style.display = 'none');
            btns.forEach(btn => btn.classList.remove('active'));
        }
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
        this.hasRecordedListen = false;
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

        const streamUrl = track.stream_url || `/api/stream.php?id=${track.id}`;
        this.activeAudio.src = streamUrl;
        this.activeAudio.currentTime = 0;

        try {
            await this.fadePlay(0.15);
            if (typeof Visualizer !== 'undefined' && this.analyser) {
                Visualizer.start(this.analyser);
            }
            if (typeof DSP !== 'undefined' && DSP.applyNightcore) {
                DSP.applyNightcore();
            }
            this.updateMediaSession(track);
            this.saveSession();

            // Trigger Now Playing scrobble (Last.fm & ListenBrainz)
            fetch(`/api/enrichment.php?action=scrobble_now_playing&track_id=${track.id}`, { method: 'POST' }).catch(() => {});
        } catch (err) {
            console.error("Playback start error:", err);
        }

        this.preloadNext();
    },

    fadePlay(duration = 0.2) {
        this.ensureAudioContext();
        if (!this.activeAudio.src && this.queue.length > 0) {
            this.playTrack(this.queue[this.queueIndex]);
            return Promise.resolve();
        }
        const targetVol = parseFloat(localStorage.getItem('christos_volume') || '0.8');
        this.activeAudio.volume = 0;
        return this.activeAudio.play().then(() => {
            if (typeof Visualizer !== 'undefined' && this.analyser) {
                Visualizer.start(this.analyser);
            }
            let start = performance.now();
            let ramp = setInterval(() => {
                let elapsed = (performance.now() - start) / (duration * 1000);
                if (elapsed >= 1) {
                    this.activeAudio.volume = targetVol;
                    clearInterval(ramp);
                } else {
                    this.activeAudio.volume = Math.max(0, Math.min(targetVol, elapsed * targetVol));
                }
            }, 20);
        });
    },

    fadePause(duration = 0.2) {
        if (!this.activeAudio || this.activeAudio.paused) return;
        const currentVol = this.activeAudio.volume;
        let start = performance.now();
        let ramp = setInterval(() => {
            let elapsed = (performance.now() - start) / (duration * 1000);
            if (elapsed >= 1) {
                this.activeAudio.pause();
                this.activeAudio.volume = currentVol;
                clearInterval(ramp);
            } else {
                this.activeAudio.volume = Math.max(0, (1 - elapsed) * currentVol);
            }
        }, 20);
    },

    togglePlay() {
        this.ensureAudioContext();
        if (!this.activeAudio.src && this.queue.length > 0) {
            this.playTrack(this.queue[this.queueIndex]);
            return;
        }

        if (this.activeAudio.paused) {
            this.fadePlay(0.2);
        } else {
            this.fadePause(0.2);
        }
    },

    insertAfterCurrent(tracks) {
        if (!tracks) return;
        const arr = Array.isArray(tracks) ? tracks : [tracks];
        if (this.queue.length === 0) {
            this.setQueue(arr);
            return;
        }
        const pos = this.queueIndex + 1;
        this.queue.splice(pos, 0, ...arr);
        this.preloadNext();
        this.saveSession();
    },

    addToQueue(tracks) {
        if (!tracks) return;
        const arr = Array.isArray(tracks) ? tracks : [tracks];
        if (this.queue.length === 0) {
            this.setQueue(arr);
            return;
        }
        this.queue.push(...arr);
        this.preloadNext();
        this.saveSession();
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
        // Handle Sleep Timer by Tracks
        if (this.sleepTimerType === 'tracks' && this.sleepTimerTracksRemaining > 0) {
            this.sleepTimerTracksRemaining--;
            this.updateSleepTimerUI();
            if (this.sleepTimerTracksRemaining <= 0) {
                this.cancelSleepTimer();
                this.fadePause(0.5);
                return;
            }
        }

        // Handle Repeat for N times mode
        if (this.repeatMode === 'n_times') {
            if (this.repeatNCurrent < this.repeatNTarget - 1) {
                this.repeatNCurrent++;
                this.playTrack(this.queue[this.queueIndex]);
                return;
            } else {
                this.repeatNCurrent = 0;
            }
        } else if (this.repeatMode === 'one') {
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
            this.hasRecordedListen = false;
            this.updateMetadataUI(this.currentTrack);
            this.fetchLyrics(this.currentTrack.id);

            this.fadePlay(0.2).then(() => {
                if (typeof Visualizer !== 'undefined' && this.analyser) {
                    Visualizer.start(this.analyser);
                }
                this.updateMediaSession(this.currentTrack);
                this.saveSession();
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

        // Record listen history to database (Namida standard: 30 seconds or 50%)
        if (!this.hasRecordedListen && this.currentTrack && dur >= 15) {
            if (cur >= 30 || cur >= (dur * 0.5)) {
                this.hasRecordedListen = true;
                fetch('/api/library.php?action=record_listen', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ track_id: this.currentTrack.id })
                }).catch(() => {});
            }
        }

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
        if (this.lyricMode === 'plain') return;
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

    setLyricMode(mode) {
        this.lyricMode = mode;
        localStorage.setItem('christos_lyric_mode', mode);
        this.updateLyricModeUI();
        this.renderLyrics();
    },

    toggleRomaji() {
        this.romanizeLyrics = !this.romanizeLyrics;
        localStorage.setItem('christos_romanize_lyrics', this.romanizeLyrics ? 'true' : 'false');
        this.updateLyricModeUI();
        this.renderLyrics();
    },

    updateLyricModeUI() {
        document.querySelectorAll('.lyric-mode-btn[data-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-mode') === this.lyricMode);
        });
        document.querySelectorAll('#lyric-romaji-toggle-btn, #fs-lyric-romaji-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', !!this.romanizeLyrics);
        });
    },

    async fetchLyrics(trackId) {
        this.lyrics = [];
        this.rawLrcText = '';
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
        this.rawLrcText = lrcText || '';
        this.renderLyrics();
    },

    renderLyrics() {
        const drawerContent = document.querySelector('#lyrics-overlay .lyrics-content');
        const fsContent = document.getElementById('fullscreen-lyrics-scroll');

        if (!this.rawLrcText || !this.rawLrcText.trim()) {
            const noLrcHtml = `
                <div style="text-align:center; padding:30px 10px;">
                    <div style="font-size:1.1rem; color:var(--text-secondary); margin-bottom:12px;">No lyrics available</div>
                    ${this.currentTrack ? `
                    <button id="search-lyrics-online-btn" class="btn btn-secondary" style="font-size:0.85rem; padding:8px 16px;" onclick="window.fetchOnlineLyrics(${this.currentTrack.id})">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:6px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <span>Search Online Lyrics (LRCLIB)</span>
                    </button>` : ''}
                </div>
            `;
            if (drawerContent) drawerContent.innerHTML = noLrcHtml;
            if (fsContent) fsContent.innerHTML = noLrcHtml;
            return;
        }

        const rawLines = this.rawLrcText.split(/\r?\n/);
        this.lyrics = [];

        rawLines.forEach(line => {
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

        this.updateLyricModeUI();

        // If Plain Mode or no timestamped lyrics found in text
        if (this.lyricMode === 'plain' || this.lyrics.length === 0) {
            let plainHtml = '';
            rawLines.forEach(line => {
                const cleaned = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
                if (!cleaned) {
                    plainHtml += '<div style="height:14px;"></div>';
                    return;
                }
                let romajiHtml = '';
                if (this.romanizeLyrics && typeof SonoraRomanizer !== 'undefined') {
                    const rom = SonoraRomanizer.romanize(cleaned);
                    if (rom) {
                        romajiHtml = `<div class="lyric-line-romanized" style="font-size:0.85rem; color:var(--accent-color); margin-top:2px;">${escapeHtml(rom)}</div>`;
                    }
                }
                plainHtml += `<div style="margin-bottom:12px;"><span>${escapeHtml(cleaned)}</span>${romajiHtml}</div>`;
            });

            if (drawerContent) drawerContent.innerHTML = `<div class="plain-lyrics-body">${plainHtml}</div>`;
            if (fsContent) fsContent.innerHTML = `<div class="fs-plain-lyrics-body">${plainHtml}</div>`;
            return;
        }

        // Synced Mode
        let drawerHtml = '';
        let fsHtml = '';

        this.lyrics.forEach((l, idx) => {
            let romajiHtml = '';
            if (this.romanizeLyrics && typeof SonoraRomanizer !== 'undefined') {
                const rom = SonoraRomanizer.romanize(l.text);
                if (rom) {
                    romajiHtml = `<span class="lyric-line-romanized">${escapeHtml(rom)}</span>`;
                }
            }

            drawerHtml += `<div class="lrc-line" onclick="Player.seekToTime(${l.time})"><span>${escapeHtml(l.text)}</span>${romajiHtml}</div>`;
            fsHtml += `<div class="fs-lrc-line" onclick="Player.seekToTime(${l.time})"><span>${escapeHtml(l.text)}</span>${romajiHtml}</div>`;
        });

        if (drawerContent) drawerContent.innerHTML = drawerHtml;
        if (fsContent) fsContent.innerHTML = fsHtml;

        this.currentLyricIndex = -1;
        if (this.activeAudio) {
            this.syncLyrics(this.activeAudio.currentTime);
        }
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
        const modes = ['off', 'all', 'one', '2x', '3x'];
        let currentKey = this.repeatMode;
        if (this.repeatMode === 'n_times') {
            currentKey = this.repeatNTarget === 2 ? '2x' : '3x';
        }
        const nextIdx = (modes.indexOf(currentKey) + 1) % modes.length;
        const nextMode = modes[nextIdx];

        if (nextMode === '2x') {
            this.repeatMode = 'n_times';
            this.repeatNTarget = 2;
            this.repeatNCurrent = 0;
        } else if (nextMode === '3x') {
            this.repeatMode = 'n_times';
            this.repeatNTarget = 3;
            this.repeatNCurrent = 0;
        } else {
            this.repeatMode = nextMode;
        }

        document.querySelectorAll('#repeat-btn, #fs-repeat-btn').forEach(btn => {
            btn.classList.toggle('active', this.repeatMode !== 'off');
            if (this.repeatMode === 'one') {
                btn.title = 'Repeat One Track';
                btn.style.color = 'var(--accent-color)';
            } else if (this.repeatMode === 'all') {
                btn.title = 'Repeat All Tracks';
                btn.style.color = 'var(--accent-color)';
            } else if (this.repeatMode === 'n_times') {
                btn.title = `Repeat Track ${this.repeatNTarget}x`;
                btn.style.color = 'var(--accent-secondary, #06b6d4)';
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

        if (!streamUrl) streamUrl = trackMeta.stream_url || `/api/stream.php?id=${trackMeta.id}`;
        this.activeAudio.src = streamUrl;
        this.activeAudio.currentTime = 0;
        this.activeAudio.play().then(() => {
            if (typeof Visualizer !== 'undefined' && this.analyser) {
                Visualizer.start(this.analyser);
            }
            if (typeof DSP !== 'undefined' && DSP.applyNightcore) {
                DSP.applyNightcore();
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
window.setLyricMode = (mode) => Player.setLyricMode(mode);
window.toggleRomaji = () => Player.toggleRomaji();

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
