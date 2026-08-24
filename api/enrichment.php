<?php
require_once __DIR__ . '/../includes/db.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? 'search_lyrics';
$db = get_db();

function httpGetJson($url, $headers = []) {
    $headerStr = "User-Agent: CHRISTOS-HiFi-MediaServer/2.4 ( https://github.com/christos )\r\nAccept: application/json\r\n";
    foreach ($headers as $k => $v) {
        $headerStr .= "{$k}: {$v}\r\n";
    }
    $opts = [
        'http' => [
            'method' => 'GET',
            'header' => $headerStr,
            'timeout' => 8
        ]
    ];
    $ctx = stream_context_create($opts);
    $res = @file_get_contents($url, false, $ctx);
    if (!$res) return null;
    return json_decode($res, true);
}

function httpPostJson($url, $data, $headers = []) {
    $headerStr = "User-Agent: CHRISTOS-HiFi-MediaServer/2.4 ( https://github.com/christos )\r\nContent-Type: application/json\r\nAccept: application/json\r\n";
    foreach ($headers as $k => $v) {
        $headerStr .= "{$k}: {$v}\r\n";
    }
    $opts = [
        'http' => [
            'method' => 'POST',
            'header' => $headerStr,
            'content' => json_encode($data),
            'timeout' => 8
        ]
    ];
    $ctx = stream_context_create($opts);
    $res = @file_get_contents($url, false, $ctx);
    if (!$res) return null;
    return json_decode($res, true);
}

function httpPostForm($url, $fields, $headers = []) {
    $headerStr = "User-Agent: CHRISTOS-HiFi-MediaServer/2.4 ( https://github.com/christos )\r\nContent-Type: application/x-www-form-urlencoded\r\n";
    foreach ($headers as $k => $v) {
        $headerStr .= "{$k}: {$v}\r\n";
    }
    $opts = [
        'http' => [
            'method' => 'POST',
            'header' => $headerStr,
            'content' => http_build_query($fields),
            'timeout' => 8
        ]
    ];
    $ctx = stream_context_create($opts);
    $res = @file_get_contents($url, false, $ctx);
    if (!$res) return null;
    return json_decode($res, true);
}

function getSetting($key, $default = '') {
    $db = get_db();
    $stmt = $db->prepare("SELECT value FROM settings WHERE key = ?");
    $stmt->execute([$key]);
    $val = $stmt->fetchColumn();
    return ($val !== false && $val !== null) ? $val : $default;
}

function setSetting($key, $val) {
    $db = get_db();
    $stmt = $db->prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    $stmt->execute([$key, (string)$val]);
}

try {
    switch ($action) {
        case 'search_lyrics':
            $track_id = (int)($_GET['track_id'] ?? 0);
            if ($track_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Valid track_id required']);
                break;
            }

            // Get track info
            $stmt = $db->prepare("
                SELECT t.id, t.title, t.duration, ar.name AS artist, a.title AS album, a.id AS album_id
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON a.artist_id = ar.id
                WHERE t.id = ?
            ");
            $stmt->execute([$track_id]);
            $track = $stmt->fetch();
            if (!$track) {
                http_response_code(404);
                echo json_encode(['error' => 'Track not found']);
                break;
            }

            // Clean title (remove (Remastered), - 2025 Mix, ft., etc. for better search match)
            $cleanTitle = preg_replace('/\s*\([^)]*\)/', '', $track['title']);
            $cleanTitle = preg_replace('/\s*\[[^\]]*\]/', '', $cleanTitle);
            $cleanTitle = trim(preg_replace('/\s*-\s*.*Mix.*/i', '', $cleanTitle));

            $artistName = urlencode($track['artist']);
            $trackName = urlencode($cleanTitle);
            $albumName = urlencode($track['album']);
            $duration = (int)$track['duration'];

            // 1. Try exact match on LRCLIB
            $lrcData = null;
            $urlExact = "https://lrclib.net/api/get?artist_name={$artistName}&track_name={$trackName}&album_name={$albumName}&duration={$duration}";
            $lrcData = httpGetJson($urlExact);

            // 2. If exact failed, try query search
            if (!$lrcData || (empty($lrcData['syncedLyrics']) && empty($lrcData['plainLyrics']))) {
                $q = urlencode($track['artist'] . ' ' . $cleanTitle);
                $searchRes = httpGetJson("https://lrclib.net/api/search?q={$q}");
                if (!empty($searchRes) && is_array($searchRes)) {
                    $lrcData = $searchRes[0];
                }
            }

            if ($lrcData && (!empty($lrcData['syncedLyrics']) || !empty($lrcData['plainLyrics']))) {
                $isSynced = !empty($lrcData['syncedLyrics']) ? 1 : 0;
                $lyricsText = $isSynced ? $lrcData['syncedLyrics'] : $lrcData['plainLyrics'];

                $stmtDel = $db->prepare("DELETE FROM lyrics WHERE track_id = ?");
                $stmtDel->execute([$track_id]);

                $stmtIns = $db->prepare("INSERT INTO lyrics (track_id, lrc_text, is_synced) VALUES (?, ?, ?)");
                $stmtIns->execute([$track_id, $lyricsText, $isSynced]);

                echo json_encode([
                    'success' => true,
                    'is_synced' => (bool)$isSynced,
                    'lrc_text' => $lyricsText,
                    'source' => 'LRCLIB'
                ]);
            } else {
                echo json_encode([
                    'success' => false,
                    'message' => 'No online lyrics found for this track'
                ]);
            }
            break;

        case 'artist_info':
            $artist_id = (int)($_GET['artist_id'] ?? 0);
            $artist_name = trim($_GET['name'] ?? '');

            if ($artist_id > 0) {
                $stmt = $db->prepare("SELECT * FROM artists WHERE id = ?");
                $stmt->execute([$artist_id]);
                $artist = $stmt->fetch();
            } else {
                $stmt = $db->prepare("SELECT * FROM artists WHERE name = ?");
                $stmt->execute([$artist_name]);
                $artist = $stmt->fetch();
            }

            if (!$artist) {
                http_response_code(404);
                echo json_encode(['error' => 'Artist not found']);
                break;
            }

            $bio = $artist['bio'] ?? '';
            $bannerArt = $artist['banner_art'] ?? '';
            $tags = $artist['tags'] ?? '';
            $genres = $artist['genres'] ?? '';

            // If bio or banner is missing, enrich online
            if (empty($bio) || empty($bannerArt)) {
                // 1. Query Deezer API for high-res photo (1000x1000)
                $deezerUrl = "https://api.deezer.com/search/artist?q=" . urlencode($artist['name']);
                $deezerData = httpGetJson($deezerUrl);
                if (!empty($deezerData['data'][0])) {
                    $d = $deezerData['data'][0];
                    if (empty($bannerArt) && !empty($d['picture_xl'])) {
                        $bannerArt = $d['picture_xl'];
                    } elseif (empty($bannerArt) && !empty($d['picture_big'])) {
                        $bannerArt = $d['picture_big'];
                    }
                }

                // 2. Query Wikipedia API for biography
                if (empty($bio)) {
                    $wikiUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" . urlencode(str_replace(' ', '_', $artist['name']));
                    $wikiData = httpGetJson($wikiUrl);
                    if (!empty($wikiData['extract'])) {
                        $bio = $wikiData['extract'];
                    }
                }

                // Cache enriched data
                if ($bio || $bannerArt) {
                    $up = $db->prepare("UPDATE artists SET bio = ?, banner_art = ?, tags = ?, genres = ? WHERE id = ?");
                    $up->execute([$bio, $bannerArt, $tags, $genres, $artist['id']]);
                }
            }

            // Get albums & top tracks
            $stmtAlbums = $db->prepare("SELECT * FROM albums WHERE artist_id = ? ORDER BY year DESC, title ASC");
            $stmtAlbums->execute([$artist['id']]);
            $albums = $stmtAlbums->fetchAll();

            $stmtTracks = $db->prepare("
                SELECT t.*, a.title AS album, a.art_path AS album_art
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                WHERE a.artist_id = ?
                ORDER BY a.year DESC, t.track_number ASC
            ");
            $stmtTracks->execute([$artist['id']]);
            $tracks = $stmtTracks->fetchAll();

            echo json_encode([
                'id' => $artist['id'],
                'name' => $artist['name'],
                'art_path' => $artist['art_path'],
                'banner_art' => $bannerArt ?: $artist['art_path'],
                'bio' => $bio ?: "Audiophile artist in CHRISTOS Hi-Fi media collection.",
                'tags' => $tags,
                'genres' => $genres,
                'albums' => $albums,
                'tracks' => $tracks
            ]);
            break;

        /* ============================================================
           SCROBBLING & DISCOVERY API (Last.fm & ListenBrainz)
           ============================================================ */
        case 'get_scrobble_settings':
            $lastfmEnabled = (bool)getSetting('lastfm_enabled', '0');
            $lastfmUser = getSetting('lastfm_username', '');
            $lastfmHasKey = !empty(getSetting('lastfm_api_key', ''));
            $lastfmHasSession = !empty(getSetting('lastfm_session_key', ''));

            $lbEnabled = (bool)getSetting('listenbrainz_enabled', '0');
            $lbToken = getSetting('listenbrainz_token', '');
            $lbMasked = $lbToken ? (substr($lbToken, 0, 4) . '••••' . substr($lbToken, -4)) : '';

            echo json_encode([
                'lastfm' => [
                    'enabled' => $lastfmEnabled,
                    'username' => $lastfmUser,
                    'has_api_key' => $lastfmHasKey,
                    'has_session_key' => $lastfmHasSession
                ],
                'listenbrainz' => [
                    'enabled' => $lbEnabled,
                    'token_masked' => $lbMasked,
                    'configured' => !empty($lbToken)
                ]
            ]);
            break;

        case 'save_scrobble_settings':
            $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

            if (isset($input['lastfm_enabled'])) {
                setSetting('lastfm_enabled', $input['lastfm_enabled'] ? '1' : '0');
            }
            if (isset($input['lastfm_username'])) {
                setSetting('lastfm_username', trim($input['lastfm_username']));
            }
            if (isset($input['lastfm_api_key'])) {
                setSetting('lastfm_api_key', trim($input['lastfm_api_key']));
            }
            if (isset($input['lastfm_api_secret'])) {
                setSetting('lastfm_api_secret', trim($input['lastfm_api_secret']));
            }
            if (isset($input['lastfm_session_key'])) {
                setSetting('lastfm_session_key', trim($input['lastfm_session_key']));
            }

            if (isset($input['listenbrainz_enabled'])) {
                setSetting('listenbrainz_enabled', $input['listenbrainz_enabled'] ? '1' : '0');
            }
            if (isset($input['listenbrainz_token']) && $input['listenbrainz_token'] !== '••••') {
                setSetting('listenbrainz_token', trim($input['listenbrainz_token']));
            }

            echo json_encode(['success' => true, 'message' => 'Scrobbler settings saved successfully']);
            break;

        case 'scrobble_now_playing':
            $track_id = (int)($_POST['track_id'] ?? $_GET['track_id'] ?? 0);
            if ($track_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Valid track_id required']);
                break;
            }

            $stmt = $db->prepare("
                SELECT t.id, t.title, t.duration, ar.name AS artist, a.title AS album
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON a.artist_id = ar.id
                WHERE t.id = ?
            ");
            $stmt->execute([$track_id]);
            $track = $stmt->fetch();
            if (!$track) {
                http_response_code(404);
                echo json_encode(['error' => 'Track not found']);
                break;
            }

            // Record to internal play history
            $stmtHist = $db->prepare("INSERT INTO play_history (user_id, track_id) VALUES (1, ?)");
            $stmtHist->execute([$track_id]);

            $results = ['internal' => true];

            // 1. ListenBrainz Now Playing
            $lbEnabled = (bool)getSetting('listenbrainz_enabled', '0');
            $lbToken = getSetting('listenbrainz_token', '');
            if ($lbEnabled && !empty($lbToken)) {
                $lbPayload = [
                    'listen_type' => 'playing_now',
                    'payload' => [
                        [
                            'track_metadata' => [
                                'artist_name' => $track['artist'],
                                'track_name' => $track['title'],
                                'release_name' => $track['album'],
                                'additional_info' => [
                                    'duration_ms' => ((int)$track['duration']) * 1000,
                                    'media_player' => 'CHRISTOS Hi-Fi'
                                ]
                            ]
                        ]
                    ]
                ];
                $lbRes = httpPostJson('https://api.listenbrainz.org/1/submit-listens', $lbPayload, [
                    'Authorization' => "Token {$lbToken}"
                ]);
                $results['listenbrainz'] = !empty($lbRes['status']) && $lbRes['status'] === 'ok';
            }

            // 2. Last.fm Now Playing (Audioscrobbler 2.0)
            $lastfmEnabled = (bool)getSetting('lastfm_enabled', '0');
            $lastfmSession = getSetting('lastfm_session_key', '');
            $lastfmApiKey = getSetting('lastfm_api_key', '');
            $lastfmSecret = getSetting('lastfm_api_secret', '');

            if ($lastfmEnabled && !empty($lastfmSession) && !empty($lastfmApiKey) && !empty($lastfmSecret)) {
                $params = [
                    'method' => 'track.updateNowPlaying',
                    'artist' => $track['artist'],
                    'track' => $track['title'],
                    'album' => $track['album'],
                    'duration' => (string)$track['duration'],
                    'api_key' => $lastfmApiKey,
                    'sk' => $lastfmSession
                ];
                ksort($params);
                $sigStr = '';
                foreach ($params as $k => $v) {
                    $sigStr .= $k . $v;
                }
                $sigStr .= $lastfmSecret;
                $params['api_sig'] = md5($sigStr);
                $params['format'] = 'json';

                $lastfmRes = httpPostForm('https://ws.audioscrobbler.com/2.0/', $params);
                $results['lastfm'] = isset($lastfmRes['nowplaying']);
            }

            echo json_encode(['success' => true, 'services' => $results]);
            break;

        case 'scrobble_track':
            $track_id = (int)($_POST['track_id'] ?? $_GET['track_id'] ?? 0);
            $timestamp = (int)($_POST['timestamp'] ?? $_GET['timestamp'] ?? time());

            if ($track_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Valid track_id required']);
                break;
            }

            $stmt = $db->prepare("
                SELECT t.id, t.title, t.duration, ar.name AS artist, a.title AS album
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON a.artist_id = ar.id
                WHERE t.id = ?
            ");
            $stmt->execute([$track_id]);
            $track = $stmt->fetch();
            if (!$track) {
                http_response_code(404);
                echo json_encode(['error' => 'Track not found']);
                break;
            }

            $results = ['internal' => true];

            // 1. ListenBrainz Scrobble
            $lbEnabled = (bool)getSetting('listenbrainz_enabled', '0');
            $lbToken = getSetting('listenbrainz_token', '');
            if ($lbEnabled && !empty($lbToken)) {
                $lbPayload = [
                    'listen_type' => 'single',
                    'payload' => [
                        [
                            'listened_at' => $timestamp,
                            'track_metadata' => [
                                'artist_name' => $track['artist'],
                                'track_name' => $track['title'],
                                'release_name' => $track['album'],
                                'additional_info' => [
                                    'duration_ms' => ((int)$track['duration']) * 1000,
                                    'media_player' => 'CHRISTOS Hi-Fi'
                                ]
                            ]
                        ]
                    ]
                ];
                $lbRes = httpPostJson('https://api.listenbrainz.org/1/submit-listens', $lbPayload, [
                    'Authorization' => "Token {$lbToken}"
                ]);
                $results['listenbrainz'] = !empty($lbRes['status']) && $lbRes['status'] === 'ok';
            }

            // 2. Last.fm Scrobble
            $lastfmEnabled = (bool)getSetting('lastfm_enabled', '0');
            $lastfmSession = getSetting('lastfm_session_key', '');
            $lastfmApiKey = getSetting('lastfm_api_key', '');
            $lastfmSecret = getSetting('lastfm_api_secret', '');

            if ($lastfmEnabled && !empty($lastfmSession) && !empty($lastfmApiKey) && !empty($lastfmSecret)) {
                $params = [
                    'method' => 'track.scrobble',
                    'artist' => $track['artist'],
                    'track' => $track['title'],
                    'album' => $track['album'],
                    'timestamp' => (string)$timestamp,
                    'api_key' => $lastfmApiKey,
                    'sk' => $lastfmSession
                ];
                ksort($params);
                $sigStr = '';
                foreach ($params as $k => $v) {
                    $sigStr .= $k . $v;
                }
                $sigStr .= $lastfmSecret;
                $params['api_sig'] = md5($sigStr);
                $params['format'] = 'json';

                $lastfmRes = httpPostForm('https://ws.audioscrobbler.com/2.0/', $params);
                $results['lastfm'] = isset($lastfmRes['scrobbles']);
            }

            echo json_encode(['success' => true, 'services' => $results]);
            break;

        case 'search_art':
            $album_id = (int)($_GET['album_id'] ?? 0);
            if ($album_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Valid album_id required']);
                break;
            }

            $stmt = $db->prepare("
                SELECT a.id, a.title, ar.name AS artist, a.art_path, 
                       (SELECT file_path FROM tracks WHERE album_id = a.id LIMIT 1) AS sample_file
                FROM albums a
                JOIN artists ar ON a.artist_id = ar.id
                WHERE a.id = ?
            ");
            $stmt->execute([$album_id]);
            $album = $stmt->fetch();
            if (!$album) {
                http_response_code(404);
                echo json_encode(['error' => 'Album not found']);
                break;
            }

            $searchTerm = urlencode($album['artist'] . ' ' . $album['title']);
            $itunesUrl = "https://itunes.apple.com/search?term={$searchTerm}&entity=album&limit=3";
            $res = httpGetJson($itunesUrl);

            $artUrl = null;
            if (!empty($res['results'])) {
                $rawUrl = $res['results'][0]['artworkUrl100'] ?? '';
                if ($rawUrl) {
                    $artUrl = str_replace('100x100bb', '1400x1400bb', $rawUrl);
                }
            }

            if ($artUrl && !empty($album['sample_file'])) {
                // Download and save cover.jpg locally in the album folder
                $albumDir = dirname($album['sample_file']);
                $destCover = $albumDir . DIRECTORY_SEPARATOR . 'cover.jpg';
                
                $imgData = @file_get_contents($artUrl);
                if ($imgData && is_dir($albumDir) && is_writable($albumDir)) {
                    @file_put_contents($destCover, $imgData);
                    $stmtUp = $db->prepare("UPDATE albums SET art_path = ? WHERE id = ?");
                    $stmtUp->execute([$destCover, $album_id]);
                }

                echo json_encode([
                    'success' => true,
                    'art_url' => $artUrl,
                    'saved_locally' => file_exists($destCover)
                ]);
            } else {
                echo json_encode([
                    'success' => false,
                    'message' => 'No online artwork found'
                ]);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Unknown action']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
