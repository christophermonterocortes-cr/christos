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

function httpGetJson($url) {
    $opts = [
        'http' => [
            'method' => 'GET',
            'header' => "User-Agent: CHRISTOS-HiFi-MediaServer/2.0 ( https://github.com/christos )
Accept: application/json
",
            'timeout' => 8
        ]
    ];
    $ctx = stream_context_create($opts);
    $res = @file_get_contents($url, false, $ctx);
    if (!$res) return null;
    return json_decode($res, true);
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
