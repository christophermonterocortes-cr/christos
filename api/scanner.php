<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/metadata.php';

$hasGetId3 = file_exists(__DIR__ . '/../includes/getid3/getid3.php');
if ($hasGetId3) {
    require_once __DIR__ . '/../includes/getid3/getid3.php';
}

$isCli = (php_sapi_name() === 'cli');
$isJson = isset($_GET['format']) && $_GET['format'] === 'json';

if (!$isCli && $isJson) {
    header('Content-Type: application/json');
}

$stats = [
    'scanned' => 0,
    'indexed' => 0,
    'skipped' => 0,
    'errors'  => 0,
    'paths'   => []
];

function logMsg($msg, $isCli) {
    if ($isCli) {
        echo "[SCANNER] " . $msg . "\n";
    }
}

function getLibraryTag($filepath) {
    if (!defined('LIBRARIES')) return 'flac';
    $normF = str_replace('\\', '/', $filepath);
    foreach (LIBRARIES as $libKey => $libInfo) {
        foreach ($libInfo['paths'] as $p) {
            $normP = str_replace('\\', '/', $p);
            if (stripos($normF, $normP) === 0) {
                return $libKey;
            }
        }
    }
    return 'flac';
}

$isForce = (isset($_GET['force']) && $_GET['force'] === '1') || (isset($argv) && in_array('--force', $argv));

function scanDirectory($dir, &$stats, $isCli, $isForce = false) {
    if (!is_dir($dir) || !is_readable($dir)) {
        logMsg("Directory unreachable or unreadable: $dir", $isCli);
        $stats['errors']++;
        return;
    }

    try {
        $rii = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($rii as $file) {
            if ($file->isFile()) {
                $ext = strtolower($file->getExtension());
                if (in_array($ext, ['flac', 'm4a', 'alac', 'aac', 'mp3', 'wav', 'dsd', 'ogg'])) {
                    $stats['scanned']++;
                    processFile($file->getPathname(), $stats, $isCli, $isForce);
                }
            }
        }
    } catch (Exception $e) {
        logMsg("Error scanning $dir: " . $e->getMessage(), $isCli);
        $stats['errors']++;
    }
}

function processFile($filepath, &$stats, $isCli, $isForce = false) {
    global $hasGetId3;
    $db = get_db();
    $libraryTag = getLibraryTag($filepath);
    
    // Check if already indexed
    try {
        $stmt = $db->prepare("SELECT id, album_id, duration, library_tag FROM tracks WHERE file_path = ?");
        $stmt->execute([$filepath]);
        $existing = $stmt->fetch();
        
        $needsUpdate = false;
        if ($existing) {
            if ($isForce || empty($existing['duration']) || (int)$existing['duration'] === 0) {
                $needsUpdate = true;
            } else {
                if ($existing['library_tag'] !== $libraryTag) {
                    $up = $db->prepare("UPDATE tracks SET library_tag = ? WHERE id = ?");
                    $up->execute([$libraryTag, $existing['id']]);
                }
                $stats['skipped']++;
                return;
            }
        }

        $artist = 'Unknown Artist';
        $album = 'Unknown Album';
        $title = pathinfo($filepath, PATHINFO_FILENAME);
        $track_num = 1;
        $duration = 0;
        $bit_depth = 16;
        $sample_rate = 44100;
        $format = strtolower(pathinfo($filepath, PATHINFO_EXTENSION));
        $art_path = null;
        $year = null;

        if ($hasGetId3) {
            static $getID3 = null;
            if (!$getID3) $getID3 = new getID3;
            $info = $getID3->analyze($filepath);

            $artist = $info['tags']['id3v2']['artist'][0] ?? $info['tags']['quicktime']['artist'][0] ?? $info['tags']['vorbiscomment']['artist'][0] ?? 'Unknown Artist';
            $album = $info['tags']['id3v2']['album'][0] ?? $info['tags']['quicktime']['album'][0] ?? $info['tags']['vorbiscomment']['album'][0] ?? 'Unknown Album';
            $title = $info['tags']['id3v2']['title'][0] ?? $info['tags']['quicktime']['title'][0] ?? $info['tags']['vorbiscomment']['title'][0] ?? pathinfo($filepath, PATHINFO_FILENAME);
            $track_num = $info['tags']['id3v2']['track_number'][0] ?? $info['tags']['quicktime']['track_number'][0] ?? 1;
            $duration = (int)($info['playtime_seconds'] ?? 0);
            $bit_depth = $info['audio']['bits_per_sample'] ?? 16;
            $sample_rate = $info['audio']['sample_rate'] ?? 44100;
            $format = $info['audio']['dataformat'] ?? $format;
        } else {
            $meta = AudioMetadata::analyze($filepath);
            $artist = $meta['artist'];
            $album = $meta['album'];
            $title = $meta['title'];
            $track_num = $meta['track_number'];
            $duration = $meta['duration'];
            $bit_depth = $meta['bit_depth'];
            $sample_rate = $meta['sample_rate'];
            $format = $meta['format'];
            $art_path = $meta['art_path'];
            $year = $meta['year'];
        }

        // Folder art discovery fallback
        if (!$art_path) {
            $dir = dirname($filepath);
            foreach (['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png'] as $candidate) {
                $check = $dir . DIRECTORY_SEPARATOR . $candidate;
                if (file_exists($check)) {
                    $art_path = $check;
                    break;
                }
            }
        }

        // Insert or get Artist
        $stmt = $db->prepare("SELECT id, art_path FROM artists WHERE name = ?");
        $stmt->execute([$artist]);
        $artistRow = $stmt->fetch();
        if ($artistRow) {
            $artist_id = $artistRow['id'];
            if (empty($artistRow['art_path']) && $art_path) {
                $up = $db->prepare("UPDATE artists SET art_path = ? WHERE id = ?");
                $up->execute([$art_path, $artist_id]);
            }
        } else {
            $stmt = $db->prepare("INSERT INTO artists (name, art_path) VALUES (?, ?)");
            $stmt->execute([$artist, $art_path]);
            $artist_id = $db->lastInsertId();
        }

        // Insert or get Album
        $stmt = $db->prepare("SELECT id, art_path FROM albums WHERE title = ? AND artist_id = ?");
        $stmt->execute([$album, $artist_id]);
        $albumRow = $stmt->fetch();
        if ($albumRow) {
            $album_id = $albumRow['id'];
            if (empty($albumRow['art_path']) && $art_path) {
                $up = $db->prepare("UPDATE albums SET art_path = ? WHERE id = ?");
                $up->execute([$art_path, $album_id]);
            }
        } else {
            $stmt = $db->prepare("INSERT INTO albums (artist_id, title, year, art_path) VALUES (?, ?, ?, ?)");
            $stmt->execute([$artist_id, $album, $year, $art_path]);
            $album_id = $db->lastInsertId();
        }

        if ($needsUpdate && $existing) {
            $stmt = $db->prepare("UPDATE tracks SET album_id = ?, title = ?, format = ?, bit_depth = ?, sample_rate = ?, duration = ?, track_number = ?, library_tag = ? WHERE id = ?");
            $stmt->execute([$album_id, $title, $format, (int)$bit_depth, (int)$sample_rate, (int)$duration, (int)$track_num, $libraryTag, $existing['id']]);
            $track_id = $existing['id'];
            $stats['indexed']++;
            logMsg("Updated [{$libraryTag}]: $artist - $album - $title ({$duration}s)", $isCli);
        } else {
            // Insert Track with library_tag
            $stmt = $db->prepare("INSERT INTO tracks (album_id, title, file_path, format, bit_depth, sample_rate, duration, track_number, library_tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$album_id, $title, $filepath, $format, (int)$bit_depth, (int)$sample_rate, (int)$duration, (int)$track_num, $libraryTag]);
            $track_id = $db->lastInsertId();
            $stats['indexed']++;
            logMsg("Indexed [{$libraryTag}]: $artist - $album - $title ({$duration}s)", $isCli);
        }
        
        // Look for .lrc lyrics file
        $lrc_path = preg_replace('/\.[^.]+$/', '.lrc', $filepath);
        if (file_exists($lrc_path) && is_readable($lrc_path)) {
            $lrc_content = file_get_contents($lrc_path);
            if ($lrc_content) {
                $is_synced = preg_match('/\[\d{2}:\d{2}\.\d{2,3}\]/', $lrc_content) ? 1 : 0;
                $delStmt = $db->prepare("DELETE FROM lyrics WHERE track_id = ?");
                $delStmt->execute([$track_id]);
                $stmt = $db->prepare("INSERT INTO lyrics (track_id, lrc_text, is_synced) VALUES (?, ?, ?)");
                $stmt->execute([$track_id, $lrc_content, $is_synced]);
            }
        }
    } catch (Exception $e) {
        $stats['errors']++;
        logMsg("Failed to process $filepath: " . $e->getMessage(), $isCli);
    }
}

// Execute scan
foreach (MUSIC_PATHS as $path) {
    if (file_exists($path)) {
        logMsg("Scanning path: $path", $isCli);
        $stats['paths'][] = $path;
        scanDirectory($path, $stats, $isCli, $isForce);
    } else {
        logMsg("Path does not exist: $path", $isCli);
    }
}

if ($isCli) {
    echo "\n=== SCAN SUMMARY ===\n";
    echo "Files Scanned: " . $stats['scanned'] . "\n";
    echo "New Indexed:   " . $stats['indexed'] . "\n";
    echo "Skipped:       " . $stats['skipped'] . "\n";
    echo "Errors:        " . $stats['errors'] . "\n";
    echo "Scan complete.\n";
} else {
    echo json_encode($stats);
}
?>