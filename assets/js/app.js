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
        const rating = parseInt(track.rating || 0, 10);
        const isFav = !!(track.is_favorite == 1 || track.is_favorite === true);
        const rgGain = (track.replaygain_track_gain !== null && track.replaygain_track_gain !== undefined) ? parseFloat(track.replaygain_track_gain) : null;

        html += `
            <div class="capsule-card" onclick="playTrackFromCapsule(${idx})" title="${escapeHtml(track.title)} - ${escapeHtml(track.artist)}">
                <div class="capsule-art-wrap">
                    <img class="capsule-art-img" src="${artUrl}" alt="${escapeHtml(track.title)}" loading="lazy" onerror="this.onerror=null; this.src='assets/img/default-star.svg';">
                    ${isFav ? `<div class="capsule-fav-indicator"><svg viewBox="0 0 24 24" width="12" height="12" fill="var(--accent-color)" stroke="var(--accent-color)" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div>` : ''}
                    ${rating > 0 ? `<div class="capsule-rating-badge">★ ${rating}</div>` : ''}
                    ${rgGain !== null ? `<div class="capsule-rg-badge">${rgGain >= 0 ? '+' : ''}${rgGain.toFixed(1)}dB</div>` : ''}
                </div>
                <div class="capsule-info">
                    <div class="capsule-title">${escapeHtml(track.title)}</div>
                    <div class="capsule-artist">${escapeHtml(track.artist)}</div>
                </div>
                <div class="capsule-actions" onclick="event.stopPropagation()">
                    <div class="track-stars-${track.id} capsule-stars">
                        ${[1, 2, 3, 4, 5].map(s => `
                            <span class="star-icon ${s <= rating ? 'active' : ''}" data-star="${s}" onclick="rateTrack(${track.id}, ${s})" style="color:${s <= rating ? '#f59e0b' : 'rgba(255,255,255,0.2)'}; cursor:pointer; font-size:12px;">★</span>
                        `).join('')}
                    </div>
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
   SORT BY ENGINE (19 MODES)
   ============================================================ */
const SORT_FIELDS = [
    { key: 'album', label: 'Album' },
    { key: 'album_artist', label: 'Album Artist' },
    { key: 'artist', label: 'Artist' },
    { key: 'bitrate', label: 'Bitrate' },
    { key: 'rating', label: '5-Star Rating' },
    { key: 'community_rating', label: 'Community Rating' },
    { key: 'replaygain', label: 'ReplayGain (Loudness)' },
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
        currentSortAsc = (field !== 'rating'); // Default descending for ratings
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
            else if (currentSortField === 'rating' || currentSortField === 'community_rating') { valA = a.rating || 0; valB = b.rating || 0; }
            else if (currentSortField === 'replaygain') { valA = a.replaygain_track_gain || 0; valB = b.replaygain_track_gain || 0; }
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
/* ============================================================
   2. TV SHOWS & SERIES VIEW (2:3 PORTRAIT COVERS & BADGES)
   ============================================================ */
window.currentTvSort = 'title_asc';
window.rawTvSeriesList = [];

async function renderTvShowsView(forceRefresh = false) {
    const viewContainer = document.getElementById('content-view');
    viewContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Discovering TV shows & official poster artwork...</p></div>';

    try {
        const url = '/api/tvshows.php?action=series' + (forceRefresh ? '&refresh=1' : '');
        const res = await fetch(url);
        window.rawTvSeriesList = await res.json();
        currentTvSeriesList = [...window.rawTvSeriesList];
        applyTvSort(window.currentTvSort, false);
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load TV shows</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

function applyTvSort(sortType, reRender = true) {
    window.currentTvSort = sortType;
    if (!window.rawTvSeriesList) return;

    let sorted = [...window.rawTvSeriesList];
    switch (sortType) {
        case 'title_asc':
            sorted.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'title_desc':
            sorted.sort((a, b) => b.title.localeCompare(a.title));
            break;
        case 'year_desc':
            sorted.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
            break;
        case 'year_asc':
            sorted.sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0));
            break;
        case 'episodes_desc':
            sorted.sort((a, b) => (b.episode_count || 0) - (a.episode_count || 0));
            break;
        case 'rating_desc':
            sorted.sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));
            break;
    }

    currentTvSeriesList = sorted;
    renderTvShowsHtml();
}

function renderTvShowsHtml() {
    const viewContainer = document.getElementById('content-view');
    if (!viewContainer) return;

    const sortLabels = {
        'title_asc': 'Title ↑',
        'title_desc': 'Title ↓',
        'year_desc': 'Year ↓',
        'year_asc': 'Year ↑',
        'episodes_desc': 'Episodes ⤓',
        'rating_desc': 'Rating ★'
    };
    const currentSortLabel = sortLabels[window.currentTvSort] || 'Title ↑';

    let html = `
        <style>
            .tv-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 0 4px; flex-wrap: wrap; gap: 10px; }
            .tv-items-count { font-size: 0.95rem; font-weight: 600; color: #94a3b8; }
            .tv-topbar-right { display: flex; align-items: center; gap: 8px; position: relative; }
            .tv-action-btn { display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.14); color: #fff; padding: 6px 14px; border-radius: 18px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(10px); }
            .tv-action-btn:hover { background: rgba(255, 255, 255, 0.16); }
            .tv-action-btn.primary { background: var(--accent-color, #fa233b); border-color: var(--accent-color, #fa233b); color: #fff; box-shadow: 0 4px 14px rgba(250, 35, 59, 0.35); }
            .tv-action-btn.icon-only { padding: 6px 10px; border-radius: 50%; }
            .tv-sort-dropdown { position: relative; }
            .tv-sort-menu { display: none; position: absolute; top: calc(100% + 6px); right: 0; background: #161824; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; padding: 6px; min-width: 180px; z-index: 999; box-shadow: 0 12px 30px rgba(0,0,0,0.7); }
            .tv-sort-menu.active { display: block !important; }
            .tv-sort-menu-item { padding: 8px 12px; font-size: 0.82rem; color: #ccc; border-radius: 6px; cursor: pointer; }
            .tv-sort-menu-item:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
            .tv-sort-menu-item.active { background: var(--accent-color, #fa233b); color: #fff; font-weight: 700; }
            
            .tv-poster-grid { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(110px, 135px)) !important; gap: 18px 14px !important; justify-content: start !important; width: 100% !important; box-sizing: border-box !important; }
            .tv-series-card { display: flex !important; flex-direction: column !important; width: 100% !important; max-width: 135px !important; cursor: pointer !important; transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important; }
            .tv-series-card:hover { transform: translateY(-3px) !important; }
            .tv-poster-art { position: relative !important; width: 100% !important; aspect-ratio: 2 / 3 !important; max-height: 202px !important; background: #141622 !important; border-radius: 8px !important; overflow: hidden !important; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45) !important; border: 1px solid rgba(255, 255, 255, 0.08) !important; }
            .tv-poster-img { width: 100% !important; height: 100% !important; max-height: 202px !important; object-fit: cover !important; display: block !important; transition: transform 0.25s ease !important; }
            .tv-series-card:hover .tv-poster-img { transform: scale(1.05) !important; }
            
            /* Green circular badge in top right matching reference photo */
            .tv-ep-badge {
                position: absolute !important;
                top: 6px !important;
                right: 6px !important;
                background: #16a34a !important;
                color: #ffffff !important;
                font-size: 0.65rem !important;
                font-weight: 800 !important;
                min-width: 19px !important;
                height: 19px !important;
                border-radius: 10px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 4px !important;
                box-shadow: 0 2px 8px rgba(0,0,0,0.6) !important;
                z-index: 4 !important;
                line-height: 1 !important;
            }
            
            .tv-play-hover { position: absolute !important; inset: 0 !important; background: rgba(0, 0, 0, 0.35) !important; backdrop-filter: blur(1.5px) !important; display: flex !important; align-items: center !important; justify-content: center !important; opacity: 0 !important; transition: opacity 0.2s ease !important; z-index: 3 !important; }
            .tv-series-card:hover .tv-play-hover { opacity: 1 !important; }
            .tv-play-circle { width: 36px !important; height: 36px !important; border-radius: 50% !important; background: var(--accent-color, #fa233b) !important; color: #fff !important; display: flex !important; align-items: center !important; justify-content: center !important; box-shadow: 0 3px 12px var(--accent-glow, rgba(250, 35, 59, 0.5)) !important; }
            .tv-series-details { margin-top: 6px !important; display: flex !important; flex-direction: column !important; gap: 2px !important; }
            .tv-series-title { font-size: 0.82rem !important; font-weight: 600 !important; color: #ffffff !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; line-height: 1.2 !important; }
            .tv-series-year { font-size: 0.74rem !important; color: #8e8e9f !important; font-weight: 400 !important; }
        </style>

        <div class="tv-topbar">
            <div class="tv-topbar-left">
                <span class="tv-items-count">${currentTvSeriesList.length} Items</span>
            </div>
            <div class="tv-topbar-right">
                <button class="tv-action-btn primary" onclick="playFirstTvShow()" title="Play First Series">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    <span>Play</span>
                </button>
                <button class="tv-action-btn" onclick="playRandomTvShow()" title="Shuffle Series">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                    <span>Shuffle</span>
                </button>
                <div class="tv-sort-dropdown">
                    <button class="tv-action-btn" onclick="toggleTvSortMenu(event)" title="Sort TV Shows">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="12" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/><polyline points="17 9 20 6 23 9"/><line x1="20" y1="6" x2="20" y2="18"/></svg>
                        <span>${currentSortLabel}</span>
                    </button>
                    <div id="tv-sort-menu" class="tv-sort-menu">
                        <div class="tv-sort-menu-item ${window.currentTvSort==='title_asc'?'active':''}" onclick="applyTvSort('title_asc')">Title (A to Z)</div>
                        <div class="tv-sort-menu-item ${window.currentTvSort==='title_desc'?'active':''}" onclick="applyTvSort('title_desc')">Title (Z to A)</div>
                        <div class="tv-sort-menu-item ${window.currentTvSort==='year_desc'?'active':''}" onclick="applyTvSort('year_desc')">Release Year (Newest)</div>
                        <div class="tv-sort-menu-item ${window.currentTvSort==='year_asc'?'active':''}" onclick="applyTvSort('year_asc')">Release Year (Oldest)</div>
                        <div class="tv-sort-menu-item ${window.currentTvSort==='episodes_desc'?'active':''}" onclick="applyTvSort('episodes_desc')">Episodes Count</div>
                        <div class="tv-sort-menu-item ${window.currentTvSort==='rating_desc'?'active':''}" onclick="applyTvSort('rating_desc')">Rating (Highest)</div>
                    </div>
                </div>
                <button class="tv-action-btn icon-only" onclick="renderTvShowsView(true)" title="Refresh Metadata & Posters Online">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
            </div>
        </div>

        <div class="tv-poster-grid">
    `;

    if (!currentTvSeriesList || currentTvSeriesList.length === 0) {
        html += `<div style="grid-column:1/-1; padding:60px; text-align:center; color:var(--text-secondary);">
            <h3>No TV shows found in media collection</h3>
        </div>`;
    } else {
        currentTvSeriesList.forEach(series => {
            const yearDisplay = series.years_span || series.year || `${series.episode_count} Episodes`;

            html += `
                <div class="tv-series-card" onclick="openTvSeriesDetail('${escapeHtml(series.folder)}')" title="${escapeHtml(series.title)} (${series.episode_count} Episodes)">
                    <div class="tv-poster-art">
                        <img class="tv-poster-img" src="${series.poster}" alt="${escapeHtml(series.title)}" loading="lazy" onerror="this.onerror=null; this.src='assets/img/default-star.svg';">
                        <span class="tv-ep-badge" title="${series.episode_count} Episodes">${series.episode_count}</span>
                        <div class="tv-play-hover">
                            <div class="tv-play-circle">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                            </div>
                        </div>
                    </div>
                    <div class="tv-series-details">
                        <div class="tv-series-title">${escapeHtml(series.title)}</div>
                        <div class="tv-series-year">${escapeHtml(yearDisplay)}</div>
                    </div>
                </div>
            `;
        });
    }

    html += `</div>`;
    viewContainer.innerHTML = html;
}

function toggleTvSortMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('tv-sort-menu');
    if (menu) menu.classList.toggle('active');
}

document.addEventListener('click', () => {
    const menu = document.getElementById('tv-sort-menu');
    if (menu) menu.classList.remove('active');
});

function playFirstTvShow() {
    if (currentTvSeriesList && currentTvSeriesList.length > 0) {
        openTvSeriesDetail(currentTvSeriesList[0].folder);
    }
}

function playRandomTvShow() {
    if (currentTvSeriesList && currentTvSeriesList.length > 0) {
        const randIdx = Math.floor(Math.random() * currentTvSeriesList.length);
        openTvSeriesDetail(currentTvSeriesList[randIdx].folder);
    }
}

async function openTvSeriesDetail(seriesFolder) {
    const viewContainer = document.getElementById('content-view');
    viewContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading episodes...</p></div>';

    try {
        const res = await fetch('/api/tvshows.php?action=episodes&series=' + encodeURIComponent(seriesFolder));
        const episodes = await res.json();

        const seriesInfo = (currentTvSeriesList || []).find(s => s.folder === seriesFolder) || { title: seriesFolder, poster: '' };

        let html = `
            <div class="album-detail-view">
                <button class="back-btn" onclick="loadView('tvshows')">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    <span>Back to TV Shows</span>
                </button>
                <div class="view-header" style="margin-top:14px; display:flex; align-items:center; gap:20px;">
                    ${seriesInfo.poster ? `<img src="${seriesInfo.poster}" style="width:70px; height:105px; border-radius:8px; object-fit:cover; box-shadow:0 4px 12px rgba(0,0,0,0.5);">` : ''}
                    <div>
                        <h2 style="font-size:1.4rem; font-weight:700; color:#fff;">${escapeHtml(seriesInfo.title || seriesFolder)}</h2>
                        <p style="color:var(--text-secondary); margin-top:4px;">${episodes.length} Episodes • ${seriesInfo.years_span || ''}</p>
                    </div>
                </div>
                <div class="capsule-grid" style="margin-top:18px;">
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
    const nextEp = window.currentTvEpisodeList[epIdx + 1] || null;

    if (typeof Player !== 'undefined' && Player.isPlaying) {
        Player.pause();
    }

    const nextInfo = nextEp ? {
        title: `S${nextEp.season}E${nextEp.episode}: ${nextEp.title}`,
        index: epIdx + 1
    } : null;

    openTheaterModalWithVideo(
        ep.title + ' (S' + ep.season + 'E' + ep.episode + ')',
        ep.quality,
        ep.stream_url,
        ep.subtitles,
        () => {
            if (nextEp) {
                playTvEpisode(epIdx + 1);
            }
        },
        nextInfo
    );
}

/* ============================================================
   3. MOVIES & CINEMA THEATER VIEW (ONLINE COVERS & POSTER GRID)
   ============================================================ */
window.currentMovieSort = window.currentMovieSort || 'title_asc';

async function renderMoviesView(forceRefresh = false) {
    const viewContainer = document.getElementById('content-view');
    viewContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Searching & loading official movie covers...</p></div>';

    try {
        const url = forceRefresh ? '/api/movies.php?action=list&refresh=1' : '/api/movies.php?action=list';
        const res = await fetch(url);
        currentMoviesList = await res.json();

        applyMovieSort(window.currentMovieSort, false);
        renderMoviesHtml();
    } catch (e) {
        viewContainer.innerHTML = '<div class="empty-state"><h3>Failed to load movies</h3><p>' + escapeHtml(e.message) + '</p></div>';
    }
}

function applyMovieSort(sortType, reRender = true) {
    window.currentMovieSort = sortType;
    if (!currentMoviesList) return;

    if (sortType === 'title_asc') {
        currentMoviesList.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortType === 'title_desc') {
        currentMoviesList.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    } else if (sortType === 'year_desc') {
        currentMoviesList.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (sortType === 'year_asc') {
        currentMoviesList.sort((a, b) => (a.year || 0) - (b.year || 0));
    } else if (sortType === 'rating_desc') {
        currentMoviesList.sort((a, b) => parseFloat(b.rating || '0') - parseFloat(a.rating || '0'));
    } else if (sortType === 'size_desc') {
        currentMoviesList.sort((a, b) => (b.size || 0) - (a.size || 0));
    }

    if (reRender) renderMoviesHtml();
}

function renderMoviesHtml() {
    const viewContainer = document.getElementById('content-view');
    if (!currentMoviesList) return;

    const sortLabels = {
        'title_asc': 'Title ↑',
        'title_desc': 'Title ↓',
        'year_desc': 'Year ↓',
        'year_asc': 'Year ↑',
        'rating_desc': 'Rating ★',
        'size_desc': 'Size ⤓'
    };
    const currentSortLabel = sortLabels[window.currentMovieSort] || 'Title ↑';

    let html = `
        <style>
            .cinema-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 0 4px; flex-wrap: wrap; gap: 10px; }
            .cinema-items-count { font-size: 0.95rem; font-weight: 600; color: #94a3b8; }
            .cinema-topbar-right { display: flex; align-items: center; gap: 8px; position: relative; }
            .cinema-action-btn { display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.14); color: #fff; padding: 6px 14px; border-radius: 18px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(10px); }
            .cinema-action-btn:hover { background: rgba(255, 255, 255, 0.16); }
            .cinema-action-btn.primary { background: var(--accent-color, #fa233b); border-color: var(--accent-color, #fa233b); color: #fff; box-shadow: 0 4px 14px rgba(250, 35, 59, 0.35); }
            .cinema-action-btn.icon-only { padding: 6px 10px; border-radius: 50%; }
            .cinema-sort-dropdown { position: relative; }
            .cinema-sort-menu { display: none; position: absolute; top: calc(100% + 6px); right: 0; background: #161824; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; padding: 6px; min-width: 180px; z-index: 999; box-shadow: 0 12px 30px rgba(0,0,0,0.7); }
            .cinema-sort-menu.active { display: block !important; }
            .sort-menu-item { padding: 8px 12px; font-size: 0.82rem; color: #ccc; border-radius: 6px; cursor: pointer; }
            .sort-menu-item:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
            .sort-menu-item.active { background: var(--accent-color, #fa233b); color: #fff; font-weight: 700; }
            .cinema-poster-grid { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(110px, 135px)) !important; gap: 18px 14px !important; justify-content: start !important; width: 100% !important; box-sizing: border-box !important; }
            .cinema-movie-card { display: flex !important; flex-direction: column !important; width: 100% !important; max-width: 135px !important; cursor: pointer !important; transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important; }
            .cinema-movie-card:hover { transform: translateY(-3px) !important; }
            .cinema-poster-art { position: relative !important; width: 100% !important; aspect-ratio: 2 / 3 !important; max-height: 202px !important; background: #141622 !important; border-radius: 8px !important; overflow: hidden !important; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45) !important; border: 1px solid rgba(255, 255, 255, 0.08) !important; }
            .cinema-poster-img { width: 100% !important; height: 100% !important; max-height: 202px !important; object-fit: cover !important; display: block !important; transition: transform 0.25s ease !important; }
            .cinema-movie-card:hover .cinema-poster-img { transform: scale(1.05) !important; }
            .movie-poster-badge { position: absolute !important; top: 6px !important; left: 6px !important; background: rgba(0, 0, 0, 0.75) !important; color: #fff !important; font-size: 0.58rem !important; font-weight: 800 !important; padding: 1px 4px !important; border-radius: 4px !important; border: 1px solid rgba(255, 255, 255, 0.15) !important; z-index: 2 !important; }
            .movie-poster-badge.hdr { left: auto !important; right: 6px !important; background: rgba(234, 179, 8, 0.9) !important; color: #000 !important; border: none !important; }
            .cinema-play-hover { position: absolute !important; inset: 0 !important; background: rgba(0, 0, 0, 0.35) !important; backdrop-filter: blur(1.5px) !important; display: flex !important; align-items: center !important; justify-content: center !important; opacity: 0 !important; transition: opacity 0.2s ease !important; z-index: 3 !important; }
            .cinema-movie-card:hover .cinema-play-hover { opacity: 1 !important; }
            .cinema-play-circle { width: 36px !important; height: 36px !important; border-radius: 50% !important; background: var(--accent-color, #fa233b) !important; color: #fff !important; display: flex !important; align-items: center !important; justify-content: center !important; box-shadow: 0 3px 12px var(--accent-glow, rgba(250, 35, 59, 0.5)) !important; }
            .cinema-movie-details { margin-top: 6px !important; display: flex !important; flex-direction: column !important; gap: 2px !important; }
            .cinema-movie-title { font-size: 0.82rem !important; font-weight: 600 !important; color: #ffffff !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; line-height: 1.2 !important; }
            .cinema-movie-year { font-size: 0.74rem !important; color: #8e8e9f !important; font-weight: 400 !important; }
        </style>

        <div class="cinema-topbar">
            <div class="cinema-topbar-left">
                <span class="cinema-items-count">${currentMoviesList.length} Items</span>
            </div>
            <div class="cinema-topbar-right">
                <button class="cinema-action-btn primary" onclick="playFirstMovie()" title="Play All">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                    <span>Play</span>
                </button>
                <button class="cinema-action-btn" onclick="playRandomMovie()" title="Shuffle Play">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                    <span>Shuffle</span>
                </button>
                <div class="cinema-sort-dropdown">
                    <button class="cinema-action-btn" onclick="toggleMovieSortMenu(event)" title="Sort Movies">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="12" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/><polyline points="17 9 20 6 23 9"/><line x1="20" y1="6" x2="20" y2="18"/></svg>
                        <span>${currentSortLabel}</span>
                    </button>
                    <div id="movie-sort-menu" class="cinema-sort-menu">
                        <div class="sort-menu-item ${window.currentMovieSort==='title_asc'?'active':''}" onclick="applyMovieSort('title_asc')">Title (A to Z)</div>
                        <div class="sort-menu-item ${window.currentMovieSort==='title_desc'?'active':''}" onclick="applyMovieSort('title_desc')">Title (Z to A)</div>
                        <div class="sort-menu-item ${window.currentMovieSort==='year_desc'?'active':''}" onclick="applyMovieSort('year_desc')">Release Year (Newest)</div>
                        <div class="sort-menu-item ${window.currentMovieSort==='year_asc'?'active':''}" onclick="applyMovieSort('year_asc')">Release Year (Oldest)</div>
                        <div class="sort-menu-item ${window.currentMovieSort==='rating_desc'?'active':''}" onclick="applyMovieSort('rating_desc')">Rating (Highest)</div>
                        <div class="sort-menu-item ${window.currentMovieSort==='size_desc'?'active':''}" onclick="applyMovieSort('size_desc')">File Size</div>
                    </div>
                </div>
                <button class="cinema-action-btn icon-only" onclick="renderMoviesView(true)" title="Refresh Metadata & Posters Online">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
            </div>
        </div>

        <div class="cinema-poster-grid">
    `;

    if (!currentMoviesList || currentMoviesList.length === 0) {
        html += `<div style="grid-column:1/-1; padding:60px; text-align:center; color:var(--text-secondary);">
            <h3>No video files found in media collection</h3>
        </div>`;
    } else {
        currentMoviesList.forEach(movie => {
            const posterUrl = movie.poster || ('/api/movies.php?action=poster&file=' + encodeURIComponent(movie.file_path));
            const qualityBadge = movie.quality ? `<span class="movie-poster-badge">${movie.quality}</span>` : '';
            const hdrBadge = movie.hdr ? `<span class="movie-poster-badge hdr">${movie.hdr}</span>` : '';

            html += `
                <div class="cinema-movie-card" onclick="openTheaterModalById(${movie.id})" title="${escapeHtml(movie.title)}${movie.year ? ' ('+movie.year+')' : ''}">
                    <div class="cinema-poster-art">
                        <img class="cinema-poster-img" src="${posterUrl}" alt="${escapeHtml(movie.title)}" loading="lazy" onerror="this.onerror=null; this.src='/api/movies.php?action=poster&file=${encodeURIComponent(movie.file_path)}';">
                        <div class="movie-badge-group">
                            ${qualityBadge}
                            ${hdrBadge}
                        </div>
                        <div class="cinema-play-hover">
                            <div class="cinema-play-circle">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                            </div>
                        </div>
                    </div>
                    <div class="cinema-movie-details">
                        <div class="cinema-movie-title">${escapeHtml(movie.title)}</div>
                        <div class="cinema-movie-year">${movie.year ? movie.year : (movie.formatted_size || 'Movie')}</div>
                    </div>
                </div>
            `;
        });
    }

    html += `</div>`;
    viewContainer.innerHTML = html;
}

function toggleMovieSortMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('movie-sort-menu');
    if (menu) {
        menu.classList.toggle('active');
    }
}

document.addEventListener('click', () => {
    const menu = document.getElementById('movie-sort-menu');
    if (menu) menu.classList.remove('active');
});

function playFirstMovie() {
    if (currentMoviesList && currentMoviesList.length > 0) {
        openTheaterModalById(currentMoviesList[0].id);
    }
}

function playRandomMovie() {
    if (currentMoviesList && currentMoviesList.length > 0) {
        const randIdx = Math.floor(Math.random() * currentMoviesList.length);
        openTheaterModalById(currentMoviesList[randIdx].id);
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

const CinemaPlayer = {
    modal: null,
    video: null,
    audioCtx: null,
    compressor: null,
    sourceNode: null,
    dialogueBoost: false,
    fitMode: 'contain', // 'contain' | 'cover' | 'fill'
    showRemainingTime: false,
    controlsTimeout: null,
    nextEpTimeout: null,
    nextEpCountdown: 10,
    currentSubIdx: '',
    currentSpeed: 1.0,
    isScrubbing: false,
    onEndedCallback: null,
    nextEpisodeInfo: null,
    streamUrl: '',

    init() {
        let modal = document.getElementById('theater-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'theater-modal';
            modal.className = 'theater-modal';
            document.body.appendChild(modal);
        }
        this.modal = modal;
    },

    open(title, quality, streamUrl, subtitles = [], onEndedCallback = null, nextEpisodeInfo = null) {
        this.init();
        this.streamUrl = streamUrl;
        this.onEndedCallback = onEndedCallback;
        this.nextEpisodeInfo = nextEpisodeInfo;

        if (typeof Player !== 'undefined' && Player.isPlaying) {
            Player.pause();
        }

        let trackTags = '';
        let subMenuItems = `<div class="theater-menu-item active" onclick="CinemaPlayer.setSubtitle('')"><span>Off</span></div>`;
        
        if (subtitles && subtitles.length > 0) {
            subtitles.forEach((sub, idx) => {
                trackTags += `<track label="${escapeHtml(sub.name)}" kind="subtitles" srclang="${sub.lang}" src="${sub.url}">`;
                subMenuItems += `<div class="theater-menu-item" onclick="CinemaPlayer.setSubtitle(${idx})"><span>${escapeHtml(sub.name)} (${sub.lang})</span></div>`;
            });
        }

        const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
        let speedMenuItems = '';
        speeds.forEach(s => {
            speedMenuItems += `<div class="theater-menu-item ${s===1.0?'active':''}" onclick="CinemaPlayer.setSpeed(${s})"><span>${s}x ${s===1.0?'(Normal)':''}</span></div>`;
        });

        this.modal.innerHTML = `
                .theater-modal { position: fixed !important; inset: 0 !important; z-index: 999999 !important; background: #000000 !important; display: none; flex-direction: column !important; overflow: hidden !important; color: #ffffff !important; user-select: none !important; -webkit-user-select: none !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important; }
                .theater-modal.active { display: flex !important; }
                .theater-modal.cursor-hidden { cursor: none !important; }
                .theater-viewport { position: relative !important; width: 100vw !important; height: 100vh !important; display: flex !important; align-items: center !important; justify-content: center !important; background: #000000 !important; overflow: hidden !important; }
                .theater-video-elem { width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; object-fit: contain !important; background: #000000 !important; }
                .theater-video-elem.fill { object-fit: cover !important; }
                .theater-video-elem.stretch { object-fit: fill !important; }
                .theater-video-elem::cue { background-color: rgba(0, 0, 0, 0.8) !important; color: #ffffff !important; font-size: 1.15rem !important; font-weight: 600 !important; text-shadow: 0 2px 4px rgba(0,0,0,0.9) !important; border-radius: 6px !important; padding: 2px 8px !important; }
                .theater-top-overlay { position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; padding: 24px 36px 48px 36px !important; background: linear-gradient(to bottom, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%) !important; display: flex !important; justify-content: space-between !important; align-items: center !important; z-index: 100 !important; transition: opacity 0.3s ease, transform 0.3s ease !important; pointer-events: auto !important; }
                .theater-bottom-overlay { position: absolute !important; bottom: 0 !important; left: 0 !important; right: 0 !important; padding: 60px 36px 24px 36px !important; background: linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.5) 60%, transparent 100%) !important; display: flex !important; flex-direction: column !important; gap: 12px !important; z-index: 100 !important; transition: opacity 0.3s ease, transform 0.3s ease !important; pointer-events: auto !important; }
                .theater-controls-hidden .theater-top-overlay { opacity: 0 !important; transform: translateY(-20px) !important; pointer-events: none !important; }
                .theater-controls-hidden .theater-bottom-overlay { opacity: 0 !important; transform: translateY(20px) !important; pointer-events: none !important; }
                .theater-title-wrap { display: flex !important; align-items: center !important; gap: 16px !important; }
                .theater-exit-btn { display: inline-flex !important; align-items: center !important; gap: 6px !important; background: rgba(255, 255, 255, 0.12) !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; color: #ffffff !important; padding: 7px 16px !important; border-radius: 20px !important; font-size: 0.85rem !important; font-weight: 600 !important; cursor: pointer !important; backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important; transition: all 0.2s ease !important; outline: none !important; }
                .theater-exit-btn:hover { background: rgba(255, 255, 255, 0.22) !important; transform: scale(1.04) !important; }
                .theater-title-text { font-size: 1.15rem !important; font-weight: 700 !important; color: #ffffff !important; display: flex !important; align-items: center !important; gap: 10px !important; }
                .theater-quality-pill { background: #fa233b !important; color: #ffffff !important; font-size: 0.65rem !important; font-weight: 800 !important; padding: 2px 6px !important; border-radius: 4px !important; letter-spacing: 0.5px !important; }
                .theater-top-actions { display: flex !important; align-items: center !important; gap: 8px !important; }
                .theater-icon-btn { background: rgba(255, 255, 255, 0.08) !important; border: 1px solid rgba(255, 255, 255, 0.15) !important; color: #ffffff !important; width: 38px !important; height: 38px !important; border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important; transition: all 0.2s ease !important; outline: none !important; padding: 0 !important; }
                .theater-icon-btn:hover { background: rgba(255, 255, 255, 0.22) !important; transform: scale(1.08) !important; }
                .theater-icon-btn.active { background: #fa233b !important; border-color: #fa233b !important; box-shadow: 0 0 12px rgba(250, 35, 59, 0.6) !important; }
                .theater-scrub-container { position: relative !important; width: 100% !important; height: 20px !important; display: flex !important; align-items: center !important; cursor: pointer !important; }
                .theater-scrub-track { position: relative !important; width: 100% !important; height: 5px !important; background: rgba(255, 255, 255, 0.22) !important; border-radius: 4px !important; transition: height 0.15s ease !important; }
                .theater-scrub-container:hover .theater-scrub-track { height: 7px !important; }
                .theater-scrub-buffer { position: absolute !important; left: 0 !important; top: 0 !important; bottom: 0 !important; background: rgba(255, 255, 255, 0.35) !important; border-radius: 4px !important; width: 0% !important; }
                .theater-scrub-progress { position: absolute !important; left: 0 !important; top: 0 !important; bottom: 0 !important; background: #fa233b !important; border-radius: 4px !important; width: 0% !important; box-shadow: 0 0 10px rgba(250, 35, 59, 0.6) !important; }
                .theater-scrub-thumb { position: absolute !important; right: -6px !important; top: 50% !important; transform: translateY(-50%) scale(0) !important; width: 13px !important; height: 13px !important; border-radius: 50% !important; background: #ffffff !important; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6) !important; transition: transform 0.15s ease !important; }
                .theater-scrub-container:hover .theater-scrub-thumb { transform: translateY(-50%) scale(1) !important; }
                .theater-scrub-tooltip { position: absolute !important; bottom: 26px !important; transform: translateX(-50%) !important; background: rgba(16, 18, 28, 0.95) !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; color: #ffffff !important; padding: 3px 8px !important; border-radius: 5px !important; font-size: 0.78rem !important; font-weight: 700 !important; pointer-events: none !important; display: none !important; }
                .theater-deck-bar { display: flex !important; justify-content: space-between !important; align-items: center !important; width: 100% !important; }
                .theater-deck-left, .theater-deck-right { display: flex !important; align-items: center !important; gap: 12px !important; }
                .theater-play-btn { background: #ffffff !important; color: #000000 !important; border: none !important; width: 42px !important; height: 42px !important; border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important; box-shadow: 0 3px 14px rgba(255, 255, 255, 0.25) !important; transition: transform 0.15s ease !important; outline: none !important; padding: 0 !important; }
                .theater-play-btn:hover { transform: scale(1.08) !important; }
                .theater-skip-btn { background: transparent !important; border: none !important; color: #e2e8f0 !important; cursor: pointer !important; display: inline-flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; font-size: 0.62rem !important; font-weight: 700 !important; gap: 1px !important; padding: 4px 6px !important; border-radius: 6px !important; transition: all 0.15s ease !important; outline: none !important; }
                .theater-skip-btn:hover { color: #ffffff !important; background: rgba(255, 255, 255, 0.1) !important; transform: scale(1.05) !important; }
                .theater-volume-group { display: flex !important; align-items: center !important; gap: 6px !important; }
                .theater-volume-slider { width: 80px !important; height: 4px !important; -webkit-appearance: none !important; appearance: none !important; background: rgba(255, 255, 255, 0.25) !important; border-radius: 2px !important; outline: none !important; cursor: pointer !important; accent-color: #fa233b !important; }
                .theater-time-display { font-size: 0.84rem !important; font-weight: 600 !important; color: #cbd5e1 !important; font-variant-numeric: tabular-nums !important; margin-left: 4px !important; cursor: pointer !important; }
                .theater-menu-popup { position: absolute !important; bottom: 46px !important; right: 0 !important; background: rgba(16, 18, 28, 0.96) !important; backdrop-filter: blur(25px) !important; -webkit-backdrop-filter: blur(25px) !important; border: 1px solid rgba(255, 255, 255, 0.16) !important; border-radius: 10px !important; padding: 6px !important; min-width: 190px !important; max-height: 260px !important; overflow-y: auto !important; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.8) !important; display: none !important; z-index: 200 !important; }
                .theater-menu-popup.active { display: block !important; }
                .theater-menu-title { font-size: 0.74rem !important; font-weight: 700 !important; color: #94a3b8 !important; text-transform: uppercase !important; padding: 4px 10px !important; border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important; margin-bottom: 4px !important; }
                .theater-menu-item { display: flex !important; align-items: center !important; justify-content: space-between !important; padding: 7px 10px !important; font-size: 0.82rem !important; color: #e2e8f0 !important; border-radius: 6px !important; cursor: pointer !important; transition: all 0.15s ease !important; }
                .theater-menu-item:hover { background: rgba(255, 255, 255, 0.12) !important; color: #ffffff !important; }
                .theater-menu-item.active { background: #fa233b !important; color: #ffffff !important; font-weight: 700 !important; }
                .theater-center-action { position: absolute !important; width: 80px !important; height: 80px !important; border-radius: 50% !important; background: rgba(0, 0, 0, 0.65) !important; backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important; border: 2px solid rgba(255, 255, 255, 0.2) !important; display: flex !important; align-items: center !important; justify-content: center !important; color: #ffffff !important; opacity: 0 !important; transform: scale(0.7) !important; pointer-events: none !important; transition: all 0.25s ease !important; z-index: 50 !important; }
                .theater-center-action.animate { opacity: 1 !important; transform: scale(1) !important; animation: centerPulse 0.5s ease-out forwards !important; }
                @keyframes centerPulse { 0% { opacity: 1; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0; transform: scale(1.25); } }
                .theater-next-episode-banner { position: absolute !important; bottom: 90px !important; right: 32px !important; background: rgba(16, 18, 28, 0.95) !important; backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; border: 1px solid rgba(255, 255, 255, 0.18) !important; border-radius: 12px !important; padding: 14px 18px !important; box-shadow: 0 14px 36px rgba(0, 0, 0, 0.7) !important; display: none !important; align-items: center !important; gap: 14px !important; z-index: 150 !important; }
                .theater-next-episode-banner.active { display: flex !important; }
                .theater-resume-banner { position: absolute !important; top: 80px !important; left: 32px !important; background: rgba(16, 18, 28, 0.95) !important; backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; border: 1px solid rgba(255, 255, 255, 0.18) !important; border-radius: 10px !important; padding: 10px 16px !important; display: flex !important; align-items: center !important; gap: 12px !important; z-index: 150 !important; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6) !important; }
            </style>

            <div class="theater-viewport" id="theater-viewport">
                <video id="theater-video-player" class="theater-video-elem" playsinline preload="auto" crossorigin="anonymous">
                    <source src="${streamUrl}" type="video/mp4">
                    ${trackTags}
                    Your browser does not support HTML5 video playback.
                </video>

                <!-- Center Animated Action Ripple -->
                <div id="theater-center-action" class="theater-center-action">
                    <svg id="theater-center-icon" viewBox="0 0 24 24" width="44" height="44" fill="currentColor"></svg>
                </div>

                <!-- Smart Resume Notification Banner -->
                <div id="theater-resume-banner" class="theater-resume-banner" style="display:none;">
                    <span>Resumed at <b id="theater-resume-time">00:00</b></span>
                    <button onclick="CinemaPlayer.restartFromBeginning()" style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.25); color:#fff; padding:4px 10px; border-radius:6px; font-size:0.78rem; font-weight:700; cursor:pointer;">Restart from 0:00</button>
                    <button onclick="CinemaPlayer.dismissResume()" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; font-size:1rem; padding:0 4px;">✕</button>
                </div>

                <!-- Next Episode Countdown Banner (For TV Series) -->
                <div id="theater-next-banner" class="theater-next-episode-banner">
                    <div>
                        <div style="font-size:0.75rem; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Next Episode</div>
                        <div id="theater-next-title" style="font-size:0.92rem; font-weight:700; color:#fff; margin-top:2px;"></div>
                        <div style="font-size:0.8rem; color:#22c55e; font-weight:600; margin-top:2px;">Playing in <span id="theater-next-countdown">10</span>s</div>
                    </div>
                    <button onclick="CinemaPlayer.playNextEpisodeNow()" class="theater-exit-btn" style="background:#fa233b !important; border:none !important; padding:6px 14px !important; font-size:0.82rem !important;">Play Now</button>
                    <button onclick="CinemaPlayer.cancelNextEpisode()" style="background:transparent !important; border:none !important; color:#888 !important; cursor:pointer !important; font-size:1.1rem !important; padding:4px !important;">✕</button>
                </div>

                <!-- Top Cinema Bar -->
                <div class="theater-top-overlay">
                    <div class="theater-title-wrap">
                        <button class="theater-exit-btn" onclick="CinemaPlayer.close()">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                            <span>Exit</span>
                        </button>
                        <div class="theater-title-text">
                            <span>${escapeHtml(title)}</span>
                            <span class="theater-quality-pill">${escapeHtml(quality || 'HD')}</span>
                        </div>
                    </div>
                    <div class="theater-top-actions">
                        <button class="theater-icon-btn" id="theater-dialogue-btn" onclick="CinemaPlayer.toggleDialogueBoost()" title="Dialogue Boost / Night Mode (Compressor)">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        </button>
                        <button class="theater-icon-btn" id="theater-fit-btn" onclick="CinemaPlayer.toggleVideoFit()" title="Aspect Ratio: Fit / Fill">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                        </button>
                        <button class="theater-icon-btn" onclick="CinemaPlayer.togglePiP()" title="Picture-in-Picture">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="12" y="12" width="8" height="8" rx="1"/></svg>
                        </button>
                        <button class="theater-icon-btn" onclick="CinemaPlayer.close()" title="Close Theater (Esc)">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>

                <!-- Bottom Cinema Control Deck -->
                <div class="theater-bottom-overlay">
                    <!-- Seek / Scrub Bar -->
                    <div class="theater-scrub-container" id="theater-scrub-container">
                        <div class="theater-scrub-tooltip" id="theater-scrub-tooltip">00:00</div>
                        <div class="theater-scrub-track">
                            <div class="theater-scrub-buffer" id="theater-scrub-buffer"></div>
                            <div class="theater-scrub-progress" id="theater-scrub-progress">
                                <div class="theater-scrub-thumb"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Deck Buttons -->
                    <div class="theater-deck-bar">
                        <div class="theater-deck-left">
                            <button class="theater-play-btn" id="theater-play-trigger" onclick="CinemaPlayer.togglePlay()" title="Play/Pause (Space)">
                                <svg id="theater-deck-play-icon" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                                <svg id="theater-deck-pause-icon" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                            </button>

                            <button class="theater-skip-btn" onclick="CinemaPlayer.seekRelative(-10)" title="Rewind 10s (Left Arrow / J)">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                <span>10s</span>
                            </button>

                            <button class="theater-skip-btn" onclick="CinemaPlayer.seekRelative(10)" title="Forward 10s (Right Arrow / L)">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                <span>10s</span>
                            </button>

                            <button class="theater-skip-btn" id="theater-next-ep-btn" onclick="CinemaPlayer.playNextEpisodeNow()" style="${nextEpisodeInfo ? 'display:inline-flex;' : 'display:none;'}" title="Next Episode">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                                <span>Next Ep</span>
                            </button>

                            <div class="theater-volume-group">
                                <button class="theater-icon-btn" onclick="CinemaPlayer.toggleMute()" title="Mute/Unmute (M)" style="width:34px !important; height:34px !important; background:transparent !important; border:none !important;">
                                    <svg id="theater-vol-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                </button>
                                <input type="range" class="theater-volume-slider" id="theater-volume-slider" min="0" max="1" step="0.02" value="1" oninput="CinemaPlayer.setVolume(this.value)">
                            </div>

                            <div class="theater-time-display" id="theater-time-display" onclick="CinemaPlayer.toggleTimeFormat()" title="Click to toggle remaining time">
                                00:00 / 00:00
                            </div>
                        </div>

                        <div class="theater-deck-right">
                            <!-- Subtitles Menu -->
                            <div style="position:relative;">
                                <button class="theater-icon-btn" id="theater-sub-btn" onclick="CinemaPlayer.toggleMenu('subtitles')" title="Subtitles (C)">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="15" x2="7.01" y2="15"/><line x1="11" y1="15" x2="13" y2="15"/><line x1="17" y1="15" x2="17.01" y2="15"/></svg>
                                </button>
                                <div id="theater-sub-menu" class="theater-menu-popup">
                                    <div class="theater-menu-title">Subtitles</div>
                                    ${subMenuItems}
                                </div>
                            </div>

                            <!-- Speed Menu -->
                            <div style="position:relative;">
                                <button class="theater-icon-btn" id="theater-speed-btn" onclick="CinemaPlayer.toggleMenu('speed')" title="Playback Speed">
                                    <span id="theater-speed-label" style="font-size:0.78rem; font-weight:800;">1x</span>
                                </button>
                                <div id="theater-speed-menu" class="theater-menu-popup">
                                    <div class="theater-menu-title">Playback Speed</div>
                                    ${speedMenuItems}
                                </div>
                            </div>

                            <!-- Fullscreen Button -->
                            <button class="theater-icon-btn" onclick="CinemaPlayer.toggleFullscreen()" title="Fullscreen (F)">
                                <svg id="theater-fs-expand" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                                <svg id="theater-fs-compress" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.modal.style.setProperty('display', 'flex', 'important');
        this.modal.classList.add('active');
        this.video = document.getElementById('theater-video-player');
        this.setupEvents();

        // Check saved playback position
        const savedTime = parseFloat(localStorage.getItem('christos_video_pos_' + streamUrl) || '0');
        if (savedTime > 15) {
            this.video.currentTime = savedTime;
            const resumeBanner = document.getElementById('theater-resume-banner');
            const resumeTime = document.getElementById('theater-resume-time');
            if (resumeBanner && resumeTime) {
                resumeTime.textContent = this.formatTime(savedTime);
                resumeBanner.style.display = 'flex';
                setTimeout(() => { if (resumeBanner) resumeBanner.style.display = 'none'; }, 6000);
            }
        }

        // Auto play
        this.video.play().catch(() => {});
        this.resetControlsTimer();
    },

    setupEvents() {
        if (!this.video) return;

        // Video state updates
        this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.video.addEventListener('progress', () => this.onProgress());
        this.video.addEventListener('play', () => this.updatePlayIcon(true));
        this.video.addEventListener('pause', () => this.updatePlayIcon(false));
        this.video.addEventListener('ended', () => this.onEnded());

        // Viewport click / double click
        const viewport = document.getElementById('theater-viewport');
        let clickTimeout = null;
        if (viewport) {
            viewport.addEventListener('click', (e) => {
                if (e.target.closest('.theater-top-overlay') || e.target.closest('.theater-bottom-overlay') || e.target.closest('.theater-menu-popup') || e.target.closest('.theater-resume-banner') || e.target.closest('.theater-next-episode-banner')) return;
                
                if (clickTimeout) {
                    clearTimeout(clickTimeout);
                    clickTimeout = null;
                    this.toggleFullscreen();
                } else {
                    clickTimeout = setTimeout(() => {
                        clickTimeout = null;
                        this.togglePlay();
                    }, 220);
                }
            });

            viewport.addEventListener('mousemove', () => this.onMouseMove());
        }

        // Scrub Bar dragging
        const scrubContainer = document.getElementById('theater-scrub-container');
        const tooltip = document.getElementById('theater-scrub-tooltip');
        if (scrubContainer) {
            scrubContainer.addEventListener('mousedown', (e) => {
                this.isScrubbing = true;
                this.handleScrub(e);
            });

            scrubContainer.addEventListener('mousemove', (e) => {
                if (!this.video || !this.video.duration) return;
                const rect = scrubContainer.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const targetTime = pos * this.video.duration;
                if (tooltip) {
                    tooltip.style.display = 'block';
                    tooltip.style.left = `${pos * 100}%`;
                    tooltip.textContent = this.formatTime(targetTime);
                }
                if (this.isScrubbing) this.handleScrub(e);
            });

            scrubContainer.addEventListener('mouseleave', () => {
                if (tooltip) tooltip.style.display = 'none';
            });
        }

        document.addEventListener('mouseup', () => { this.isScrubbing = false; });

        // Global Keydown Handler
        this.keyHandler = (e) => this.onKeyDown(e);
        window.addEventListener('keydown', this.keyHandler);
    },

    onMouseMove() {
        this.modal.classList.remove('theater-controls-hidden');
        this.modal.classList.remove('cursor-hidden');
        this.resetControlsTimer();
    },

    resetControlsTimer() {
        if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            if (this.video && !this.video.paused && !this.isScrubbing) {
                this.modal.classList.add('theater-controls-hidden');
                this.modal.classList.add('cursor-hidden');
                this.closeMenus();
            }
        }, 3000);
    },

    handleScrub(e) {
        const container = document.getElementById('theater-scrub-container');
        if (!container || !this.video || !this.video.duration) return;
        const rect = container.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.video.currentTime = pos * this.video.duration;
        this.updateScrubUI();
    },

    onTimeUpdate() {
        if (!this.video) return;
        this.updateScrubUI();

        // Save position
        if (this.video.currentTime > 5 && this.streamUrl) {
            localStorage.setItem('christos_video_pos_' + this.streamUrl, this.video.currentTime);
        }

        // TV series next episode prompt 15 seconds before ending
        if (this.nextEpisodeInfo && this.video.duration && this.video.duration > 30) {
            const timeLeft = this.video.duration - this.video.currentTime;
            if (timeLeft <= 15 && timeLeft > 0 && !this.nextEpTimeout) {
                this.showNextEpisodeBanner();
            }
        }
    },

    onProgress() {
        if (!this.video || !this.video.duration) return;
        const buf = document.getElementById('theater-scrub-buffer');
        if (buf && this.video.buffered.length > 0) {
            const end = this.video.buffered.end(this.video.buffered.length - 1);
            buf.style.width = `${(end / this.video.duration) * 100}%`;
        }
    },

    updateScrubUI() {
        if (!this.video || !this.video.duration) return;
        const pct = (this.video.currentTime / this.video.duration) * 100;
        const prog = document.getElementById('theater-scrub-progress');
        if (prog) prog.style.width = `${pct}%`;

        const timeDisplay = document.getElementById('theater-time-display');
        if (timeDisplay) {
            const cur = this.formatTime(this.video.currentTime);
            const total = this.formatTime(this.video.duration);
            if (this.showRemainingTime) {
                const rem = '-' + this.formatTime(Math.max(0, this.video.duration - this.video.currentTime));
                timeDisplay.textContent = `${cur} / ${rem}`;
            } else {
                timeDisplay.textContent = `${cur} / ${total}`;
            }
        }
    },

    toggleTimeFormat() {
        this.showRemainingTime = !this.showRemainingTime;
        this.updateScrubUI();
    },

    togglePlay() {
        if (!this.video) return;
        if (this.video.paused) {
            this.video.play();
            this.triggerCenterAction('play');
        } else {
            this.video.pause();
            this.triggerCenterAction('pause');
        }
    },

    updatePlayIcon(isPlaying) {
        const playIcon = document.getElementById('theater-deck-play-icon');
        const pauseIcon = document.getElementById('theater-deck-pause-icon');
        if (playIcon && pauseIcon) {
            playIcon.style.display = isPlaying ? 'none' : 'block';
            pauseIcon.style.display = isPlaying ? 'block' : 'none';
        }
    },

    seekRelative(seconds) {
        if (!this.video) return;
        this.video.currentTime = Math.max(0, Math.min(this.video.duration || 0, this.video.currentTime + seconds));
        this.triggerCenterAction(seconds > 0 ? 'fwd' : 'rwd');
    },

    triggerCenterAction(type) {
        const actionElem = document.getElementById('theater-center-action');
        const icon = document.getElementById('theater-center-icon');
        if (!actionElem || !icon) return;

        if (type === 'play') {
            icon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
        } else if (type === 'pause') {
            icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        } else if (type === 'fwd') {
            icon.innerHTML = '<path d="M13 19l9-7-9-7v14zM2 19l9-7-9-7v14z"/>';
        } else if (type === 'rwd') {
            icon.innerHTML = '<path d="M11 19l-9-7 9-7v14zM22 19l-9-7 9-7v14z"/>';
        }

        actionElem.classList.remove('animate');
        void actionElem.offsetWidth;
        actionElem.classList.add('animate');
    },

    setVolume(val) {
        if (!this.video) return;
        this.video.volume = parseFloat(val);
        this.video.muted = (val == 0);
        this.updateVolumeIcon();
    },

    toggleMute() {
        if (!this.video) return;
        this.video.muted = !this.video.muted;
        const slider = document.getElementById('theater-volume-slider');
        if (slider) slider.value = this.video.muted ? 0 : this.video.volume;
        this.updateVolumeIcon();
    },

    updateVolumeIcon() {
        const icon = document.getElementById('theater-vol-icon');
        if (!icon || !this.video) return;
        if (this.video.muted || this.video.volume === 0) {
            icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
        } else if (this.video.volume < 0.5) {
            icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
        } else {
            icon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
        }
    },

    toggleDialogueBoost() {
        if (!this.video) return;
        const btn = document.getElementById('theater-dialogue-btn');

        if (!this.audioCtx) {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.audioCtx = new AudioCtx();
                this.sourceNode = this.audioCtx.createMediaElementSource(this.video);
                this.compressor = this.audioCtx.createDynamicsCompressor();
                
                // Voice clarity compressor settings
                this.compressor.threshold.setValueAtTime(-24, this.audioCtx.currentTime);
                this.compressor.knee.setValueAtTime(30, this.audioCtx.currentTime);
                this.compressor.ratio.setValueAtTime(12, this.audioCtx.currentTime);
                this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
                this.compressor.release.setValueAtTime(0.25, this.audioCtx.currentTime);

                this.sourceNode.connect(this.compressor);
                this.compressor.connect(this.audioCtx.destination);
                this.dialogueBoost = true;
            } catch (e) {
                console.log('Audio compression bypass:', e);
            }
        } else {
            if (this.dialogueBoost) {
                this.sourceNode.disconnect();
                this.sourceNode.connect(this.audioCtx.destination);
                this.dialogueBoost = false;
            } else {
                this.sourceNode.disconnect();
                this.sourceNode.connect(this.compressor);
                this.compressor.connect(this.audioCtx.destination);
                this.dialogueBoost = true;
            }
        }

        if (btn) btn.classList.toggle('active', this.dialogueBoost);
    },

    toggleVideoFit() {
        if (!this.video) return;
        const modes = ['contain', 'cover', 'fill'];
        const curIdx = modes.indexOf(this.fitMode);
        this.fitMode = modes[(curIdx + 1) % modes.length];

        this.video.classList.remove('fill', 'stretch');
        if (this.fitMode === 'cover') this.video.classList.add('fill');
        else if (this.fitMode === 'fill') this.video.classList.add('stretch');

        const btn = document.getElementById('theater-fit-btn');
        if (btn) btn.classList.toggle('active', this.fitMode !== 'contain');
    },

    togglePiP() {
        if (!this.video) return;
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(() => {});
        } else if (document.pictureInPictureEnabled) {
            this.video.requestPictureInPicture().catch(() => {});
        }
    },

    toggleFullscreen() {
        const elem = this.modal;
        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) elem.requestFullscreen();
            else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
            this.updateFsIcon(true);
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            this.updateFsIcon(false);
        }
    },

    updateFsIcon(isFs) {
        const exp = document.getElementById('theater-fs-expand');
        const comp = document.getElementById('theater-fs-compress');
        if (exp && comp) {
            exp.style.display = isFs ? 'none' : 'block';
            comp.style.display = isFs ? 'block' : 'none';
        }
    },

    toggleMenu(menuName) {
        const menu = document.getElementById(`theater-${menuName}-menu`);
        if (!menu) return;
        const isActive = menu.classList.contains('active');
        this.closeMenus();
        if (!isActive) menu.classList.add('active');
    },

    closeMenus() {
        const popups = document.querySelectorAll('.theater-menu-popup');
        popups.forEach(p => p.classList.remove('active'));
    },

    setSubtitle(idx) {
        if (!this.video) return;
        const tracks = this.video.textTracks;
        for (let i = 0; i < tracks.length; i++) {
            tracks[i].mode = 'disabled';
        }

        const items = document.querySelectorAll('#theater-sub-menu .theater-menu-item');
        items.forEach(it => it.classList.remove('active'));

        if (idx !== '') {
            const target = tracks[parseInt(idx, 10)];
            if (target) target.mode = 'showing';
            if (items[idx + 1]) items[idx + 1].classList.add('active');
        } else {
            if (items[0]) items[0].classList.add('active');
        }

        const subBtn = document.getElementById('theater-sub-btn');
        if (subBtn) subBtn.classList.toggle('active', idx !== '');
        this.closeMenus();
    },

    setSpeed(speed) {
        if (!this.video) return;
        this.video.playbackRate = parseFloat(speed);
        this.currentSpeed = parseFloat(speed);

        const lbl = document.getElementById('theater-speed-label');
        if (lbl) lbl.textContent = `${speed}x`;

        const items = document.querySelectorAll('#theater-speed-menu .theater-menu-item');
        items.forEach(it => {
            it.classList.toggle('active', it.textContent.includes(`${speed}x`));
        });

        this.closeMenus();
    },

    showNextEpisodeBanner() {
        if (!this.nextEpisodeInfo) return;
        const banner = document.getElementById('theater-next-banner');
        const titleElem = document.getElementById('theater-next-title');
        const countElem = document.getElementById('theater-next-countdown');
        if (!banner || !titleElem) return;

        titleElem.textContent = this.nextEpisodeInfo.title || 'Next Episode';
        banner.style.setProperty('display', 'flex', 'important');
        banner.classList.add('active');
        this.nextEpCountdown = 10;

        if (this.nextEpTimeout) clearInterval(this.nextEpTimeout);
        this.nextEpTimeout = setInterval(() => {
            this.nextEpCountdown--;
            if (countElem) countElem.textContent = this.nextEpCountdown;
            if (this.nextEpCountdown <= 0) {
                clearInterval(this.nextEpTimeout);
                this.nextEpTimeout = null;
                this.playNextEpisodeNow();
            }
        }, 1000);
    },

    playNextEpisodeNow() {
        if (this.nextEpTimeout) {
            clearInterval(this.nextEpTimeout);
            this.nextEpTimeout = null;
        }
        if (this.onEndedCallback) {
            this.onEndedCallback();
        }
    },

    cancelNextEpisode() {
        if (this.nextEpTimeout) {
            clearInterval(this.nextEpTimeout);
            this.nextEpTimeout = null;
        }
        const banner = document.getElementById('theater-next-banner');
        if (banner) {
            banner.classList.remove('active');
            banner.style.setProperty('display', 'none', 'important');
        }
    },

    restartFromBeginning() {
        if (!this.video) return;
        this.video.currentTime = 0;
        this.dismissResume();
    },

    dismissResume() {
        const banner = document.getElementById('theater-resume-banner');
        if (banner) banner.style.display = 'none';
    },

    onEnded() {
        if (this.nextEpisodeInfo && this.onEndedCallback) {
            this.playNextEpisodeNow();
        } else if (this.onEndedCallback) {
            this.onEndedCallback();
        }
    },

    onKeyDown(e) {
        if (!this.modal || !this.modal.classList.contains('active')) return;
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

        switch (e.key.toLowerCase()) {
            case ' ':
            case 'k':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'f':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'arrowleft':
            case 'j':
                e.preventDefault();
                this.seekRelative(-10);
                break;
            case 'arrowright':
            case 'l':
                e.preventDefault();
                this.seekRelative(10);
                break;
            case 'arrowup':
                e.preventDefault();
                if (this.video) this.setVolume(Math.min(1, this.video.volume + 0.05));
                break;
            case 'arrowdown':
                e.preventDefault();
                if (this.video) this.setVolume(Math.max(0, this.video.volume - 0.05));
                break;
            case 'c':
                e.preventDefault();
                this.setSubtitle(this.currentSubIdx === '' ? 0 : '');
                break;
            case 'escape':
                e.preventDefault();
                this.close();
                break;
        }
    },

    close() {
        if (this.nextEpTimeout) {
            clearInterval(this.nextEpTimeout);
            this.nextEpTimeout = null;
        }
        if (this.controlsTimeout) {
            clearTimeout(this.controlsTimeout);
            this.controlsTimeout = null;
        }

        if (this.video) {
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
        }

        if (document.fullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        }

        if (this.keyHandler) {
            window.removeEventListener('keydown', this.keyHandler);
        }

        if (this.modal) {
            this.modal.classList.remove('active', 'theater-controls-hidden', 'cursor-hidden');
            this.modal.style.setProperty('display', 'none', 'important');
            this.modal.innerHTML = '';
        }
    },

    formatTime(sec) {
        if (!sec || isNaN(sec)) return '00:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) {
            return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
};

function openTheaterModalWithVideo(title, quality, streamUrl, subtitles = [], onEndedCallback = null, nextEpisodeInfo = null) {
    CinemaPlayer.open(title, quality, streamUrl, subtitles, onEndedCallback, nextEpisodeInfo);
}

function closeTheaterModal() {
    CinemaPlayer.close();
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
    viewContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading artist details, bio & artwork...</p></div>';

    try {
        const res = await fetch('/api/enrichment.php?action=artist_info&artist_id=' + artistId + '&name=' + encodeURIComponent(artistName));
        const data = await res.json();

        let totalDuration = 0;
        if (data.tracks) data.tracks.forEach(t => totalDuration += (t.duration || 0));

        const bannerUrl = data.banner_art || data.art_path || 'assets/img/default-artist.svg';
        const profileArtUrl = data.art_path || bannerUrl;

        let html = `
            <div class="artist-detail-view">
                <button class="back-btn" onclick="loadView('artists')">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    <span>Back to Artists</span>
                </button>

                <!-- Artist Hero Banner -->
                <div class="artist-hero-card" style="position:relative; margin-top:16px; border-radius:18px; overflow:hidden; min-height:240px; display:flex; align-items:flex-end; padding:28px; background:linear-gradient(0deg, rgba(6,7,12,0.95) 0%, rgba(6,7,12,0.4) 60%, rgba(6,7,12,0.2) 100%), url('${bannerUrl}') center/cover no-repeat; border:1px solid rgba(255,255,255,0.1);">
                    <div style="display:flex; align-items:center; gap:24px; z-index:2; width:100%;">
                        <img src="${profileArtUrl}" alt="${escapeHtml(data.name)}" style="width:110px; height:110px; border-radius:50%; object-fit:cover; border:3px solid rgba(255,255,255,0.3); box-shadow:0 8px 24px rgba(0,0,0,0.5);" onerror="this.onerror=null; this.src='assets/img/default-artist.svg';">
                        <div style="flex:1;">
                            <span style="font-size:0.75rem; font-weight:800; letter-spacing:1.5px; color:var(--accent-color);">ARTIST SPOTLIGHT</span>
                            <h1 style="font-size:2.2rem; font-weight:900; color:#fff; margin:4px 0 8px 0; text-shadow:0 2px 10px rgba(0,0,0,0.8);">${escapeHtml(data.name)}</h1>
                            <div style="font-size:0.9rem; color:rgba(255,255,255,0.8); display:flex; gap:16px;">
                                <span>${data.albums ? data.albums.length : 0} Albums</span>
                                <span>•</span>
                                <span>${data.tracks ? data.tracks.length : 0} Lossless Tracks</span>
                                <span>•</span>
                                <span>${formatDuration(totalDuration)}</span>
                            </div>
                        </div>
                        <div style="display:flex; gap:12px;">
                            ${data.tracks && data.tracks.length > 0 ? `
                                <button class="btn btn-primary" onclick="playAllArtistTracks()" style="padding:10px 22px; font-weight:700;">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
                                    <span>Play All Tracks</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Biography Section -->
                <div class="downloader-card" style="margin:20px 0; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px 22px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <h3 style="font-size:1.05rem; font-weight:700; color:#fff;">Biography & Profile</h3>
                        <span style="font-size:0.75rem; color:var(--text-secondary);">Deezer / Wikipedia</span>
                    </div>
                    <p style="color:var(--text-secondary); line-height:1.65; font-size:0.92rem;">${escapeHtml(data.bio)}</p>
                </div>

                <!-- Artist Tracks -->
                <div class="view-header" style="margin-top:24px;">
                    <h3 style="font-size:1.2rem; font-weight:800; color:#fff;">Lossless Tracks (${data.tracks ? data.tracks.length : 0})</h3>
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

async function renderSettingsView() {
    const savedTheme = localStorage.getItem('christos_theme') || 'apple';
    const viewContainer = document.getElementById('content-view');

    // Fetch scrobble settings
    let scrobbleData = { lastfm: {}, listenbrainz: {} };
    try {
        const res = await fetch('/api/enrichment.php?action=get_scrobble_settings');
        scrobbleData = await res.json();
    } catch (e) {}

    viewContainer.innerHTML = `
        <div class="view-header">
            <h2>Settings & Discovery</h2>
            <p style="color:var(--text-secondary); margin-top:4px;">Configure scrobbling, ReplayGain loudness normalization, themes, and server info</p>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:20px;">
            <!-- Scrobbling & Play History Sync Card -->
            <div class="downloader-card">
                <h3 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:16px; border-bottom:1px solid var(--border-color); padding-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent-color)" stroke-width="2" style="vertical-align:middle; margin-right:6px;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                        Scrobbling (Last.fm & ListenBrainz)
                    </span>
                    <span id="scrobble-save-badge" style="font-size:0.75rem; padding:2px 8px; border-radius:10px; background:rgba(32,191,107,0.2); color:#20bf6b; display:none;">Saved!</span>
                </h3>

                <!-- Last.fm Section -->
                <div style="margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label style="font-weight:700; color:#fff; font-size:0.92rem; display:flex; align-items:center; gap:6px;">
                            <span style="color:#d51007; font-weight:900;">Last.fm</span> Scrobbling
                        </label>
                        <input type="checkbox" id="setting-lastfm-enabled" ${scrobbleData.lastfm?.enabled ? 'checked' : ''} onchange="saveScrobblerSettings()">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem;">
                        <input type="text" id="setting-lastfm-user" class="form-input" placeholder="Last.fm Username" value="${escapeHtml(scrobbleData.lastfm?.username || '')}" style="padding:6px 10px; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:6px; color:#fff;">
                        <input type="text" id="setting-lastfm-key" class="form-input" placeholder="Last.fm API Key (Optional)" value="" style="padding:6px 10px; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:6px; color:#fff;">
                        <input type="password" id="setting-lastfm-session" class="form-input" placeholder="Last.fm Session Key (sk)" value="" style="padding:6px 10px; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:6px; color:#fff;">
                    </div>
                </div>

                <!-- ListenBrainz Section -->
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label style="font-weight:700; color:#fff; font-size:0.92rem; display:flex; align-items:center; gap:6px;">
                            <span style="color:#eb743b; font-weight:900;">ListenBrainz</span> Scrobbling
                        </label>
                        <input type="checkbox" id="setting-listenbrainz-enabled" ${scrobbleData.listenbrainz?.enabled ? 'checked' : ''} onchange="saveScrobblerSettings()">
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px; font-size:0.85rem;">
                        <input type="password" id="setting-listenbrainz-token" class="form-input" placeholder="ListenBrainz User Token" value="${escapeHtml(scrobbleData.listenbrainz?.token_masked || '')}" style="padding:6px 10px; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:6px; color:#fff;">
                    </div>
                </div>

                <button class="btn btn-primary" onclick="saveScrobblerSettings()" style="width:100%; margin-top:14px; padding:8px 16px;">
                    Save Scrobbler Credentials
                </button>
            </div>

            <!-- ReplayGain Loudness Engine Card -->
            <div class="downloader-card">
                <h3 style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:16px; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent-color)" stroke-width="2" style="vertical-align:middle; margin-right:6px;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    ReplayGain & Loudness Normalization
                </h3>
                <div style="display:flex; flex-direction:column; gap:14px; font-size:0.9rem;">
                    <div>
                        <label style="font-size:0.85rem; color:var(--text-secondary); font-weight:600; display:block; margin-bottom:6px;">Default Normalization Mode</label>
                        <select class="form-select" onchange="DSP.setReplayGainMode(this.value)">
                            <option value="track" ${DSP.replayGainMode==='track'?'selected':''}>Track Gain (Equalize each song)</option>
                            <option value="album" ${DSP.replayGainMode==='album'?'selected':''}>Album Gain (Preserve album dynamics)</option>
                            <option value="off" ${DSP.replayGainMode==='off'?'selected':''}>Disabled (Original volume)</option>
                        </select>
                    </div>
                    <div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <label style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">Pre-Amp Volume Adjustment</label>
                            <span style="font-weight:700; color:#fff;">${DSP.preampDb > 0 ? '+' : ''}${DSP.preampDb.toFixed(1)} dB</span>
                        </div>
                        <input type="range" min="-6" max="6" step="0.5" value="${DSP.preampDb}" oninput="DSP.setPreamp(this.value)" style="width:100%;">
                    </div>
                    <label style="display:flex; align-items:center; gap:8px; color:var(--text-secondary); cursor:pointer; font-weight:600;">
                        <input type="checkbox" ${DSP.antiClipping?'checked':''} onchange="DSP.toggleAntiClipping(this.checked)">
                        Anti-Clipping Peak Limiter (Prevents digital distortion)
                    </label>
                </div>
            </div>

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
                    <div style="display:flex; justify-content:space-between;"><span>Version</span><span style="color:var(--accent-color); font-weight:700;">CHRISTOS v2.5.0</span></div>
                </div>
            </div>
        </div>
    `;
}

async function saveScrobblerSettings() {
    const payload = {
        lastfm_enabled: document.getElementById('setting-lastfm-enabled')?.checked,
        lastfm_username: document.getElementById('setting-lastfm-user')?.value,
        lastfm_api_key: document.getElementById('setting-lastfm-key')?.value,
        lastfm_session_key: document.getElementById('setting-lastfm-session')?.value,
        listenbrainz_enabled: document.getElementById('setting-listenbrainz-enabled')?.checked,
        listenbrainz_token: document.getElementById('setting-listenbrainz-token')?.value
    };

    try {
        const res = await fetch('/api/enrichment.php?action=save_scrobble_settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            const badge = document.getElementById('scrobble-save-badge');
            if (badge) {
                badge.style.display = 'inline-block';
                setTimeout(() => { badge.style.display = 'none'; }, 3000);
            }
        }
    } catch (e) {
        alert('Failed to save scrobbler settings: ' + e.message);
    }
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
