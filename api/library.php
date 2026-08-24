<?php
require_once __DIR__ . '/../includes/db.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? 'albums';

// Handle image serving separately from JSON
if ($action === 'art') {
    serveArtwork();
    exit;
}

header('Content-Type: application/json; charset=utf-8');
$db = get_db();

// Optional library filter: 'flac', 'apple_music', or 'all'
$libraryFilter = $_GET['library'] ?? null;
$libWhere = '';
$libParams = [];
if ($libraryFilter && $libraryFilter !== 'all' && isset(LIBRARIES[$libraryFilter])) {
    $libWhere = " WHERE t.library_tag = ? ";
    $libParams = [$libraryFilter];
}

try {
    switch ($action) {
        case 'libraries':
            $libs = [];
            foreach (LIBRARIES as $key => $val) {
                $stmt = $db->prepare("SELECT COUNT(id) AS track_count, COUNT(DISTINCT album_id) AS album_count FROM tracks WHERE library_tag = ?");
                $stmt->execute([$key]);
                $counts = $stmt->fetch();
                $libs[] = [
                    'id' => $key,
                    'name' => $val['name'],
                    'slug' => $val['slug'],
                    'icon' => $val['icon'],
                    'track_count' => (int)($counts['track_count'] ?? 0),
                    'album_count' => (int)($counts['album_count'] ?? 0),
                    'paths' => $val['paths']
                ];
            }
            echo json_encode($libs);
            break;

        case 'albums':
            $sort = $_GET['sort'] ?? 'title_asc';
            $filter = $_GET['filter'] ?? '';
            $minRating = (int)($_GET['min_rating'] ?? 0);

            $orderSql = "a.title ASC";
            if ($sort === 'rating_desc') $orderSql = "a.rating DESC, a.title ASC";
            elseif ($sort === 'artist_asc') $orderSql = "ar.name ASC, a.title ASC";
            elseif ($sort === 'year_desc') $orderSql = "a.year DESC, a.title ASC";

            $whereConds = [];
            $albumParams = [];
            if ($libWhere) {
                $whereConds[] = "t.library_tag = :lib";
                $albumParams['lib'] = $libraryFilter;
            }
            if ($filter === 'favorites') {
                $whereConds[] = "a.is_favorite = 1";
            }
            if ($filter === 'rated' || $minRating > 0) {
                $whereConds[] = "a.rating >= " . max(1, $minRating);
            }

            $whereSql = count($whereConds) > 0 ? " WHERE " . implode(" AND ", $whereConds) : "";

            $query = "
                SELECT 
                    a.id, 
                    a.title, 
                    a.year, 
                    a.art_path,
                    a.rating,
                    a.is_favorite,
                    ar.name AS artist,
                    ar.id AS artist_id,
                    COUNT(t.id) AS track_count,
                    COALESCE(SUM(t.duration), 0) AS total_duration,
                    MAX(t.format) AS primary_format,
                    MAX(t.bit_depth) AS max_bit_depth,
                    MAX(t.sample_rate) AS max_sample_rate
                FROM albums a
                JOIN artists ar ON a.artist_id = ar.id
                JOIN tracks t ON a.id = t.album_id
                {$whereSql}
                GROUP BY a.id, a.title, a.year, a.art_path, a.rating, a.is_favorite, ar.name, ar.id
                ORDER BY {$orderSql}
            ";
            $stmt = $db->prepare($query);
            $stmt->execute($albumParams);
            echo json_encode($stmt->fetchAll());
            break;

        case 'album':
            $album_id = (int)($_GET['album_id'] ?? 0);
            $stmt = $db->prepare("
                SELECT a.id, a.title, a.year, a.art_path, a.rating, a.is_favorite, ar.name AS artist, ar.id AS artist_id
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

            $trackQuery = "
                SELECT t.*, ar.name AS artist, a.title AS album_title, l.id AS lyric_id, l.is_synced,
                       (CASE WHEN f.track_id IS NOT NULL OR t.is_favorite = 1 THEN 1 ELSE 0 END) AS is_favorite
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON a.artist_id = ar.id
                LEFT JOIN lyrics l ON t.id = l.track_id
                LEFT JOIN favorites f ON t.id = f.track_id AND f.user_id = 1
                WHERE t.album_id = ? " . ($libWhere ? " AND t.library_tag = ? " : "") . "
                ORDER BY t.track_number ASC, t.title ASC
            ";
            $stmtTracks = $db->prepare($trackQuery);
            if ($libWhere) {
                $stmtTracks->execute([$album_id, $libraryFilter]);
            } else {
                $stmtTracks->execute([$album_id]);
            }
            $album['tracks'] = $stmtTracks->fetchAll();
            echo json_encode($album);
            break;

        case 'artists':
            $query = "
                SELECT 
                    ar.id, 
                    ar.name, 
                    ar.art_path,
                    ar.bio,
                    ar.banner_art,
                    ar.tags,
                    ar.genres,
                    COUNT(DISTINCT a.id) AS album_count,
                    COUNT(t.id) AS track_count
                FROM artists ar
                JOIN albums a ON ar.id = a.artist_id
                JOIN tracks t ON a.id = t.album_id
                " . ($libWhere ? " WHERE t.library_tag = :lib " : "") . "
                GROUP BY ar.id, ar.name, ar.art_path, ar.bio, ar.banner_art, ar.tags, ar.genres
                ORDER BY ar.name ASC
            ";
            $stmt = $db->prepare($query);
            if ($libWhere) {
                $stmt->execute(['lib' => $libraryFilter]);
            } else {
                $stmt->execute();
            }
            echo json_encode($stmt->fetchAll());
            break;

        case 'artist':
            $artist_id = (int)($_GET['artist_id'] ?? 0);
            $stmt = $db->prepare("SELECT * FROM artists WHERE id = ?");
            $stmt->execute([$artist_id]);
            $artist = $stmt->fetch();
            if (!$artist) {
                http_response_code(404);
                echo json_encode(['error' => 'Artist not found']);
                break;
            }

            $stmtAlbums = $db->prepare("
                SELECT a.*, COUNT(t.id) AS track_count, MAX(t.format) AS primary_format
                FROM albums a
                JOIN tracks t ON a.id = t.album_id
                WHERE a.artist_id = ? " . ($libWhere ? " AND t.library_tag = :lib " : "") . "
                GROUP BY a.id, a.title, a.year, a.art_path, a.rating, a.is_favorite, a.artist_id
                ORDER BY a.year DESC, a.title ASC
            ");
            if ($libWhere) {
                $stmtAlbums->execute(['artist_id' => $artist_id, 'lib' => $libraryFilter]);
            } else {
                $stmtAlbums->execute([$artist_id]);
            }
            $artist['albums'] = $stmtAlbums->fetchAll();
            echo json_encode($artist);
            break;

        case 'tracks':
            $album_id = isset($_GET['album_id']) ? (int)$_GET['album_id'] : 0;
            $sort = $_GET['sort'] ?? 'title_asc';
            $filter = $_GET['filter'] ?? '';
            $minRating = (int)($_GET['min_rating'] ?? 0);

            $orderSql = "t.title ASC";
            if ($sort === 'rating_desc') $orderSql = "t.rating DESC, t.title ASC";
            elseif ($sort === 'artist_asc') $orderSql = "ar.name ASC, t.title ASC";
            elseif ($sort === 'album_asc') $orderSql = "a.title ASC, t.track_number ASC";
            elseif ($sort === 'duration_desc') $orderSql = "t.duration DESC";

            $whereClause = [];
            $params = [];

            if ($album_id > 0) {
                $whereClause[] = "t.album_id = ?";
                $params[] = $album_id;
            }
            if ($libraryFilter && $libraryFilter !== 'all' && isset(LIBRARIES[$libraryFilter])) {
                $whereClause[] = "t.library_tag = ?";
                $params[] = $libraryFilter;
            }
            if ($filter === 'favorites') {
                $whereClause[] = "(f.track_id IS NOT NULL OR t.is_favorite = 1)";
            }
            if ($filter === 'rated' || $minRating > 0) {
                $whereClause[] = "t.rating >= " . max(1, $minRating);
            }

            $whereSql = count($whereClause) > 0 ? " WHERE " . implode(" AND ", $whereClause) : "";

            $stmt = $db->prepare("
                SELECT t.*, a.title AS album, a.art_path AS album_art, ar.name AS artist, l.id AS lyric_id, l.is_synced,
                       (CASE WHEN f.track_id IS NOT NULL OR t.is_favorite = 1 THEN 1 ELSE 0 END) AS is_favorite
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON a.artist_id = ar.id
                LEFT JOIN lyrics l ON t.id = l.track_id
                LEFT JOIN favorites f ON t.id = f.track_id AND f.user_id = 1
                {$whereSql}
                ORDER BY {$orderSql}
                LIMIT 500
            ");
            $stmt->execute($params);
            echo json_encode($stmt->fetchAll());
            break;

        case 'search':
            $q = trim($_GET['q'] ?? '');
            if (empty($q)) {
                echo json_encode(['artists' => [], 'albums' => [], 'tracks' => []]);
                break;
            }
            $term = "%{$q}%";

            $stmtArtists = $db->prepare("SELECT id, name, art_path FROM artists WHERE name LIKE ? ORDER BY name ASC LIMIT 10");
            $stmtArtists->execute([$term]);

            $stmtAlbums = $db->prepare("
                SELECT a.id, a.title, a.art_path, ar.name AS artist 
                FROM albums a 
                JOIN artists ar ON a.artist_id = ar.id 
                WHERE a.title LIKE ? 
                ORDER BY a.title ASC 
                LIMIT 10
            ");
            $stmtAlbums->execute([$term]);

            $stmtTracks = $db->prepare("
                SELECT t.id, t.title, t.duration, t.format, a.title AS album, ar.name AS artist, a.art_path AS album_art
                FROM tracks t
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON a.artist_id = ar.id
                WHERE t.title LIKE ?
                ORDER BY t.title ASC
                LIMIT 20
            ");
            $stmtTracks->execute([$term]);

            echo json_encode([
                'artists' => $stmtArtists->fetchAll(),
                'albums' => $stmtAlbums->fetchAll(),
                'tracks' => $stmtTracks->fetchAll()
            ]);
            break;

        case 'artist_detail':
            $artist_name = trim($_GET['name'] ?? '');
            $artist_id = (int)($_GET['id'] ?? 0);

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
                echo json_encode(['error' => 'Artist not found']);
                break;
            }

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

            // Fetch Wikipedia summary (cached / quick timeout)
            $bio = "High-fidelity artist in CHRISTOS collection with " . count($albums) . " albums and " . count($tracks) . " lossless tracks.";
            $wikiUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" . urlencode(str_replace(' ', '_', $artist['name']));
            $ctx = stream_context_create(['http' => ['timeout' => 1.5, 'user_agent' => 'CHRISTOS-MediaServer/2.3']]);
            $wikiRes = @file_get_contents($wikiUrl, false, $ctx);
            if ($wikiRes) {
                $wikiData = json_decode($wikiRes, true);
                if (!empty($wikiData['extract'])) {
                    $bio = $wikiData['extract'];
                }
            }

            echo json_encode([
                'id' => $artist['id'],
                'name' => $artist['name'],
                'art_path' => $artist['art_path'],
                'bio' => $bio,
                'albums' => $albums,
                'tracks' => $tracks
            ]);
            break;

        case 'rate_track':
            $track_id = (int)($_POST['track_id'] ?? $_GET['track_id'] ?? 0);
            $rating = max(0, min(5, (int)($_POST['rating'] ?? $_GET['rating'] ?? 0)));
            if ($track_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Valid track_id required']);
                break;
            }
            $stmt = $db->prepare("UPDATE tracks SET rating = ? WHERE id = ?");
            $stmt->execute([$rating, $track_id]);
            echo json_encode(['success' => true, 'track_id' => $track_id, 'rating' => $rating]);
            break;

        case 'rate_album':
            $album_id = (int)($_POST['album_id'] ?? $_GET['album_id'] ?? 0);
            $rating = max(0, min(5, (int)($_POST['rating'] ?? $_GET['rating'] ?? 0)));
            if ($album_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Valid album_id required']);
                break;
            }
            $stmt = $db->prepare("UPDATE albums SET rating = ? WHERE id = ?");
            $stmt->execute([$rating, $album_id]);
            echo json_encode(['success' => true, 'album_id' => $album_id, 'rating' => $rating]);
            break;

        case 'toggle_favorite':
            $rawInput = json_decode(file_get_contents('php://input'), true) ?: [];
            $type = strtolower($rawInput['type'] ?? $_POST['type'] ?? $_GET['type'] ?? 'track');
            $id = (int)($rawInput['id'] ?? $_POST['id'] ?? $_GET['id'] ?? 0);
            $track_id = (int)($rawInput['track_id'] ?? $_POST['track_id'] ?? $_GET['track_id'] ?? ($type === 'track' ? $id : 0));
            $album_id = (int)($rawInput['album_id'] ?? $_POST['album_id'] ?? $_GET['album_id'] ?? ($type === 'album' ? $id : 0));

            if ($track_id > 0) {
                $check = $db->prepare("SELECT 1 FROM favorites WHERE user_id = 1 AND track_id = ?");
                $check->execute([$track_id]);
                $isFav = $check->fetchColumn();

                if ($isFav) {
                    $del = $db->prepare("DELETE FROM favorites WHERE user_id = 1 AND track_id = ?");
                    $del->execute([$track_id]);
                    $up = $db->prepare("UPDATE tracks SET is_favorite = 0 WHERE id = ?");
                    $up->execute([$track_id]);
                    $newFav = false;
                } else {
                    $ins = $db->prepare("INSERT OR IGNORE INTO favorites (user_id, track_id) VALUES (1, ?)");
                    $ins->execute([$track_id]);
                    $up = $db->prepare("UPDATE tracks SET is_favorite = 1 WHERE id = ?");
                    $up->execute([$track_id]);
                    $newFav = true;
                }
                echo json_encode(['success' => true, 'track_id' => $track_id, 'is_favorite' => $newFav]);
            } elseif ($album_id > 0) {
                $stmtAlb = $db->prepare("SELECT is_favorite FROM albums WHERE id = ?");
                $stmtAlb->execute([$album_id]);
                $cur = (int)$stmtAlb->fetchColumn();
                $newFav = ($cur === 1) ? 0 : 1;
                $up = $db->prepare("UPDATE albums SET is_favorite = ? WHERE id = ?");
                $up->execute([$newFav, $album_id]);
                echo json_encode(['success' => true, 'album_id' => $album_id, 'is_favorite' => (bool)$newFav]);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'Valid track_id or album_id required']);
            }
            break;

        case 'lyrics':
            $track_id = (int)($_GET['track_id'] ?? 0);
            $stmt = $db->prepare("SELECT * FROM lyrics WHERE track_id = ?");
            $stmt->execute([$track_id]);
            $lyric = $stmt->fetch();

            if ($lyric && !empty($lyric['lrc_text'])) {
                echo json_encode($lyric);
                break;
            }

            // If missing in DB, check track file sidecars (.lrc, .srt, .ttml, .xml, .txt)
            if ($track_id > 0) {
                $stmtTrack = $db->prepare("SELECT file_path FROM tracks WHERE id = ?");
                $stmtTrack->execute([$track_id]);
                $filePath = $stmtTrack->fetchColumn();
                if ($filePath && file_exists($filePath)) {
                    require_once __DIR__ . '/../includes/metadata.php';
                    $sidecar = AudioMetadata::findSidecarLyrics($filePath);
                    if ($sidecar && !empty($sidecar['text'])) {
                        $del = $db->prepare("DELETE FROM lyrics WHERE track_id = ?");
                        $del->execute([$track_id]);
                        $ins = $db->prepare("INSERT INTO lyrics (track_id, lrc_text, is_synced) VALUES (?, ?, ?)");
                        $ins->execute([$track_id, $sidecar['text'], $sidecar['is_synced']]);
                        echo json_encode(['track_id' => $track_id, 'lrc_text' => $sidecar['text'], 'is_synced' => (bool)$sidecar['is_synced'], 'source' => $sidecar['source']]);
                        break;
                    }
                }
            }

            echo json_encode($lyric ?: ['lrc_text' => null, 'is_synced' => false]);
            break;

        case 'stats':
            $trackWhere = $libWhere ? " WHERE library_tag = :lib " : "";
            $stmtTracks = $db->prepare("SELECT COUNT(*) AS total, COALESCE(SUM(duration), 0) AS total_duration FROM tracks {$trackWhere}");
            if ($libWhere) $stmtTracks->execute(['lib' => $libraryFilter]);
            else $stmtTracks->execute();
            $trackData = $stmtTracks->fetch();

            $stmtLossless = $db->prepare("SELECT COUNT(*) AS total FROM tracks WHERE (format = 'alac' OR format = 'flac' OR bit_depth > 16)" . ($libWhere ? " AND library_tag = :lib" : ""));
            if ($libWhere) $stmtLossless->execute(['lib' => $libraryFilter]);
            else $stmtLossless->execute();
            $losslessData = $stmtLossless->fetch();

            $albumWhere = $libWhere ? " WHERE id IN (SELECT DISTINCT album_id FROM tracks WHERE library_tag = :lib)" : "";
            $stmtAlbums = $db->prepare("SELECT COUNT(*) AS total FROM albums {$albumWhere}");
            if ($libWhere) $stmtAlbums->execute(['lib' => $libraryFilter]);
            else $stmtAlbums->execute();
            $albumData = $stmtAlbums->fetch();

            $artistWhere = $libWhere ? " WHERE id IN (SELECT DISTINCT artist_id FROM albums WHERE id IN (SELECT DISTINCT album_id FROM tracks WHERE library_tag = :lib))" : "";
            $stmtArtists = $db->prepare("SELECT COUNT(*) AS total FROM artists {$artistWhere}");
            if ($libWhere) $stmtArtists->execute(['lib' => $libraryFilter]);
            else $stmtArtists->execute();
            $artistData = $stmtArtists->fetch();

            echo json_encode([
                'artists' => (int)($artistData['total'] ?? 0),
                'albums' => (int)($albumData['total'] ?? 0),
                'tracks' => (int)($trackData['total'] ?? 0),
                'total_duration' => (int)($trackData['total_duration'] ?? 0),
                'lossless_tracks' => (int)($losslessData['total'] ?? 0)
            ]);
            break;

        /* ============================================================
           PLAYLISTS API (FULL CRUD)
           ============================================================ */
        case 'playlists':
            $stmt = $db->prepare("
                SELECT p.*, 
                       COUNT(pt.track_id) AS track_count, 
                       COALESCE(SUM(t.duration), 0) AS total_duration,
                       (SELECT a.art_path FROM playlist_tracks pt2 
                        JOIN tracks t2 ON pt2.track_id = t2.id 
                        JOIN albums a ON t2.album_id = a.id 
                        WHERE pt2.playlist_id = p.id AND a.art_path IS NOT NULL LIMIT 1) AS art_path
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
                LEFT JOIN tracks t ON pt.track_id = t.id
                WHERE p.user_id = 1
                GROUP BY p.id, p.name, p.is_public, p.created_at
                ORDER BY p.created_at DESC
            ");
            $stmt->execute();
            echo json_encode($stmt->fetchAll());
            break;

        case 'playlist':
            $playlist_id = (int)($_GET['playlist_id'] ?? 0);
            $stmt = $db->prepare("SELECT * FROM playlists WHERE id = ? AND user_id = 1");
            $stmt->execute([$playlist_id]);
            $playlist = $stmt->fetch();
            if (!$playlist) {
                http_response_code(404);
                echo json_encode(['error' => 'Playlist not found']);
                break;
            }

            $stmtTracks = $db->prepare("
                SELECT t.*, a.title AS album, a.art_path AS album_art, ar.name AS artist, l.id AS lyric_id, l.is_synced,
                       (CASE WHEN f.track_id IS NOT NULL THEN 1 ELSE 0 END) AS is_favorite
                FROM playlist_tracks pt
                JOIN tracks t ON pt.track_id = t.id
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON a.artist_id = ar.id
                LEFT JOIN lyrics l ON t.id = l.track_id
                LEFT JOIN favorites f ON t.id = f.track_id AND f.user_id = 1
                WHERE pt.playlist_id = ?
                ORDER BY pt.position ASC, pt.rowid ASC
            ");
            $stmtTracks->execute([$playlist_id]);
            $playlist['tracks'] = $stmtTracks->fetchAll();
            echo json_encode($playlist);
            break;

        case 'create_playlist':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'POST required']);
                break;
            }
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $name = trim($data['name'] ?? 'New Playlist');
            if (empty($name)) $name = 'My Hi-Fi Playlist';

            $stmt = $db->prepare("INSERT INTO playlists (user_id, name) VALUES (1, ?)");
            $stmt->execute([$name]);
            $newId = $db->lastInsertId();
            echo json_encode(['success' => true, 'id' => (int)$newId, 'name' => $name]);
            break;

        case 'delete_playlist':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'POST required']);
                break;
            }
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $playlist_id = (int)($data['playlist_id'] ?? 0);

            $stmt = $db->prepare("DELETE FROM playlists WHERE id = ? AND user_id = 1");
            $stmt->execute([$playlist_id]);
            echo json_encode(['success' => true]);
            break;

        case 'add_to_playlist':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'POST required']);
                break;
            }
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $playlist_id = (int)($data['playlist_id'] ?? 0);
            $track_id = (int)($data['track_id'] ?? 0);

            if ($playlist_id <= 0 || $track_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Valid playlist_id and track_id required']);
                break;
            }

            // Get current max position
            $stmtPos = $db->prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM playlist_tracks WHERE playlist_id = ?");
            $stmtPos->execute([$playlist_id]);
            $nextPos = (int)($stmtPos->fetch()['next_pos'] ?? 1);

            $stmt = $db->prepare("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)");
            $stmt->execute([$playlist_id, $track_id, $nextPos]);
            echo json_encode(['success' => true]);
            break;

        case 'remove_from_playlist':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'POST required']);
                break;
            }
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $playlist_id = (int)($data['playlist_id'] ?? 0);
            $track_id = (int)($data['track_id'] ?? 0);

            $stmt = $db->prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?");
            $stmt->execute([$playlist_id, $track_id]);
            echo json_encode(['success' => true]);
            break;

        /* ============================================================
           FAVORITES API
           ============================================================ */
        case 'favorites':
            $stmt = $db->prepare("
                SELECT t.*, a.title AS album, a.art_path AS album_art, ar.name AS artist, l.id AS lyric_id, l.is_synced, 1 AS is_favorite
                FROM favorites f
                JOIN tracks t ON f.track_id = t.id
                JOIN albums a ON t.album_id = a.id
                JOIN artists ar ON a.artist_id = ar.id
                LEFT JOIN lyrics l ON t.id = l.track_id
                WHERE f.user_id = 1
                ORDER BY f.created_at DESC
            ");
            $stmt->execute();
            echo json_encode($stmt->fetchAll());
            break;

        case 'save_lyrics':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'POST required']);
                break;
            }
            $data = json_decode(file_get_contents('php://input'), true) ?: $_POST;
            $track_id = (int)($data['track_id'] ?? 0);
            $lrc_text = trim($data['lrc_text'] ?? '');
            $is_synced = (int)($data['is_synced'] ?? 0);

            if ($track_id <= 0 || empty($lrc_text)) {
                http_response_code(400);
                echo json_encode(['error' => 'Valid track_id and lrc_text required']);
                break;
            }

            // Upsert lyrics
            $stmtCheck = $db->prepare("SELECT id FROM lyrics WHERE track_id = ?");
            $stmtCheck->execute([$track_id]);
            if ($stmtCheck->fetch()) {
                $stmtUp = $db->prepare("UPDATE lyrics SET lrc_text = ?, is_synced = ? WHERE track_id = ?");
                $stmtUp->execute([$lrc_text, $is_synced, $track_id]);
            } else {
                $stmtIns = $db->prepare("INSERT INTO lyrics (track_id, lrc_text, is_synced) VALUES (?, ?, ?)");
                $stmtIns->execute([$track_id, $lrc_text, $is_synced]);
            }
            echo json_encode(['success' => true]);
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

function serveArtwork() {
    require_once __DIR__ . '/../includes/metadata.php';
    $album_id = (int)($_GET['album_id'] ?? 0);
    $track_id = (int)($_GET['track_id'] ?? 0);
    $db = get_db();
    $art_path = null;
    $sampleFile = null;

    if ($track_id > 0) {
        $stmt = $db->prepare("SELECT a.id AS album_id, a.art_path, t.file_path FROM tracks t JOIN albums a ON t.album_id = a.id WHERE t.id = ?");
        $stmt->execute([$track_id]);
        $row = $stmt->fetch();
        if ($row) {
            $art_path = $row['art_path'];
            $sampleFile = $row['file_path'];
            if (!$album_id) $album_id = $row['album_id'];
        }
    }

    if (!$art_path && $album_id > 0) {
        $stmt = $db->prepare("SELECT a.art_path, (SELECT file_path FROM tracks WHERE album_id = a.id LIMIT 1) AS sample_file FROM albums a WHERE a.id = ?");
        $stmt->execute([$album_id]);
        $row = $stmt->fetch();
        if ($row) {
            $art_path = $row['art_path'] ?? null;
            if (!$sampleFile) $sampleFile = $row['sample_file'] ?? null;
        }
    }

    // If art path exists on disk and is readable, serve it directly
    if ($art_path && file_exists($art_path) && filesize($art_path) > 0) {
        $ext = strtolower(pathinfo($art_path, PATHINFO_EXTENSION));
        $mime = ($ext === 'png') ? 'image/png' : 'image/jpeg';
        header("Content-Type: $mime");
        header('Cache-Control: public, max-age=86400');
        readfile($art_path);
        exit;
    }

    // On-demand extraction from audio file if missing
    if ($sampleFile && file_exists($sampleFile)) {
        // 1. Check directory for cover images
        $dir = dirname($sampleFile);
        foreach (['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'artwork.jpg', 'album.jpg'] as $c) {
            $cand = $dir . DIRECTORY_SEPARATOR . $c;
            if (file_exists($cand) && filesize($cand) > 0) {
                if ($album_id > 0) {
                    $stmtUp = $db->prepare("UPDATE albums SET art_path = ? WHERE id = ?");
                    $stmtUp->execute([$cand, $album_id]);
                }
                $ext = strtolower(pathinfo($cand, PATHINFO_EXTENSION));
                header("Content-Type: " . (($ext === 'png') ? 'image/png' : 'image/jpeg'));
                header('Cache-Control: public, max-age=86400');
                readfile($cand);
                exit;
            }
        }

        // 2. Extract embedded artwork via metadata parser
        $meta = AudioMetadata::analyze($sampleFile);
        if (!empty($meta['art_path']) && file_exists($meta['art_path']) && filesize($meta['art_path']) > 0) {
            if ($album_id > 0) {
                $stmtUp = $db->prepare("UPDATE albums SET art_path = ? WHERE id = ?");
                $stmtUp->execute([$meta['art_path'], $album_id]);
            }
            $ext = strtolower(pathinfo($meta['art_path'], PATHINFO_EXTENSION));
            header("Content-Type: " . (($ext === 'png') ? 'image/png' : 'image/jpeg'));
            header('Cache-Control: public, max-age=86400');
            readfile($meta['art_path']);
            exit;
        }

        // 3. Fallback: FFmpeg extraction
        $cacheDir = is_dir('/data') ? '/data/covers' : sys_get_temp_dir() . '/christos_covers';
        if (!is_dir($cacheDir)) @mkdir($cacheDir, 0777, true);
        $ffmpegCover = $cacheDir . '/ff_' . md5($sampleFile) . '.jpg';
        if (!file_exists($ffmpegCover)) {
            $escaped = escapeshellarg($sampleFile);
            $outEscaped = escapeshellarg($ffmpegCover);
            @exec("ffmpeg -y -i {$escaped} -an -vcodec copy {$outEscaped} 2>/dev/null");
        }
        if (file_exists($ffmpegCover) && filesize($ffmpegCover) > 0) {
            if ($album_id > 0) {
                $stmtUp = $db->prepare("UPDATE albums SET art_path = ? WHERE id = ?");
                $stmtUp->execute([$ffmpegCover, $album_id]);
            }
            header("Content-Type: image/jpeg");
            header('Cache-Control: public, max-age=86400');
            readfile($ffmpegCover);
            exit;
        }
    }

    // Sleek Audiophile Vinyl Disc SVG (Full Bleed, No Star)
    echo '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><radialGradient id="discShine" cx="50%" cy="50%" r="50%" fx="30%" fy="30%"><stop offset="0%" stop-color="#242634"/><stop offset="40%" stop-color="#12131a"/><stop offset="70%" stop-color="#181a24"/><stop offset="100%" stop-color="#0a0a0f"/></radialGradient><radialGradient id="centerHub" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fa233b"/><stop offset="70%" stop-color="#b81024"/><stop offset="100%" stop-color="#800a18"/></radialGradient></defs><rect width="512" height="512" fill="#0d0e14" rx="28"/><circle cx="256" cy="256" r="230" fill="url(#discShine)" stroke="rgba(255,255,255,0.06)" stroke-width="2"/><circle cx="256" cy="256" r="215" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1.5"/><circle cx="256" cy="256" r="200" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/><circle cx="256" cy="256" r="185" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1.5"/><circle cx="256" cy="256" r="170" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/><circle cx="256" cy="256" r="155" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1.5"/><circle cx="256" cy="256" r="140" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/><circle cx="256" cy="256" r="125" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1.5"/><circle cx="256" cy="256" r="110" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/><circle cx="256" cy="256" r="92" fill="#14151f" stroke="rgba(255,255,255,0.12)" stroke-width="2"/><circle cx="256" cy="256" r="88" fill="url(#centerHub)" opacity="0.95"/><circle cx="256" cy="256" r="46" fill="#0d0e14" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/><rect x="232" y="244" width="4" height="24" rx="2" fill="#ffffff"/><rect x="240" y="236" width="4" height="40" rx="2" fill="#ffffff"/><rect x="248" y="228" width="4" height="56" rx="2" fill="#ffffff"/><rect x="256" y="220" width="4" height="72" rx="2" fill="#ffffff"/><rect x="264" y="228" width="4" height="56" rx="2" fill="#ffffff"/><rect x="272" y="236" width="4" height="40" rx="2" fill="#ffffff"/><rect x="280" y="244" width="4" height="24" rx="2" fill="#ffffff"/><circle cx="256" cy="256" r="10" fill="#050608" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/></svg>';
    exit;
}
?>
