<?php
require_once __DIR__ . '/../includes/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Range, Content-Type, Authorization, X-Requested-With');
header('Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? 'list';

if ($action === 'stream') {
    streamVideo();
    exit;
}

if ($action === 'subtitle') {
    serveSubtitle();
    exit;
}

if ($action === 'poster') {
    serveMoviePoster();
    exit;
}

header('Content-Type: application/json; charset=utf-8');

$cacheFile = (is_dir('/data') ? '/data/movies_cache.json' : sys_get_temp_dir() . '/movies_cache.json');

function getMoviesCache() {
    global $cacheFile;
    if (file_exists($cacheFile)) {
        $data = json_decode(file_get_contents($cacheFile), true);
        if (is_array($data)) return $data;
    }
    return [];
}

function saveMoviesCache($cache) {
    global $cacheFile;
    file_put_contents($cacheFile, json_encode($cache, JSON_PRETTY_PRINT));
}

function getMoviesDir() {
    $path = defined('MOVIES_PATH') ? MOVIES_PATH : '/mnt/DISK_MAC/thecus/LL/disk/media';
    if (!file_exists($path)) {
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            $win = 'C:/Users/CHRISTOPHER/Downloads';
            if (file_exists($win)) return $win;
        }
    }
    return $path;
}

function parseMovieFilename($filename) {
    $raw = pathinfo($filename, PATHINFO_FILENAME);
    
    // Remove unwanted release groups and tags
    $clean = preg_replace('/[\[\(]?(1080p|2160p|4k|720p|uhd|bluray|web-dl|webrip|hdr|atmos|dts|x264|x265|hevc|h264|h265|yts|yify|aac|ddp|telesync|dual-lat|cinecalidad).*$/i', '', $raw);
    
    // Extract year if present
    $year = null;
    if (preg_match('/\b(19\d{2}|20\d{2})\b/', $raw, $matches)) {
        $year = (int)$matches[1];
        $clean = preg_replace('/\b(19\d{2}|20\d{2})\b.*$/', '', $clean);
    }

    // Clean up punctuation and dots
    $title = trim(str_replace(['.', '_', '-'], ' ', $clean));
    $title = preg_replace('/\s+/', ' ', $title);
    if (empty($title)) $title = $raw;

    // Detect resolution & audio quality badges
    $quality = 'HD';
    if (stripos($raw, '2160p') !== false || stripos($raw, '4k') !== false || stripos($raw, 'uhd') !== false) {
        $quality = '4K UHD';
    } else if (stripos($raw, '1080p') !== false) {
        $quality = '1080p FHD';
    } else if (stripos($raw, '720p') !== false) {
        $quality = '720p HD';
    }

    $hdr = '';
    if (stripos($raw, 'hdr') !== false || stripos($raw, 'dv') !== false || stripos($raw, 'dovi') !== false) {
        $hdr = 'HDR';
    }

    $audio = '';
    if (stripos($raw, 'atmos') !== false) $audio = 'Dolby Atmos';
    else if (stripos($raw, 'ddp5.1') !== false || stripos($raw, '5.1') !== false) $audio = '5.1 Surround';
    else if (stripos($raw, '7.1') !== false) $audio = '7.1 Surround';

    return [
        'title' => ucwords($title),
        'year' => $year,
        'quality' => $quality,
        'hdr' => $hdr,
        'audio' => $audio
    ];
}

try {
    switch ($action) {
        case 'list':
            $dir = getMoviesDir();
            if (!is_dir($dir)) {
                echo json_encode([]);
                break;
            }

            $cache = getMoviesCache();
            $movies = [];

            $rii = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );

            $idCounter = 1;
            foreach ($rii as $file) {
                if ($file->isFile()) {
                    $ext = strtolower($file->getExtension());
                    if (in_array($ext, ['mkv', 'mp4', 'avi', 'mov', 'webm'])) {
                        $filePath = $file->getPathname();
                        $fileSize = $file->getSize();
                        
                        // Ignore tiny sample or extra videos (< 100MB)
                        if ($fileSize < 100 * 1024 * 1024) continue;

                        $filename = $file->getFilename();
                        $parsed = parseMovieFilename($filename);
                        $cacheKey = md5($filePath);

                        // Discover subtitles
                        $subtitles = [];
                        $parentDir = dirname($filePath);
                        
                        $subDirs = [$parentDir, $parentDir . '/Subs', $parentDir . '/subs', $parentDir . '/Subtitles'];
                        foreach ($subDirs as $sd) {
                            if (is_dir($sd)) {
                                foreach (scandir($sd) as $subFile) {
                                    $subExt = strtolower(pathinfo($subFile, PATHINFO_EXTENSION));
                                    if (in_array($subExt, ['srt', 'vtt'])) {
                                        $subPath = $sd . DIRECTORY_SEPARATOR . $subFile;
                                        $lang = 'Default';
                                        if (stripos($subFile, 'spa') !== false || stripos($subFile, 'lat') !== false || stripos($subFile, 'es') !== false) {
                                            $lang = 'Spanish';
                                        } else if (stripos($subFile, 'eng') !== false || stripos($subFile, 'en') !== false) {
                                            $lang = 'English';
                                        }
                                        $subtitles[] = [
                                            'name' => pathinfo($subFile, PATHINFO_FILENAME),
                                            'lang' => $lang,
                                            'path' => $subPath,
                                            'url' => "/api/movies.php?action=subtitle&file=" . urlencode($subPath)
                                        ];
                                    }
                                }
                            }
                        }

                        $movies[] = [
                            'id' => $idCounter++,
                            'title' => $parsed['title'],
                            'year' => $parsed['year'],
                            'filename' => $filename,
                            'file_path' => $filePath,
                            'size' => $fileSize,
                            'formatted_size' => round($fileSize / (1024 * 1024 * 1024), 2) . ' GB',
                            'format' => strtoupper($ext),
                            'quality' => $parsed['quality'],
                            'hdr' => $parsed['hdr'],
                            'poster' => "/api/movies.php?action=poster&file=" . urlencode($filePath),
                            'overview' => 'TrueNAS Cinema Hi-Fi Stream',
                            'rating' => '8.5',
                            'subtitles' => $subtitles,
                            'stream_url' => "/api/movies.php?action=stream&file=" . urlencode($filePath)
                        ];
                    }
                }
            }

            // Sort by title
            usort($movies, function($a, $b) {
                return strcasecmp($a['title'], $b['title']);
            });

            echo json_encode($movies);
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

function streamVideo() {
    $file = $_GET['file'] ?? '';
    $moviesDir = realpath(getMoviesDir());
    $realFile = realpath($file);
    if (empty($file) || !$realFile || !$moviesDir || (strpos($realFile, $moviesDir . DIRECTORY_SEPARATOR) !== 0 && $realFile !== $moviesDir) || !file_exists($realFile)) {
        http_response_code(404);
        die("Video file not found or access denied.");
    }
    $file = $realFile;
    set_time_limit(0);

    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $mimes = [
        'mp4' => 'video/mp4',
        'mkv' => 'video/x-matroska',
        'webm' => 'video/webm',
        'avi' => 'video/x-msvideo',
        'mov' => 'video/quicktime'
    ];
    $mime = $mimes[$ext] ?? 'video/mp4';

    $size = filesize($file);
    $start = 0;
    $end = $size - 1;
    $isRange = false;

    if (isset($_SERVER['HTTP_RANGE'])) {
        if (preg_match('/bytes=\s*(\d+)-(\d*)[\D.*]?/i', $_SERVER['HTTP_RANGE'], $matches)) {
            $start = (int)$matches[1];
            if (!empty($matches[2])) {
                $end = (int)$matches[2];
            }
            if ($start > $end || $start >= $size || $end >= $size) {
                http_response_code(416);
                header("Content-Range: bytes */$size");
                exit;
            }
            $isRange = true;
        }
    }

    $length = ($end - $start) + 1;

    if ($isRange) {
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    } else {
        http_response_code(200);
    }

    header("Content-Type: $mime");
    header("Accept-Ranges: bytes");
    header("Content-Length: $length");
    header('Content-Disposition: inline; filename="' . rawurlencode(basename($file)) . '"');
    header("Cache-Control: public, max-age=86400");

    while (ob_get_level() > 0) ob_end_clean();

    $fp = fopen($file, 'rb');
    if (!$fp) {
        http_response_code(500);
        exit;
    }

    if ($start > 0) {
        fseek($fp, $start);
    }

    $bytesRemaining = $length;
    $bufferSize = 256 * 1024;

    while ($bytesRemaining > 0 && !feof($fp) && !connection_aborted()) {
        $bytesToRead = min($bufferSize, $bytesRemaining);
        $data = fread($fp, $bytesToRead);
        if ($data === false) break;
        echo $data;
        flush();
        $bytesRemaining -= strlen($data);
    }

    fclose($fp);
    exit;
}

function serveSubtitle() {
    $file = $_GET['file'] ?? '';
    $moviesDir = realpath(getMoviesDir());
    $realFile = realpath($file);
    if (empty($file) || !$realFile || !$moviesDir || (strpos($realFile, $moviesDir . DIRECTORY_SEPARATOR) !== 0 && $realFile !== $moviesDir) || !file_exists($realFile)) {
        http_response_code(404);
        die("Subtitle not found or access denied.");
    }
    $file = $realFile;

    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $content = file_get_contents($file);

    header('Content-Type: text/vtt; charset=utf-8');
    header('Access-Control-Allow-Origin: *');

    if ($ext === 'vtt') {
        echo $content;
        exit;
    }

    echo "WEBVTT\n\n";
    $vtt = preg_replace('/(\d{2}:\d{2}:\d{2}),(\d{3})/', '$1.$2', $content);
    echo $vtt;
    exit;
}

function serveMoviePoster() {
    $file = $_GET['file'] ?? '';
    $moviesDir = realpath(getMoviesDir());
    $realFile = realpath($file);
    if (empty($file) || !$realFile || !$moviesDir || (strpos($realFile, $moviesDir . DIRECTORY_SEPARATOR) !== 0 && $realFile !== $moviesDir) || !file_exists($realFile)) {
        return serveDefaultMoviePoster();
    }
    $file = $realFile;

    $parentDir = dirname($file);
    // 1. Look for folder/poster images
    foreach (['poster.jpg', 'poster.png', 'cover.jpg', 'cover.png', 'folder.jpg', 'folder.png'] as $c) {
        $cand = $parentDir . DIRECTORY_SEPARATOR . $c;
        if (file_exists($cand) && filesize($cand) > 0) {
            $ext = strtolower(pathinfo($cand, PATHINFO_EXTENSION));
            header("Content-Type: " . (($ext === 'png') ? 'image/png' : 'image/jpeg'));
            header('Cache-Control: public, max-age=86400');
            readfile($cand);
            exit;
        }
    }

    // 2. Generate video snapshot via FFmpeg
    $cacheDir = is_dir('/data') ? '/data/movie_posters' : sys_get_temp_dir() . '/movie_posters';
    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0777, true);
    $cachePath = $cacheDir . '/thumb_' . md5($file) . '.jpg';

    if (file_exists($cachePath) && filesize($cachePath) > 0) {
        header("Content-Type: image/jpeg");
        header('Cache-Control: public, max-age=86400');
        readfile($cachePath);
        exit;
    }

    // Find FFmpeg
    $ffmpeg = '/usr/bin/ffmpeg';
    if (file_exists($ffmpeg) || is_executable($ffmpeg)) {
        // Grab a crisp snapshot frame at 00:03:00
        $cmd = escapeshellarg($ffmpeg) . " -ss 00:03:00 -i " . escapeshellarg($file) . " -vframes 1 -q:v 2 -vf \"scale=480:-1\" " . escapeshellarg($cachePath) . " 2>&1";
        @exec($cmd);

        if (file_exists($cachePath) && filesize($cachePath) > 0) {
            header("Content-Type: image/jpeg");
            header('Cache-Control: public, max-age=86400');
            readfile($cachePath);
            exit;
        }
    }

    serveDefaultMoviePoster();
}

function serveDefaultMoviePoster() {
    header('Content-Type: image/svg+xml');
    echo '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="#141420"/><rect x="30" y="30" width="240" height="390" rx="12" fill="none" stroke="#222238" stroke-width="2"/><polygon points="130,200 130,250 180,225" fill="#fa233b"/><text x="150" y="290" fill="#888899" font-size="18" font-family="sans-serif" text-anchor="middle" font-weight="bold">CINEMA</text></svg>';
    exit;
}