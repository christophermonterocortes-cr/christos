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

$action = $_GET['action'] ?? 'series';

if ($action === 'stream') {
    streamTvVideo();
    exit;
}

if ($action === 'subtitle') {
    serveTvSubtitle();
    exit;
}

if ($action === 'poster') {
    serveTvPoster();
    exit;
}

header('Content-Type: application/json; charset=utf-8');

function getTvShowsDir() {
    $path = defined('TV_SHOWS_PATH') ? TV_SHOWS_PATH : '/mnt/DISK_MAC/thecus/LL/disk/Series(TVshows)';
    if (!file_exists($path)) {
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            $win = 'C:/Users/CHRISTOPHER/Downloads';
            if (file_exists($win)) return $win;
        }
    }
    return $path;
}

function parseEpisodeInfo($filename) {
    $raw = pathinfo($filename, PATHINFO_FILENAME);
    $season = 1;
    $episode = 1;
    $title = $raw;

    // Pattern: S01E05 or s1e5
    if (preg_match('/[sS](\d{1,2})[eE](\d{1,3})/i', $raw, $m)) {
        $season = (int)$m[1];
        $episode = (int)$m[2];
        $title = preg_replace('/^.*[sS]\d{1,2}[eE]\d{1,3}[\s._-]*/i', '', $raw);
    } 
    // Pattern: 1x05
    else if (preg_match('/(\d{1,2})x(\d{1,3})/i', $raw, $m)) {
        $season = (int)$m[1];
        $episode = (int)$m[2];
        $title = preg_replace('/^.*\d{1,2}x\d{1,3}[\s._-]*/i', '', $raw);
    }
    // Pattern: Episode 05 or E05
    else if (preg_match('/(?:Episode|Capitulo|Cap|Ep|E)[\s._-]*(\d{1,3})/i', $raw, $m)) {
        $episode = (int)$m[1];
        $title = preg_replace('/^.*(?:Episode|Capitulo|Cap|Ep|E)[\s._-]*\d{1,3}[\s._-]*/i', '', $raw);
    }

    // Clean up release tags
    $clean = preg_replace('/[\[\(]?(1080p|2160p|4k|720p|uhd|bluray|web-dl|webrip|hdr|atmos|dts|x264|x265|hevc|h264|h265|yts|yify|aac|ddp|dual-lat).*$/i', '', $title);
    $cleanTitle = trim(str_replace(['.', '_', '-'], ' ', $clean));
    $cleanTitle = preg_replace('/\s+/', ' ', $cleanTitle);
    if (empty($cleanTitle)) $cleanTitle = "Episode {$episode}";

    // Resolution quality
    $quality = 'HD';
    if (stripos($raw, '2160p') !== false || stripos($raw, '4k') !== false) $quality = '4K UHD';
    else if (stripos($raw, '1080p') !== false) $quality = '1080p FHD';
    else if (stripos($raw, '720p') !== false) $quality = '720p HD';

    return [
        'season' => $season,
        'episode' => $episode,
        'title' => ucwords($cleanTitle),
        'quality' => $quality
    ];
}

function cleanTvShowName($raw) {
    $clean = preg_replace('/(\[.*?\]|\(.*?\))/', ' ', $raw);
    $clean = preg_replace('/(S\d{1,2}|Season\s*\d{1,2}|1080p|2160p|4k|720p|uhd|bluray|web-dl|webrip|hdr|atmos|dts|x264|x265|hevc|ita|eng|latino|dual-lat).*$/i', '', $clean);
    $clean = str_replace(['.', '_', '-'], ' ', $clean);
    $clean = preg_replace('/\s+/', ' ', $clean);
    $title = trim(ucwords(strtolower(trim($clean))));
    return empty($title) ? $raw : $title;
}

function fetchOnlineTvMetadata($showName) {
    // 1. Try TVMaze API
    $q = urlencode($showName);
    $url = "https://api.tvmaze.com/singlesearch/shows?q={$q}";
    $ctx = stream_context_create(['http' => ['timeout' => 3, 'header' => "User-Agent: Mozilla/5.0\r\n"]]);
    $res = @file_get_contents($url, false, $ctx);
    if ($res) {
        $data = json_decode($res, true);
        if (!empty($data['image'])) {
            $img = $data['image']['original'] ?? $data['image']['medium'] ?? null;
            if ($img) {
                return [
                    'title' => $data['name'] ?? $showName,
                    'poster' => $img,
                    'rating' => !empty($data['rating']['average']) ? round($data['rating']['average'], 1) : '8.8',
                    'overview' => strip_tags($data['summary'] ?? '')
                ];
            }
        }
    }

    // 2. Try TMDB TV API
    $keys = [
        "b1523c14d9b4b0e408d66dc8ef0f0c05",
        "4e44d9029b1270a757cddc766a1bcb63"
    ];
    foreach ($keys as $k) {
        $url = "https://api.themoviedb.org/3/search/tv?api_key={$k}&query={$q}";
        $res2 = @file_get_contents($url, false, $ctx);
        if ($res2) {
            $d2 = json_decode($res2, true);
            if (!empty($d2['results'][0]['poster_path'])) {
                return [
                    'title' => $d2['results'][0]['name'] ?? $showName,
                    'poster' => "https://image.tmdb.org/t/p/w780" . $d2['results'][0]['poster_path'],
                    'rating' => !empty($d2['results'][0]['vote_average']) ? round($d2['results'][0]['vote_average'], 1) : '8.8',
                    'overview' => $d2['results'][0]['overview'] ?? ''
                ];
            }
        }
    }
    return null;
}

try {
    switch ($action) {
        case 'series':
            $dir = getTvShowsDir();
            if (!is_dir($dir)) {
                echo json_encode([]);
                break;
            }

            $seriesList = [];
            $rii = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );

            // Group episodes by Series Name
            $shows = [];
            foreach ($rii as $file) {
                if ($file->isFile()) {
                    $ext = strtolower($file->getExtension());
                    if (in_array($ext, ['mkv', 'mp4', 'avi', 'mov', 'webm'])) {
                        $fileSize = $file->getSize();
                        if ($fileSize < 50 * 1024 * 1024) continue; // Skip sample files < 50MB

                        $filePath = $file->getPathname();
                        $rel = ltrim(str_replace($dir, '', $filePath), '/\\');
                        $parts = explode(DIRECTORY_SEPARATOR, $rel);

                        // Series Name is top folder or second folder
                        $showName = $parts[0];
                        if (stripos($showName, 'Season') !== false && count($parts) > 1) {
                            $showName = pathinfo($filePath, PATHINFO_FILENAME);
                        }

                        if (!isset($shows[$showName])) {
                            $cleanTitle = cleanTvShowName($showName);
                            $online = fetchOnlineTvMetadata($cleanTitle);
                            $shows[$showName] = [
                                'name' => $online['title'] ?? $cleanTitle,
                                'folder' => $showName,
                                'episodes' => [],
                                'seasons' => [],
                                'sample_file' => $filePath,
                                'total_size' => 0,
                                'poster' => !empty($online['poster']) ? $online['poster'] : ("/api/tvshows.php?action=poster&file=" . urlencode($filePath)),
                                'rating' => $online['rating'] ?? '8.8'
                            ];
                        }

                        $parsed = parseEpisodeInfo($file->getFilename());
                        $shows[$showName]['episodes'][] = $filePath;
                        $shows[$showName]['seasons'][$parsed['season']] = true;
                        $shows[$showName]['total_size'] += $fileSize;
                    }
                }
            }

            $idCount = 1;
            foreach ($shows as $folder => $info) {
                $seriesList[] = [
                    'id' => $idCount++,
                    'title' => $info['name'],
                    'folder' => $folder,
                    'season_count' => count($info['seasons']),
                    'episode_count' => count($info['episodes']),
                    'formatted_size' => round($info['total_size'] / (1024 * 1024 * 1024), 2) . ' GB',
                    'poster' => $info['poster'],
                    'rating' => $info['rating']
                ];
            }

            usort($seriesList, function($a, $b) {
                return strcasecmp($a['title'], $b['title']);
            });

            echo json_encode($seriesList);
            break;

        case 'episodes':
            $folder = $_GET['series'] ?? '';
            $dir = getTvShowsDir();
            $targetDir = $dir . DIRECTORY_SEPARATOR . $folder;
            if (!is_dir($targetDir)) $targetDir = $dir;

            $episodes = [];
            $rii = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($targetDir, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );

            $idCounter = 1;
            foreach ($rii as $file) {
                if ($file->isFile()) {
                    $ext = strtolower($file->getExtension());
                    if (in_array($ext, ['mkv', 'mp4', 'avi', 'mov', 'webm'])) {
                        $filePath = $file->getPathname();
                        $fileSize = $file->getSize();
                        if ($fileSize < 50 * 1024 * 1024) continue;

                        $filename = $file->getFilename();
                        $parsed = parseEpisodeInfo($filename);

                        // Discover Subtitles
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
                                        if (stripos($subFile, 'spa') !== false || stripos($subFile, 'lat') !== false) $lang = 'Spanish';
                                        else if (stripos($subFile, 'eng') !== false) $lang = 'English';
                                        $subtitles[] = [
                                            'name' => pathinfo($subFile, PATHINFO_FILENAME),
                                            'lang' => $lang,
                                            'url' => "/api/tvshows.php?action=subtitle&file=" . urlencode($subPath)
                                        ];
                                    }
                                }
                            }
                        }

                        $episodes[] = [
                            'id' => $idCounter++,
                            'season' => $parsed['season'],
                            'episode' => $parsed['episode'],
                            'title' => $parsed['title'],
                            'filename' => $filename,
                            'file_path' => $filePath,
                            'size' => $fileSize,
                            'formatted_size' => round($fileSize / (1024 * 1024 * 1024), 2) . ' GB',
                            'quality' => $parsed['quality'],
                            'poster' => "/api/tvshows.php?action=poster&file=" . urlencode($filePath),
                            'subtitles' => $subtitles,
                            'stream_url' => "/api/tvshows.php?action=stream&file=" . urlencode($filePath)
                        ];
                    }
                }
            }

            usort($episodes, function($a, $b) {
                if ($a['season'] === $b['season']) {
                    return $a['episode'] <=> $b['episode'];
                }
                return $a['season'] <=> $b['season'];
            });

            echo json_encode($episodes);
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

function streamTvVideo() {
    $file = $_GET['file'] ?? '';
    $tvDir = realpath(getTvShowsDir());
    $realFile = realpath($file);
    if (empty($file) || !$realFile || !$tvDir || (strpos($realFile, $tvDir . DIRECTORY_SEPARATOR) !== 0 && $realFile !== $tvDir) || !file_exists($realFile)) {
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
            if (!empty($matches[2])) $end = (int)$matches[2];
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

    if ($start > 0) fseek($fp, $start);
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

function serveTvSubtitle() {
    $file = $_GET['file'] ?? '';
    $tvDir = realpath(getTvShowsDir());
    $realFile = realpath($file);
    if (empty($file) || !$realFile || !$tvDir || (strpos($realFile, $tvDir . DIRECTORY_SEPARATOR) !== 0 && $realFile !== $tvDir) || !file_exists($realFile)) {
        http_response_code(404);
        die("Subtitle not found or access denied.");
    }
    $file = $realFile;
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $content = file_get_contents($file);
    header('Content-Type: text/vtt; charset=utf-8');
    if ($ext === 'vtt') {
        echo $content;
        exit;
    }
    echo "WEBVTT\n\n" . preg_replace('/(\d{2}:\d{2}:\d{2}),(\d{3})/', '$1.$2', $content);
    exit;
}

function serveTvPoster() {
    $file = $_GET['file'] ?? '';
    $tvDir = realpath(getTvShowsDir());
    $realFile = realpath($file);
    if (empty($file) || !$realFile || !$tvDir || (strpos($realFile, $tvDir . DIRECTORY_SEPARATOR) !== 0 && $realFile !== $tvDir) || !file_exists($realFile)) {
        return serveDefaultTvPoster();
    }
    $file = $realFile;

    $cacheDir = is_dir('/data') ? '/data/tv_posters' : sys_get_temp_dir() . '/tv_posters';
    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0777, true);
    $cachePath = $cacheDir . '/thumb_' . md5($file) . '.jpg';

    if (file_exists($cachePath) && filesize($cachePath) > 0) {
        header("Content-Type: image/jpeg");
        header('Cache-Control: public, max-age=86400');
        readfile($cachePath);
        exit;
    }

    $ffmpeg = '/usr/bin/ffmpeg';
    if (file_exists($ffmpeg) || is_executable($ffmpeg)) {
        $cmd = escapeshellarg($ffmpeg) . " -ss 00:02:30 -i " . escapeshellarg($file) . " -vframes 1 -q:v 2 -vf 'scale=480:-1' " . escapeshellarg($cachePath) . " 2>&1";
        @exec($cmd);

        if (file_exists($cachePath) && filesize($cachePath) > 0) {
            header("Content-Type: image/jpeg");
            header('Cache-Control: public, max-age=86400');
            readfile($cachePath);
            exit;
        }
    }

    serveDefaultTvPoster();
}

function serveDefaultTvPoster() {
    header('Content-Type: image/svg+xml');
    echo '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="#181828"/><rect x="25" y="25" width="250" height="400" rx="10" fill="none" stroke="#2a2a3e" stroke-width="2"/><polygon points="135,210 135,255 175,232" fill="#20bf6b"/><text x="150" y="290" fill="#8888aa" font-size="18" font-family="sans-serif" text-anchor="middle" font-weight="bold">TV SERIES</text></svg>';
    exit;
}
?>