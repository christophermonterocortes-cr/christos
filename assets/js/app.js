/**
 * CHRISTOS Hi-Fi Audio & Media Server Application Controller
 * Version 2.3.0 - Audiophile DSP, Sort By, TV Shows, Spotlight & Universal Downloader
 */

let currentView = 'library';
let currentLibrary = 'flac';
let currentFilePath = '';
let currentFileRoot = 'everything';
let downloaderPollTimer = null;
let currentMoviesList = [];
let currentTvSeriesList = [];
let currentPlaylistsList = [];
let currentPlaylistDetail = null;
let currentTrackList = [];
let originalTrackList = [];

// Sort state
let currentSortField = 'title';
let currentSortAsc = true;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Load and apply saved theme
    const savedTheme = localStorage.getItem('christos_theme') || 'apple';
    changeAppTheme(savedTheme, false);

    // 2. Initialize Player & Visualizer
    if (typeof Player !== 'undefined' && Player.init) {
        Player.init();
    }
    if (typeof Visualizer !== 'undefined' && Visualizer.init) {
        Visualizer.init();
    }

    // 3. Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // 4. Load default view (Strictly FLAC Library by default)
    loadView('library', 'flac');
    initGlobalShortcuts();
    initSpotlightSearch();
});

function changeAppTheme(themeName, reloadView = true) {
    document.documentElement.dataset.theme = themeName;
    localStorage.setItem('christos_theme', themeName);

    const themeLink = document.getElementById('theme-css');
    if (themeLink) {
        themeLink.href = 'assets/css/' + themeName + '.css?v=2.3.0';
    }

    document.querySelectorAll('#theme-select, #settings-theme-select').forEach(sel => {
        sel.value = themeName;
    });

    if (reloadView && typeof Visualizer !== 'undefined') {
        Visualizer.resize();
    }
}

function initGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        
        // Spotlight Search (Ctrl+K, Cmd+K, or '/')
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            openSpotlight();
            return;
        }
        if (e.key === '/') {
            e.preventDefault();
            openSpotlight();
            return;
        }

        if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            toggleFullscreen();
        } else if (e.key === ' ') {
            e.preventDefault();
            togglePlay();
        } else if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            prevTrack();
        } else if (e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            nextTrack();
        } else if (e.key === 'l' || e.key === 'L') {
            e.preventDefault();
            toggleLyrics();
        } else if (e.key === 'v' || e.key === 'V') {
            e.preventDefault();
            if (typeof Visualizer !== 'undefined' && typeof Visualizer.cycle === 'function') {
                Visualizer.cycle();
            } else {
                // Cycle through visualizer options via the select dropdown
                const sel = document.getElementById('fullscreen-viz-select');
                if (sel) {
                    let next = (parseInt(sel.value) + 1) % sel.options.length;
                    sel.value = next;
                    if (typeof changeVisualizer === 'function') changeVisualizer(next);
                }
            }
        } else if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            if (typeof DSP !== 'undefined') DSP.openModal();
        }
    });
}

function updateSidebarActive(viewName) {
    document.querySelectorAll('#sidebar li').forEach(li => {
        li.classList.remove('active');
    });
    const target = document.querySelector('#sidebar li[data-view="' + viewName + '"]');
    if (target) {
        target.classList.add('active');
    }
}

async function loadView(view, param = null) {
    if (downloaderPollTimer) {
        clearInterval(downloaderPollTimer);
        downloaderPollTimer = null;
    }

    currentView = view;
    const viewContainer = document.getElementById('content-view');
    viewContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading view...</p></div>';

    try {
        if (view === 'library') {
            currentLibrary = param || currentLibrary || 'flac';
            updateSidebarActive('library-' + currentLibrary);
            await renderLibraryView(currentLibrary);
        } else if (view === 'movies') {
            updateSidebarActive('movies');
            await renderMoviesView();
        } else if (view === 'tvshows') {
            updateSidebarActive('tvshows');
            await renderTvShowsView();
        } else if (view === 'files') {
            updateSidebarActive('files');
            await renderFilesView(param || currentFilePath, currentFileRoot);
        } else if (view === 'downloader') {
            updateSidebarActive('downloader');
            await renderDownloaderView();
        } else if (view === 'artists') {
            updateSidebarActive('artists');
            await renderArtistsView();
        } else if (view === 'playlists') {
            updateSidebarActive('playlists');
            await renderPlaylistsView();
        } else if (view === 'favorites') {
            updateSidebarActive('favorites');
            await renderFavoritesView();
        } else if (view === 'settings') {
            updateSidebarActive('settings');
            renderSettingsView();
        }
    } catch (err) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Error Loading View</h3><p>' + escapeHtml(err.message) + '</p></div>';
    }
}

/* ============================================================
   1. MUSIC LIBRARY VIEW (CAPSULE GRID & ADVANCED SORT BY)
   ============================================================ */
async function renderLibraryView(libKey) {
    const viewContainer = document.getElementById('content-view');
    currentLibrary = libKey;

    try {
        const [tracksRes, statsRes] = await Promise.all([
            fetch('/api/library.php?action=tracks&library=' + libKey),
            fetch('/api/library.php?action=stats&library=' + libKey)
        ]);

        const tracks = await tracksRes.json();
        const stats = await statsRes.json();
        originalTrackList = tracks.slice();
        currentTrackList = tracks;

        // Apply current sort
        applyCurrentSort(false);

        const libTitle = (libKey === 'flac') ? 'FLAC Collection' : 'Apple Music ALAC';

        let html = `
            <div class="view-header" style="margin-bottom:14px;">
                <div class="library-switcher-tabs" style="margin-bottom:12px;">
                    <button class="lib-tab-btn ${libKey === 'flac' ? 'active' : ''}" onclick="loadView('library', 'flac')">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                        FLAC Collection
                    </button>
                    <button class="lib-tab-btn ${libKey === 'apple_music' ? 'active' : ''}" onclick="loadView('library', 'apple_music')">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        Apple Music ALAC
                    </button>
                </div>
                <div class="view-title-row" style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h2 style="font-size:1.5rem; font-weight:800; color:#fff;">${libTitle}</h2>
                        <p style="color:var(--text-secondary); font-size:0.85rem; margin-top:2px;">
                            ${tracks.length} Tracks • ${stats.albums || 0} Albums • Bit-Perfect Lossless
                        </p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <!-- SORT BY DROPDOWN (MATCHING USER SCREENSHOT) -->
                        <div class="sort-container">
                            <button class="sort-trigger-btn" onclick="toggleSortMenu()">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/></svg>
                                <span>Sort By: ${getSortLabel(currentSortField)}</span>
                                <span class="sort-dir-arrow">${currentSortAsc ? '↑' : '↓'}</span>
                            </button>
                            <div class="sort-menu" id="sort-dropdown-menu">
                                ${renderSortMenuItems()}
                            </div>
                        </div>

                        <button class="btn btn-secondary" onclick="triggerLibraryRescan()" title="Rescan Library Files">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                            <span>Rescan</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 4-COLUMN CAPSULE GRID -->
            <div class="capsule-grid" id="library-capsule-grid">
                ${renderCapsulesHtml(currentTrackList)}
            </div>
        `;

        viewContainer.innerHTML = html;
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load library</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

function renderCapsulesHtml(tracks) {
    if (!tracks || tracks.length === 0) {
        return `<div style="grid-column:1/-1; padding:60px; text-align:center; color:var(--text-secondary);">
            <h3>No tracks found</h3>
            <p style="margin-top:8px;">Click Rescan to index your files</p>
        </div>`;
    }

    let html = '';
    tracks.forEach((track, idx) => {
        const artUrl = '/api/library.php?action=art&album_id=' + track.album_id;
        html += `
            <div class="capsule-card" onclick="playTrackFromCapsule(${idx})" title="${escapeHtml(track.title)} - ${escapeHtml(track.artist)}">
                <div class="capsule-art-wrap">
                    <img class="capsule-art-img" src="${artUrl}" alt="${escapeHtml(track.title)}" loading="lazy" onerror="this.onerror=null; this.src='assets/img/default-star.svg';">
                </div>
                <div class="capsule-info">
                    <div class="capsule-title">${escapeHtml(track.title)}</div>
                    <div class="capsule-artist">${escapeHtml(track.artist)}</div>
                </div>
                <div class="capsule-play-hover">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                </div>
            </div>
        `;
    });
    return html;
}

function playTrackFromCapsule(trackIndex) {
    if (currentTrackList && currentTrackList.length > 0) {
        Player.setQueue(currentTrackList, trackIndex);
    }
}

/* ============================================================
   SORT BY ENGINE (17 MODES MATCHING USER SCREENSHOT)
   ============================================================ */
const SORT_FIELDS = [
    { key: 'album', label: 'Album' },
    { key: 'album_artist', label: 'Album Artist' },
    { key: 'artist', label: 'Artist' },
    { key: 'bitrate', label: 'Bitrate' },
    { key: 'community_rating', label: 'Community Rating' },
    { key: 'composer', label: 'Composer' },
    { key: 'container', label: 'Container' },
    { key: 'date_added', label: 'Date Added' },
    { key: 'date_played', label: 'Date Played' },
    { key: 'file_name', label: 'File Name' },
    { key: 'number', label: 'Number' },
    { key: 'parental_rating', label: 'Parental Rating' },
    { key: 'plays', label: 'Plays' },
    { key: 'random', label: 'Random' },
    { key: 'release_date', label: 'Release Date' },
    { key: 'runtime', label: 'Runtime' },
    { key: 'size', label: 'Size' },
    { key: 'title', label: 'Title' },
    { key: 'year', label: 'Year' }
];

function getSortLabel(fieldKey) {
    const f = SORT_FIELDS.find(s => s.key === fieldKey);
    return f ? f.label : 'Title';
}

function toggleSortMenu() {
    const menu = document.getElementById('sort-dropdown-menu');
    if (menu) menu.classList.toggle('active');
}

function renderSortMenuItems() {
    return SORT_FIELDS.map(f => {
        const isActive = (f.key === currentSortField);
        return `
            <div class="sort-menu-item ${isActive ? 'active' : ''}" onclick="setSortField('${f.key}')">
                <div class="sort-item-left">
                    <svg class="sort-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>${f.label}</span>
                </div>
                ${isActive ? `<span class="sort-dir-arrow">${currentSortAsc ? '↑' : '↓'}</span>` : ''}
            </div>
        `;
    }).join('');
}

function setSortField(field) {
    if (currentSortField === field) {
        currentSortAsc = !currentSortAsc;
    } else {
        currentSortField = field;
        currentSortAsc = true;
    }

    applyCurrentSort(true);
    toggleSortMenu();
}

function applyCurrentSort(updateDom = true) {
    if (!currentTrackList || currentTrackList.length === 0) return;

    if (currentSortField === 'random') {
        currentTrackList.sort(() => Math.random() - 0.5);
    } else {
        currentTrackList.sort((a, b) => {
            let valA = '';
            let valB = '';

            if (currentSortField === 'title') { valA = a.title || ''; valB = b.title || ''; }
            else if (currentSortField === 'artist') { valA = a.artist || ''; valB = b.artist || ''; }
            else if (currentSortField === 'album') { valA = a.album || ''; valB = b.album || ''; }
            else if (currentSortField === 'album_artist') { valA = a.album_artist || a.artist || ''; valB = b.album_artist || b.artist || ''; }
            else if (currentSortField === 'runtime') { valA = a.duration || 0; valB = b.duration || 0; }
            else if (currentSortField === 'number') { valA = a.track_number || 0; valB = b.track_number || 0; }
            else if (currentSortField === 'container') { valA = a.format || ''; valB = b.format || ''; }
            else if (currentSortField === 'file_name') { valA = a.file_path || ''; valB = b.file_path || ''; }
            else if (currentSortField === 'year' || currentSortField === 'release_date') { valA = a.year || 0; valB = b.year || 0; }
            else { valA = a.title || ''; valB = b.title || ''; }

            if (typeof valA === 'number' && typeof valB === 'number') {
                return currentSortAsc ? (valA - valB) : (valB - valA);
            }
            return currentSortAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
        });
    }

    if (updateDom) {
        const grid = document.getElementById('library-capsule-grid');
        if (grid) grid.innerHTML = renderCapsulesHtml(currentTrackList);

        const btnText = document.querySelector('.sort-trigger-btn span');
        const arrow = document.querySelector('.sort-dir-arrow');
        if (btnText) btnText.textContent = 'Sort By: ' + getSortLabel(currentSortField);
        if (arrow) arrow.textContent = currentSortAsc ? '↑' : '↓';

        const menu = document.getElementById('sort-dropdown-menu');
        if (menu) menu.innerHTML = renderSortMenuItems();
    }
}

/* ============================================================
   2. TV SHOWS & SERIES VIEW
   ============================================================ */
async function renderTvShowsView() {
    const viewContainer = document.getElementById('content-view');
    try {
        const res = await fetch('/api/tvshows.php?action=series');
        currentTvSeriesList = await res.json();

        let html = `
            <div class="movies-hero" style="margin-bottom:18px;">
                <div class="movies-hero-content">
                    <h2><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:8px;"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>TrueNAS TV Shows & Series</h2>
                    <p>Stream complete seasons and high-definition TV series from /mnt/DISK_MAC/thecus/LL/disk/Series(TVshows) with episode selector and subtitle tracks.</p>
                </div>
                <div style="font-size:1rem; font-weight:700; color:#fff; background:rgba(0,0,0,0.5); padding:10px 18px; border-radius:12px; border:1px solid rgba(255,255,255,0.1);">
                    ${currentTvSeriesList.length} Series Available
                </div>
            </div>
            <div class="movies-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 220px)); gap:16px;">
        `;

        if (!currentTvSeriesList || currentTvSeriesList.length === 0) {
            html += `<div style="grid-column:1/-1; padding:60px; text-align:center; color:var(--text-secondary);">
                <h3>No TV shows found in /mnt/DISK_MAC/thecus/LL/disk/Series(TVshows)</h3>
            </div>`;
        } else {
            currentTvSeriesList.forEach(series => {
                html += `
                    <div class="movie-card" onclick="openTvSeriesDetail('${escapeHtml(series.folder)}')" style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:12px; overflow:hidden; cursor:pointer;">
                        <div class="movie-poster-wrap" style="position:relative; width:100%; aspect-ratio:16/9; background:#111; overflow:hidden;">
                            <img class="movie-poster-img" src="${series.poster}" alt="${escapeHtml(series.title)}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
                            <div class="movie-badge-group" style="position:absolute; top:8px; left:8px; display:flex; gap:4px; z-index:2;">
                                <span class="movie-badge" style="background:#3b82f6;">${series.season_count} Seasons</span>
                                <span class="movie-badge quality">${series.episode_count} Eps</span>
                            </div>
                        </div>
                        <div class="movie-info" style="padding:10px 12px;">
                            <div class="movie-title" title="${escapeHtml(series.title)}" style="font-size:0.9rem; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(series.title)}</div>
                            <div class="movie-meta-row" style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.78rem; color:var(--text-secondary);">
                                <span>${series.formatted_size}</span>
                                <span style="color:#ffbb00; font-weight:700;">★ ${series.rating}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        viewContainer.innerHTML = html;
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load TV shows</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

async function openTvSeriesDetail(seriesFolder) {
    const viewContainer = document.getElementById('content-view');
    viewContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading episodes...</p></div>';

    try {
        const res = await fetch('/api/tvshows.php?action=episodes&series=' + encodeURIComponent(seriesFolder));
        const episodes = await res.json();

        let html = `
            <div class="album-detail-view">
                <button class="back-btn" onclick="loadView('tvshows')">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    <span>Back to TV Shows</span>
                </button>
                <div class="view-header" style="margin-top:14px;">
                    <h2>${escapeHtml(seriesFolder)}</h2>
                    <p style="color:var(--text-secondary);">${episodes.length} Episodes Available</p>
                </div>
                <div class="capsule-grid">
        `;

        episodes.forEach((ep, idx) => {
            html += `
                <div class="capsule-card" onclick="playTvEpisode(${idx})" title="S${ep.season}E${ep.episode}: ${escapeHtml(ep.title)}">
                    <div class="capsule-art-wrap" style="aspect-ratio:16/9; width:64px; height:44px;">
                        <img class="capsule-art-img" src="${ep.poster}" alt="Episode Poster" loading="lazy" onerror="this.onerror=null; this.src='assets/img/default-star.svg';">
                    </div>
                    <div class="capsule-info">
                        <div class="capsule-title">S${ep.season}E${ep.episode} - ${escapeHtml(ep.title)}</div>
                        <div class="capsule-artist">${ep.quality} • ${ep.formatted_size}</div>
                    </div>
                    <div class="capsule-play-hover">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
        window.currentTvEpisodeList = episodes;
        viewContainer.innerHTML = html;
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load series</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

function playTvEpisode(epIdx) {
    if (!window.currentTvEpisodeList || !window.currentTvEpisodeList[epIdx]) return;
    const ep = window.currentTvEpisodeList[epIdx];

    if (typeof Player !== 'undefined' && Player.isPlaying) {
        Player.pause();
    }

    openTheaterModalWithVideo(ep.title + ' (S' + ep.season + 'E' + ep.episode + ')', ep.quality, ep.stream_url, ep.subtitles, () => {
        // Next Episode autoplay callback
        if (window.currentTvEpisodeList[epIdx + 1]) {
            playTvEpisode(epIdx + 1);
        }
    });
}

/* ============================================================
   3. MOVIES & CINEMA THEATER VIEW (RESUME, SPEED & PiP)
   ============================================================ */
async function renderMoviesView() {
    const viewContainer = document.getElementById('content-view');
    try {
        const res = await fetch('/api/movies.php?action=list');
        currentMoviesList = await res.json();

        let html = `
            <div class="movies-hero" style="margin-bottom:18px;">
                <div class="movies-hero-content">
                    <h2><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:8px;"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>TrueNAS Cinema & Theater</h2>
                    <p>Stream high-bitrate 4K UHD, HDR, and 1080p movies directly from your /mnt/DISK_MAC/thecus media collection with resume playback and subtitle tracks.</p>
                </div>
                <div style="font-size:1rem; font-weight:700; color:#fff; background:rgba(0,0,0,0.5); padding:10px 18px; border-radius:12px; border:1px solid rgba(255,255,255,0.1);">
                    ${currentMoviesList.length} Movies Available
                </div>
            </div>
            <div class="movies-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 220px)); gap:16px;">
        `;

        if (!currentMoviesList || currentMoviesList.length === 0) {
            html += `<div style="grid-column:1/-1; padding:60px; text-align:center; color:var(--text-secondary);">
                <h3>No video files found in /mnt/DISK_MAC/thecus/LL/disk/media</h3>
            </div>`;
        } else {
            currentMoviesList.forEach(movie => {
                const posterUrl = movie.poster || ('/api/movies.php?action=poster&file=' + encodeURIComponent(movie.file_path));
                const qualityBadge = '<span class="movie-badge quality">' + movie.quality + '</span>';
                const hdrBadge = movie.hdr ? ('<span class="movie-badge hdr">' + movie.hdr + '</span>') : '';
                const subBadge = (movie.subtitles && movie.subtitles.length > 0) ? ('<span class="movie-badge" style="background:#20bf6b;">CC (' + movie.subtitles.length + ')</span>') : '';

                html += `
                    <div class="movie-card" onclick="openTheaterModalById(${movie.id})" style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:12px; overflow:hidden; cursor:pointer;">
                        <div class="movie-poster-wrap" style="position:relative; width:100%; aspect-ratio:16/9; background:#111; overflow:hidden;">
                            <img class="movie-poster-img" src="${posterUrl}" alt="${escapeHtml(movie.title)}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
                            <div class="movie-badge-group" style="position:absolute; top:8px; left:8px; display:flex; gap:4px; z-index:2;">
                                ${qualityBadge}
                                ${hdrBadge}
                                ${subBadge}
                            </div>
                            <div class="movie-play-overlay">
                                <div class="movie-play-btn" style="width:44px; height:44px; border-radius:50%; background:var(--accent-color); color:#fff; display:flex; align-items:center; justify-content:center;">
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                                </div>
                            </div>
                        </div>
                        <div class="movie-info" style="padding:10px 12px;">
                            <div class="movie-title" title="${escapeHtml(movie.title)}" style="font-size:0.9rem; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(movie.title)}</div>
                            <div class="movie-meta-row" style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.78rem; color:var(--text-secondary);">
                                <span>${movie.year || 'Movie'} • ${movie.formatted_size}</span>
                                <span style="color:#ffbb00; font-weight:700;">★ ${movie.rating || '8.5'}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        viewContainer.innerHTML = html;
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load movies</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

function openTheaterModalById(movieId) {
    const movie = currentMoviesList.find(m => m.id == movieId);
    if (!movie) return;

    if (typeof Player !== 'undefined' && Player.isPlaying) {
        Player.pause();
    }

    openTheaterModalWithVideo(movie.title + (movie.year ? ' (' + movie.year + ')' : ''), movie.quality, movie.stream_url, movie.subtitles);
}

function openTheaterModalWithVideo(title, quality, streamUrl, subtitles = [], onEndedCallback = null) {
    let modal = document.getElementById('theater-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'theater-modal';
        modal.className = 'theater-modal';
        document.body.appendChild(modal);
    }

    let subtitleOptions = '<option value="">Subtitles: Off</option>';
    let trackTags = '';
    if (subtitles && subtitles.length > 0) {
        subtitles.forEach((sub, idx) => {
            subtitleOptions += `<option value="${idx}" ${idx===0?'selected':''}>${escapeHtml(sub.name)} (${sub.lang})</option>`;
            trackTags += `<track label="${escapeHtml(sub.name)}" kind="subtitles" srclang="${sub.lang}" src="${sub.url}" ${idx===0?'default':''}>`;
        });
    }

    // Check saved timestamp
    const savedTime = parseFloat(localStorage.getItem('christos_video_pos_' + streamUrl) || '0');

    modal.innerHTML = `
        <div class="theater-header">
            <div class="theater-movie-title">${escapeHtml(title)} • <span style="color:var(--accent-color);">${quality}</span></div>
            <div style="display:flex; align-items:center; gap:12px;">
                <select id="theater-speed-select" class="form-select" onchange="changeVideoSpeed(this.value)" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:6px 10px; border-radius:8px; font-size:0.85rem;">
                    <option value="0.75">0.75x</option>
                    <option value="1.0" selected>1.0x (Normal)</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2.0">2.0x</option>
                </select>
                <select id="theater-sub-select" class="form-select" onchange="changeVideoSubtitle(this.value)" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:6px 12px; border-radius:8px; font-size:0.85rem;">
                    ${subtitleOptions}
                </select>
                <button class="fullscreen-exit-btn" onclick="toggleVideoPiP()" title="Picture in Picture">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="12" y="12" width="8" height="8" rx="1"/></svg>
                </button>
                <button class="fullscreen-exit-btn" onclick="closeTheaterModal()" title="Close Theater">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        </div>
        <div class="theater-video-container">
            <video id="theater-video-player" controls autoplay playsinline preload="auto">
                <source src="${streamUrl}" type="video/mp4">
                ${trackTags}
                Your browser does not support HTML5 video playback.
            </video>
        </div>
    `;

    modal.classList.add('active');

    const video = document.getElementById('theater-video-player');
    if (video) {
        if (savedTime > 10) {
            video.currentTime = savedTime;
        }
        video.addEventListener('timeupdate', () => {
            if (video.currentTime > 5) {
                localStorage.setItem('christos_video_pos_' + streamUrl, video.currentTime);
            }
        });
        if (onEndedCallback) {
            video.addEventListener('ended', onEndedCallback);
        }
    }
}

function closeTheaterModal() {
    const modal = document.getElementById('theater-modal');
    if (modal) {
        const video = modal.querySelector('video');
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
        }
        modal.classList.remove('active');
    }
}

function changeVideoSpeed(speed) {
    const video = document.getElementById('theater-video-player');
    if (video) video.playbackRate = parseFloat(speed);
}

function toggleVideoPiP() {
    const video = document.getElementById('theater-video-player');
    if (video && document.pictureInPictureEnabled) {
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
        } else {
            video.requestPictureInPicture();
        }
    }
}

function changeVideoSubtitle(subIdx) {
    const video = document.getElementById('theater-video-player');
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'disabled';
    }
    if (subIdx !== '') {
        const target = tracks[parseInt(subIdx, 10)];
        if (target) target.mode = 'showing';
    }
}

/* ============================================================
   4. LOSSLESS UNIVERSAL DOWNLOADER VIEW (QOBUZ, TIDAL, AMAZON, APPLE)
   ============================================================ */
async function renderDownloaderView() {
    const viewContainer = document.getElementById('content-view');
    viewContainer.innerHTML = `
        <div class="downloader-container">
            <div class="downloader-card">
                <div class="downloader-hero">
                    <h2><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:8px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Lossless Universal Downloader</h2>
                    <p>Bit-perfect Lossless audio downloader for <b>Qobuz, Tidal, Amazon Music, and Apple Music</b>. Directly downloads and organizes studio masters into <code>/mnt/DISK_MAC/everything/universal-downloader</code>.</p>
                </div>
                
                <div style="display:flex; gap:12px; margin-bottom:12px;">
                    <div style="flex:1;">
                        <label style="font-size:0.85rem; color:var(--text-secondary); font-weight:600; display:block; margin-bottom:6px;">Music Platform / Engine</label>
                        <select id="downloader-service-select" class="form-select" style="width:100%; padding:8px 12px; background:rgba(255,255,255,0.08); border:1px solid var(--border-color); border-radius:8px; color:#fff;">
                            <option value="auto">Auto-Detect from Link</option>
                            <option value="qobuz">Qobuz (Studio Hi-Res 24-Bit / 192kHz FLAC)</option>
                            <option value="tidal">Tidal (Master / MAX Hi-Res FLAC)</option>
                            <option value="amazon">Amazon Music (Ultra HD Lossless)</option>
                            <option value="apple">Apple Music (Lossless ALAC / Atmos)</option>
                        </select>
                    </div>

                    <div style="flex:1;">
                        <label style="font-size:0.85rem; color:var(--text-secondary); font-weight:600; display:block; margin-bottom:6px;">Audio Quality Target</label>
                        <select id="downloader-quality-select" class="form-select" style="width:100%; padding:8px 12px; background:rgba(255,255,255,0.08); border:1px solid var(--border-color); border-radius:8px; color:#fff;">
                            <option value="24_192">24-Bit / 192 kHz (Ultra Studio Master)</option>
                            <option value="24_96" selected>24-Bit / 96 kHz (Hi-Res Master FLAC)</option>
                            <option value="16_44">16-Bit / 44.1 kHz (CD Quality Lossless)</option>
                            <option value="atmos">Dolby Atmos / Spatial Audio</option>
                        </select>
                    </div>
                </div>

                <div class="downloader-input-group">
                    <input type="url" id="downloader-url-input" class="downloader-input" placeholder="Paste Qobuz, Tidal, Amazon Music, or Apple Music link..." autocomplete="off">
                    <button class="btn btn-primary downloader-submit-btn" onclick="startUniversalDownload()">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Download Lossless</span>
                    </button>
                </div>
            </div>

            <div class="downloader-card" style="margin-top:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="font-size:1.1rem; font-weight:700; color:#fff;">Live Docker Terminal Output</h3>
                    <span id="downloader-status-badge" class="downloader-badge idle">Ready</span>
                </div>
                <div id="downloader-terminal-log" class="terminal-log-window">Waiting for download request...</div>
            </div>
        </div>
    `;

    pollDownloaderStatus();
}

async function startUniversalDownload() {
    const input = document.getElementById('downloader-url-input');
    const serviceSel = document.getElementById('downloader-service-select');
    const qualitySel = document.getElementById('downloader-quality-select');

    const url = input ? input.value.trim() : '';
    const service = serviceSel ? serviceSel.value : 'auto';
    const quality = qualitySel ? qualitySel.value : '24_96';

    if (!url) {
        alert("Please paste a valid track/album URL");
        return;
    }

    const res = await fetch('/api/downloader.php?action=start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, service: service, quality: quality })
    });
    const result = await res.json();
    if (result.success) {
        pollDownloaderStatus();
    } else {
        alert("Download failed: " + (result.error || 'Unknown error'));
    }
}

function pollDownloaderStatus() {
    if (downloaderPollTimer) clearInterval(downloaderPollTimer);

    const check = async () => {
        try {
            const res = await fetch('/api/downloader.php?action=status');
            const data = await res.json();

            const badge = document.getElementById('downloader-status-badge');
            const term = document.getElementById('downloader-terminal-log');

            if (badge) {
                badge.className = 'downloader-badge ' + (data.is_running ? 'running' : 'idle');
                badge.textContent = data.is_running ? 'Downloading...' : 'Idle';
            }
            const logContent = data.logs || data.log || '';
            if (term && logContent) {
                term.textContent = logContent;
                term.scrollTop = term.scrollHeight;
            }
        } catch (e) {}
    };

    check();
    downloaderPollTimer = setInterval(check, 2500);
}

/* ============================================================
   5. GLOBAL SPOTLIGHT SEARCH MODAL (Ctrl + K)
   ============================================================ */
let spotlightDebounce = null;

function initSpotlightSearch() {
    let modal = document.getElementById('spotlight-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'spotlight-modal';
        modal.className = 'spotlight-modal';
        modal.onclick = (e) => {
            if (e.target === modal) closeSpotlight();
        };
        modal.innerHTML = `
            <div class="spotlight-card">
                <div class="spotlight-input-wrap">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--text-secondary)" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="spotlight-search-input" class="spotlight-input" placeholder="Search tracks, albums, artists, movies, and series..." autocomplete="off">
                    <span style="font-size:0.75rem; background:rgba(255,255,255,0.1); padding:3px 8px; border-radius:6px; color:#aaa;">ESC</span>
                </div>
                <div class="spotlight-results" id="spotlight-results-list">
                    <div style="padding:20px; text-align:center; color:var(--text-secondary);">Type anything to start instant search</div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const input = document.getElementById('spotlight-search-input');
        if (input) {
            input.addEventListener('input', (e) => {
                if (spotlightDebounce) clearTimeout(spotlightDebounce);
                spotlightDebounce = setTimeout(() => executeSpotlightSearch(e.target.value.trim()), 200);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeSpotlight();
            });
        }
    }
}

function openSpotlight() {
    initSpotlightSearch();
    const modal = document.getElementById('spotlight-modal');
    const input = document.getElementById('spotlight-search-input');
    if (modal) {
        modal.classList.add('active');
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

function closeSpotlight() {
    const modal = document.getElementById('spotlight-modal');
    if (modal) modal.classList.remove('active');
}

async function executeSpotlightSearch(query) {
    const list = document.getElementById('spotlight-results-list');
    if (!list) return;
    if (!query) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-secondary);">Type anything to start instant search</div>';
        return;
    }

    try {
        const res = await fetch('/api/library.php?action=search&q=' + encodeURIComponent(query));
        const data = await res.json();

        let html = '';
        if (data.tracks && data.tracks.length > 0) {
            html += '<div style="font-size:0.75rem; font-weight:700; color:var(--accent-color); padding:4px 12px;">TRACKS</div>';
            data.tracks.slice(0, 8).forEach(t => {
                const art = '/api/library.php?action=art&album_id=' + t.album_id;
                html += `
                    <div class="spotlight-item" onclick="closeSpotlight(); Player.setSingleTrack({id:${t.id}, title:'${escapeHtml(t.title)}', artist:'${escapeHtml(t.artist)}', album:'${escapeHtml(t.album)}', album_id:${t.album_id}})">
                        <img src="${art}" style="width:36px; height:36px; border-radius:6px; object-fit:cover;" onerror="this.onerror=null; this.src='assets/img/default-star.svg';">
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:700; color:#fff; font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.title)}</div>
                            <div style="color:var(--text-secondary); font-size:0.78rem;">${escapeHtml(t.artist)} • ${escapeHtml(t.album)}</div>
                        </div>
                    </div>
                `;
            });
        }

        if (data.artists && data.artists.length > 0) {
            html += '<div style="font-size:0.75rem; font-weight:700; color:#20bf6b; padding:8px 12px 4px 12px;">ARTISTS</div>';
            data.artists.slice(0, 4).forEach(ar => {
                html += `
                    <div class="spotlight-item" onclick="closeSpotlight(); loadView('artists')">
                        <div style="width:36px; height:36px; border-radius:50%; background:#2a2a36; display:flex; align-items:center; justify-content:center; color:#fff;">♪</div>
                        <div style="font-weight:700; color:#fff; font-size:0.88rem;">${escapeHtml(ar.name)}</div>
                    </div>
                `;
            });
        }

        if (!html) {
            html = '<div style="padding:30px; text-align:center; color:var(--text-secondary);">No results found for "' + escapeHtml(query) + '"</div>';
        }

        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#fa233b;">Search error</div>';
    }
}

/* ============================================================
   6. FILE BROWSER, PLAYLISTS & FAVORITES
   ============================================================ */
async function renderFilesView(path = '', rootKey = 'everything') {
    currentFilePath = path;
    currentFileRoot = rootKey;
    const viewContainer = document.getElementById('content-view');

    try {
        const [rootsRes, listRes] = await Promise.all([
            fetch('/api/files.php?action=roots'),
            fetch('/api/files.php?action=list&root=' + rootKey + '&path=' + encodeURIComponent(path))
        ]);

        const roots = await rootsRes.json();
        const listData = await listRes.json();

        let rootsHtml = '';
        roots.forEach(r => {
            rootsHtml += `<button class="lib-tab-btn ${r.id === rootKey ? 'active' : ''}" onclick="renderFilesView('', '${r.id}')">${r.name}</button>`;
        });

        let breadcrumbHtml = '';
        if (listData.breadcrumbs) {
            listData.breadcrumbs.forEach((b, i) => {
                const isLast = (i === listData.breadcrumbs.length - 1);
                breadcrumbHtml += `
                    <span class="breadcrumb-item ${isLast ? 'active' : ''}" onclick="renderFilesView('${escapeHtml(b.path)}', '${rootKey}')">
                        ${escapeHtml(b.name)}
                    </span>
                    ${!isLast ? '<span class="breadcrumb-sep">/</span>' : ''}
                `;
            });
        }

        let html = `
            <div class="files-container">
                <div class="library-switcher-tabs">${rootsHtml}</div>

                <div class="files-toolbar">
                    <div class="files-breadcrumbs">${breadcrumbHtml}</div>
                    <div class="files-actions-group">
                        <label class="file-btn primary" style="cursor:pointer;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            <span>Upload Files</span>
                            <input type="file" multiple style="display:none;" onchange="handleFileUpload(this)">
                        </label>
                        <button class="file-btn" onclick="promptCreateFolder()">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                            <span>New Folder</span>
                        </button>
                        <button class="file-btn" onclick="downloadCurrentFolderZip()" title="Download Entire Directory as Zip">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            <span>Download Zip</span>
                        </button>
                    </div>
                </div>

                <div class="files-list-view">
                    <div class="file-row file-row-header">
                        <div>TYPE</div>
                        <div>NAME</div>
                        <div>SIZE</div>
                        <div>MODIFIED</div>
                        <div style="text-align:right;">ACTIONS</div>
                    </div>
        `;

        if (!listData.items || listData.items.length === 0) {
            html += `<div style="padding:40px; text-align:center; color:var(--text-secondary);">This folder is empty</div>`;
        } else {
            listData.items.forEach(item => {
                const itemRelPath = path ? `${path}/${item.name}` : item.name;
                const iconSvg = getFileIconSvg(item.icon);

                html += `
                    <div class="file-row" onclick="handleFileClick('${escapeHtml(itemRelPath)}', ${item.is_dir}, '${item.icon}')">
                        <div>${iconSvg}</div>
                        <div class="file-name-cell">${escapeHtml(item.name)}</div>
                        <div style="color:var(--text-secondary); font-size:0.85rem;">${item.formatted_size}</div>
                        <div style="color:var(--text-secondary); font-size:0.85rem;">${item.formatted_date}</div>
                        <div class="file-actions-cell" onclick="event.stopPropagation()">
                            <button class="file-action-icon-btn" onclick="shareFile('${escapeHtml(itemRelPath)}')" title="Generate Direct Share Link">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            </button>
                            <button class="file-action-icon-btn" onclick="downloadSingleFile('${escapeHtml(itemRelPath)}')" title="Download">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </button>
                            <button class="file-action-icon-btn" onclick="promptDeleteFile('${escapeHtml(item.name)}')" title="Delete" style="color:#fa233b;">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div></div>`;
        viewContainer.innerHTML = html;
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load file browser</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

function getFileIconSvg(iconType) {
    if (iconType === 'folder') return '<svg viewBox="0 0 24 24" width="20" height="20" fill="#ffd166"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    if (iconType === 'audio') return '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fa233b"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    if (iconType === 'video') return '<svg viewBox="0 0 24 24" width="20" height="20" fill="#20bf6b"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>';
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

function handleFileClick(relPath, isDir, iconType) {
    if (isDir) {
        renderFilesView(relPath, currentFileRoot);
    } else if (iconType === 'audio') {
        const streamUrl = '/api/files.php?action=raw&root=' + currentFileRoot + '&path=' + encodeURIComponent(relPath);
        Player.setSingleTrack({
            id: 0,
            title: relPath.split('/').pop(),
            artist: 'File Audio',
            album: currentFileRoot,
            format: relPath.split('.').pop()
        }, streamUrl);
    } else if (iconType === 'video') {
        const streamUrl = '/api/files.php?action=raw&root=' + currentFileRoot + '&path=' + encodeURIComponent(relPath);
        openTheaterModalWithVideo(relPath.split('/').pop(), 'Direct File', streamUrl);
    } else {
        downloadSingleFile(relPath);
    }
}

function downloadSingleFile(relPath) {
    window.location.href = '/api/files.php?action=raw&root=' + currentFileRoot + '&path=' + encodeURIComponent(relPath) + '&download=1';
}

function downloadCurrentFolderZip() {
    window.location.href = '/api/files.php?action=raw&root=' + currentFileRoot + '&path=' + encodeURIComponent(currentFilePath) + '&download=1';
}

async function shareFile(relPath) {
    const res = await fetch('/api/files.php?action=share&root=' + currentFileRoot + '&path=' + encodeURIComponent(relPath));
    const data = await res.json();
    if (data && data.share_url) {
        navigator.clipboard.writeText(data.share_url);
        alert('Direct Share Link copied to clipboard:\n\n' + data.share_url);
    }
}

async function promptCreateFolder() {
    const name = prompt("Enter new folder name:");
    if (!name) return;
    const res = await fetch('/api/files.php?action=mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: currentFileRoot, path: currentFilePath, name: name })
    });
    const result = await res.json();
    if (result.success) renderFilesView(currentFilePath, currentFileRoot);
    else alert('Error: ' + (result.error || 'Failed to create folder'));
}

async function promptDeleteFile(fileName) {
    if (!confirm('Are you sure you want to delete "' + fileName + '"?')) return;
    const res = await fetch('/api/files.php?action=delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: currentFileRoot, path: currentFilePath, name: fileName })
    });
    const result = await res.json();
    if (result.success) renderFilesView(currentFilePath, currentFileRoot);
    else alert('Error: ' + (result.error || 'Failed to delete'));
}

async function handleFileUpload(input) {
    if (!input.files || input.files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < input.files.length; i++) {
        formData.append('files[]', input.files[i]);
    }
    const res = await fetch('/api/files.php?action=upload&root=' + currentFileRoot + '&path=' + encodeURIComponent(currentFilePath), {
        method: 'POST',
        body: formData
    });
    const result = await res.json();
    if (result.success) renderFilesView(currentFilePath, currentFileRoot);
    else alert('Upload failed: ' + (result.error || 'Unknown error'));
}

/* ============================================================
   7. PLAYLISTS, FAVORITES, ARTISTS, SETTINGS
   ============================================================ */
async function renderPlaylistsView() {
    const viewContainer = document.getElementById('content-view');
    try {
        const res = await fetch('/api/library.php?action=playlists');
        currentPlaylistsList = await res.json();

        let html = `
            <div class="view-header" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h2>Playlists</h2>
                    <p style="color:var(--text-secondary); margin-top:4px;">Manage custom Hi-Fi listening queues (${currentPlaylistsList.length} total)</p>
                </div>
                <button class="btn btn-primary" onclick="promptCreatePlaylist()">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>New Playlist</span>
                </button>
            </div>
            <div class="albums-grid">
        `;

        if (!currentPlaylistsList || currentPlaylistsList.length === 0) {
            html += `
                <div style="grid-column:1/-1; padding:60px; text-align:center; color:var(--text-secondary); background:var(--bg-surface); border-radius:16px;">
                    <h3>No custom playlists created yet</h3>
                    <p style="margin-top:8px;">Click "New Playlist" above to create your first audiophile queue</p>
                </div>
            `;
        } else {
            currentPlaylistsList.forEach(pl => {
                const art = pl.art_path ? '/api/library.php?action=art&album_id=0' : 'assets/img/default-star.svg';
                html += `
                    <div class="album-card" onclick="openPlaylistDetail(${pl.id})">
                        <div class="album-art-wrap">
                            <img class="album-art-img" src="${art}" alt="${escapeHtml(pl.name)}" onerror="this.onerror=null; this.src='assets/img/default-star.svg';">
                            <div class="card-play-btn" onclick="event.stopPropagation(); playPlaylist(${pl.id})" title="Play Playlist">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                            </div>
                        </div>
                        <div class="album-info">
                            <div class="album-title">${escapeHtml(pl.name)}</div>
                            <div class="album-artist">${pl.track_count || 0} Tracks • ${formatDuration(pl.total_duration)}</div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        viewContainer.innerHTML = html;
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load playlists</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

async function promptCreatePlaylist() {
    const name = prompt("Enter playlist name:");
    if (!name) return;
    const res = await fetch('/api/library.php?action=create_playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    });
    const result = await res.json();
    if (result.success) renderPlaylistsView();
}

async function openPlaylistDetail(playlistId) {
    const viewContainer = document.getElementById('content-view');
    viewContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading playlist...</p></div>';

    try {
        const res = await fetch('/api/library.php?action=playlist&playlist_id=' + playlistId);
        const playlist = await res.json();
        currentPlaylistDetail = playlist;

        let totalDuration = 0;
        if (playlist.tracks) {
            playlist.tracks.forEach(t => totalDuration += (t.duration || 0));
        }

        let html = `
            <div class="album-detail-view">
                <button class="back-btn" onclick="loadView('playlists')">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    <span>Back to Playlists</span>
                </button>

                <div class="album-detail-header">
                    <div class="album-detail-art-wrap">
                        <img class="album-detail-art" src="assets/img/default-star.svg" alt="${escapeHtml(playlist.name)}">
                    </div>
                    <div class="album-detail-info">
                        <span class="meta-label">CUSTOM PLAYLIST</span>
                        <h1 class="album-detail-title">${escapeHtml(playlist.name)}</h1>
                        <div class="album-detail-meta">
                            ${playlist.tracks ? playlist.tracks.length : 0} Tracks • ${formatDuration(totalDuration)}
                        </div>
                        <div class="album-detail-actions">
                            <button class="btn btn-primary" onclick="playPlaylist(${playlist.id})">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                                <span>Play Playlist</span>
                            </button>
                            <button class="btn btn-secondary" onclick="deletePlaylist(${playlist.id})" style="color:#fa233b;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                <span>Delete Playlist</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="tracklist-container">
                    <table class="tracklist-table">
                        <thead>
                            <tr>
                                <th style="width:40px;">#</th>
                                <th>TITLE</th>
                                <th>ARTIST</th>
                                <th>ALBUM</th>
                                <th style="width:70px; text-align:right;">TIME</th>
                                <th style="width:50px; text-align:center;"></th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (playlist.tracks && playlist.tracks.length > 0) {
            playlist.tracks.forEach((track, idx) => {
                html += `
                    <tr class="track-row" onclick="playPlaylistTrack(${idx})">
                        <td class="track-num">${idx + 1}</td>
                        <td><span class="track-title">${escapeHtml(track.title)}</span></td>
                        <td style="color:var(--text-secondary);">${escapeHtml(track.artist)}</td>
                        <td style="color:var(--text-secondary);">${escapeHtml(track.album || '')}</td>
                        <td style="text-align:right; font-variant-numeric:tabular-nums; color:var(--text-secondary);">${formatDuration(track.duration)}</td>
                        <td style="text-align:center;" onclick="event.stopPropagation(); removeTrackFromPlaylist(${playlist.id}, ${track.id})">
                            <button class="file-action-icon-btn" title="Remove track" style="color:#fa233b;">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </td>
                    </tr>
                `;
            });
        } else {
            html += `<tr><td colspan="6" style="padding:30px; text-align:center; color:var(--text-secondary);">No tracks in this playlist yet.</td></tr>`;
        }

        html += `</tbody></table></div></div>`;
        viewContainer.innerHTML = html;
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load playlist</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

function playPlaylist(playlistId) {
    if (currentPlaylistDetail && currentPlaylistDetail.tracks && currentPlaylistDetail.tracks.length > 0) {
        Player.setQueue(currentPlaylistDetail.tracks, 0);
    }
}

function playPlaylistTrack(index) {
    if (currentPlaylistDetail && currentPlaylistDetail.tracks && currentPlaylistDetail.tracks.length > 0) {
        Player.setQueue(currentPlaylistDetail.tracks, index);
    }
}

async function deletePlaylist(playlistId) {
    if (!confirm("Are you sure you want to delete this playlist?")) return;
    await fetch('/api/library.php?action=delete_playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: playlistId })
    });
    loadView('playlists');
}

async function removeTrackFromPlaylist(playlistId, trackId) {
    await fetch('/api/library.php?action=remove_from_playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: playlistId, track_id: trackId })
    });
    openPlaylistDetail(playlistId);
}

/* ============================================================
   8. FAVORITES & ARTISTS VIEW
   ============================================================ */
async function renderFavoritesView() {
    const viewContainer = document.getElementById('content-view');
    try {
        const res = await fetch('/api/library.php?action=favorites');
        const favorites = await res.json();

        let totalDuration = 0;
        favorites.forEach(t => totalDuration += (t.duration || 0));

        let html = `
            <div class="view-header" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h2>Favorites</h2>
                    <p style="color:var(--text-secondary); margin-top:4px;">${favorites.length} Starred Lossless Tracks • ${formatDuration(totalDuration)}</p>
                </div>
                ${favorites.length > 0 ? `
                    <button class="btn btn-primary" onclick="playAllFavorites()">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                        <span>Play All Favorites</span>
                    </button>
                ` : ''}
            </div>
            <div class="capsule-grid">
        `;

        if (!favorites || favorites.length === 0) {
            html += `<div style="grid-column:1/-1; padding:60px; text-align:center; color:var(--text-secondary);">No favorite tracks yet. Star any song to add it here.</div>`;
        } else {
            window.currentFavoritesList = favorites;
            favorites.forEach((track, idx) => {
                const artUrl = '/api/library.php?action=art&album_id=' + track.album_id;

                html += `
                    <div class="capsule-card" onclick="playFavoriteTrack(${idx})" title="${escapeHtml(track.title)} - ${escapeHtml(track.artist)}">
                        <div class="capsule-art-wrap">
                            <img class="capsule-art-img" src="${artUrl}" alt="${escapeHtml(track.title)}" loading="lazy" onerror="this.onerror=null; this.src='assets/img/default-star.svg';">
                        </div>
                        <div class="capsule-info">
                            <div class="capsule-title">${escapeHtml(track.title)}</div>
                            <div class="capsule-artist">${escapeHtml(track.artist)}</div>
                        </div>
                        <div class="capsule-play-hover">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        viewContainer.innerHTML = html;
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load favorites</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

function playAllFavorites() {
    if (window.currentFavoritesList && window.currentFavoritesList.length > 0) {
        Player.setQueue(window.currentFavoritesList, 0);
    }
}

function playFavoriteTrack(idx) {
    if (window.currentFavoritesList && window.currentFavoritesList.length > 0) {
        Player.setQueue(window.currentFavoritesList, idx);
    }
}

async function renderArtistsView() {
    const viewContainer = document.getElementById('content-view');
    try {
        const res = await fetch('/api/library.php?action=artists&library=' + currentLibrary);
        if (currentView !== 'artists') return; // View changed while loading
        const artists = await res.json();

        let html = `
            <div class="view-header">
                <h2><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:8px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Artists (${currentLibrary === 'flac' ? 'FLAC' : 'Apple Music'})</h2>
                <p style="color:var(--text-secondary); margin-top:4px;">${artists.length} Artists in Collection</p>
            </div>
            <div class="capsule-grid">
        `;

        artists.forEach(ar => {
            const art = ar.art_path ? ('/api/library.php?action=art&album_id=' + ar.id) : 'assets/img/default-artist.svg';

            html += `
                <div class="capsule-card" style="cursor:pointer;" onclick="openArtistDetail(${ar.id}, '${escapeHtml(ar.name)}')" title="${escapeHtml(ar.name)}">
                    <div class="capsule-art-wrap" style="border-radius:50%;">
                        <img class="capsule-art-img" src="${art}" alt="${escapeHtml(ar.name)}" loading="lazy" style="border-radius:50%;" onerror="this.onerror=null; this.src='assets/img/default-artist.svg';">
                    </div>
                    <div class="capsule-info">
                        <div class="capsule-title">${escapeHtml(ar.name)}</div>
                        <div class="capsule-artist">${ar.album_count} Albums • ${ar.track_count} Tracks</div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        if (currentView === 'artists') viewContainer.innerHTML = html;
    } catch (e) {
        if (currentView === 'artists') {
            viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load artists</h3><p>' + escapeHtml(e.message) + '</p></div>';
        }
    }
}

async function openArtistDetail(artistId, artistName) {
    const viewContainer = document.getElementById('content-view');
    viewContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading artist details & bio...</p></div>';

    try {
        const res = await fetch('/api/library.php?action=artist_detail&id=' + artistId + '&name=' + encodeURIComponent(artistName));
        const data = await res.json();

        let totalDuration = 0;
        if (data.tracks) data.tracks.forEach(t => totalDuration += (t.duration || 0));

        let html = `
            <div class="album-detail-view">
                <button class="back-btn" onclick="loadView('artists')">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    <span>Back to Artists</span>
                </button>

                <div class="album-detail-header" style="margin-top:16px;">
                    <div class="album-detail-art-wrap" style="border-radius:50%;">
                        <img class="album-detail-art" src="assets/img/default-artist.svg" alt="${escapeHtml(data.name)}" style="border-radius:50%;">
                    </div>
                    <div class="album-detail-info">
                        <span class="meta-label">ARTIST SPOTLIGHT</span>
                        <h1 class="album-detail-title">${escapeHtml(data.name)}</h1>
                        <div class="album-detail-meta">
                            ${data.albums ? data.albums.length : 0} Albums • ${data.tracks ? data.tracks.length : 0} Tracks • ${formatDuration(totalDuration)}
                        </div>
                        <div class="album-detail-actions">
                            ${data.tracks && data.tracks.length > 0 ? `
                                <button class="btn btn-primary" onclick="playAllArtistTracks()">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                                    <span>Play All Tracks</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div class="downloader-card" style="margin:20px 0;">
                    <h3 style="font-size:1.05rem; font-weight:700; color:#fff; margin-bottom:8px;">Biography & History</h3>
                    <p style="color:var(--text-secondary); line-height:1.6; font-size:0.92rem;">${escapeHtml(data.bio)}</p>
                </div>

                <div class="view-header">
                    <h3>Tracks (${data.tracks ? data.tracks.length : 0})</h3>
                </div>
                <div class="capsule-grid">
                    ${renderCapsulesHtml(data.tracks || [])}
                </div>
            </div>
        `;

        window.currentArtistTracks = data.tracks || [];
        viewContainer.innerHTML = html;
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load artist</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

function playAllArtistTracks() {
    if (window.currentArtistTracks && window.currentArtistTracks.length > 0) {
        Player.setQueue(window.currentArtistTracks, 0);
    }
}

function renderSettingsView() {
    const savedTheme = localStorage.getItem('christos_theme') || 'apple';
    const savedViz = localStorage.getItem('christos_default_viz') || '7';
    const savedFft = localStorage.getItem('christos_fft_size') || '512';

    document.getElementById('content-view').innerHTML = `
        <div class="view-header">
            <h2>Settings</h2>
            <p style="color:var(--text-secondary); margin-top:4px;">Configure themes, visualizers, DSP studio, and media paths</p>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:20px;">
            <!-- Themes Card -->
            <div class="downloader-card">
                <h3 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:16px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:6px;"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    UI Themes & Layout Presets
                </h3>
                <div>
                    <label style="font-size:0.85rem; color:var(--text-secondary); font-weight:600; display:block; margin-bottom:6px;">Theme Mode (Radical Rearrange)</label>
                    <select class="form-select" id="settings-theme-select" onchange="changeAppTheme(this.value)">
                        <option value="apple" ${savedTheme==='apple'?'selected':''}>Apple Music (Hi-Fi Glassmorphism)</option>
                        <option value="spotify" ${savedTheme==='spotify'?'selected':''}>Spotify (Modern Dark Studio)</option>
                        <option value="tidal" ${savedTheme==='tidal'?'selected':''}>Tidal (Master Hi-Res Cyan)</option>
                        <option value="qobuz" ${savedTheme==='qobuz'?'selected':''}>Qobuz (Grand Studio Velvet & Gold)</option>
                        <option value="xbox" ${savedTheme==='xbox'?'selected':''}>Xbox 2001 (Neon Phosphor CRT Blade)</option>
                    </select>
                </div>
            </div>

            <!-- DSP Audio Equalizer Card -->
            <div class="downloader-card">
                <h3 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:16px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent-color)" stroke-width="2" style="vertical-align:middle; margin-right:6px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Audiophile DSP Studio & Equalizer
                </h3>
                <div>
                    <button class="btn btn-primary" onclick="DSP.openModal()" style="width:100%;">
                        Open 10-Band EQ & DSP Studio
                    </button>
                </div>
            </div>

            <!-- Server Info Card -->
            <div class="downloader-card">
                <h3 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:16px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:6px;"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                    Server Information
                </h3>
                <div style="display:flex; flex-direction:column; gap:10px; color:var(--text-secondary); font-size:0.9rem;">
                    <div style="display:flex; justify-content:space-between;"><span>Host</span><span style="color:#fff; font-weight:600;">TrueNAS SCALE</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>LAN Address</span><span style="color:#fff; font-weight:600;">192.168.0.245:16010</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>Universal Downloader</span><span style="color:#20bf6b; font-weight:600;">/mnt/DISK_MAC/everything/universal-downloader</span></div>
                    <div style="display:flex; justify-content:space-between;"><span>TV Shows Path</span><span style="color:#fff; font-weight:600;">/mnt/DISK_MAC/thecus/LL/disk/Series(TVshows)</span></div>
                </div>
            </div>
        </div>
    `;
}

function triggerLibraryRescan() {
    alert("Starting library rescan in background...");
    fetch('/api/scanner.php?force=1')
        .then(r => r.json())
        .then(data => {
            alert('Rescan complete!\n\nScanned: ' + data.scanned + '\nIndexed/Updated: ' + data.indexed);
            if (currentView === 'library') loadView('library', currentLibrary);
        })
        .catch(e => alert('Error: ' + e.message));
}

function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

window.escapeHtml = window.escapeHtml || function(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};
