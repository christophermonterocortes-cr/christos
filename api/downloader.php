<?php
require_once __DIR__ . '/../includes/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? 'status';
$statusFile = is_dir('/data') ? '/data/downloader_status.json' : sys_get_temp_dir() . '/downloader_status.json';
$logFile = is_dir('/data') ? '/data/downloader.log' : sys_get_temp_dir() . '/downloader.log';

function getStatus() {
    global $statusFile, $logFile;
    $status = [
        'is_running' => false,
        'url' => '',
        'service' => '',
        'quality' => '24_96',
        'progress' => 0,
        'started_at' => null,
        'logs' => ''
    ];
    if (file_exists($statusFile)) {
        $data = json_decode(file_get_contents($statusFile), true);
        if (is_array($data)) $status = array_merge($status, $data);
    }
    if (file_exists($logFile)) {
        $status['logs'] = file_get_contents($logFile);
    }
    return $status;
}

function saveStatus($data) {
    global $statusFile;
    file_put_contents($statusFile, json_encode($data, JSON_PRETTY_PRINT));
}

try {
    switch ($action) {
        case 'status':
            $st = getStatus();
            // Check if process is actually alive
            if ($st['is_running'] && !empty($st['pid'])) {
                $pid = (int)$st['pid'];
                $check = false;
                if (file_exists("/proc/$pid")) $check = true;
                if (!$check) {
                    $st['is_running'] = false;
                    saveStatus($st);
                }
            }
            echo json_encode($st);
            break;

        case 'start':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'Method Not Allowed']);
                break;
            }

            $input = json_decode(file_get_contents('php://input'), true);
            $url = trim($input['url'] ?? '');
            $service = trim($input['service'] ?? 'auto');
            $quality = trim($input['quality'] ?? '24_96'); // 24_192, 24_96, 16_44, atmos

            if (empty($url)) {
                http_response_code(400);
                echo json_encode(['error' => 'URL is required']);
                break;
            }

            // Auto-detect service if auto
            if ($service === 'auto') {
                if (stripos($url, 'music.apple.com') !== false) $service = 'apple';
                else if (stripos($url, 'tidal.com') !== false) $service = 'tidal';
                else if (stripos($url, 'qobuz.com') !== false || stripos($url, 'play.qobuz.com') !== false) $service = 'qobuz';
                else if (stripos($url, 'amazon.com') !== false || stripos($url, 'music.amazon') !== false) $service = 'amazon';
                else $service = 'apple';
            }

            $targetDir = defined('UNIVERSAL_DOWNLOADS_PATH') ? UNIVERSAL_DOWNLOADS_PATH : '/mnt/DISK_MAC/everything/universal-downloader';
            if (!is_dir($targetDir)) @mkdir($targetDir, 0777, true);

            // Clean log file
            file_put_contents($logFile, "[UNIVERSAL DOWNLOADER] Starting {$service} lossless download\n[TARGET]: {$targetDir}\n[QUALITY]: {$quality}\n[URL]: {$url}\n\n");

            $filenameTemplate = trim($input['filename_template'] ?? '%(artist,uploader)s/%(album,title)s/%(playlist_index&{:02d} - |)s%(title)s.%(ext)s');
            // Support simple macro syntax like {artist} - {title}
            $customTpl = str_replace(
                ['{artist}', '{title}', '{album}', '{tracknum}', '{year}'],
                ['%(artist,uploader)s', '%(title)s', '%(album)s', '%(playlist_index&{:02d}|)s', '%(release_year,upload_date>%Y)s'],
                $filenameTemplate
            );
            if (substr($customTpl, -6) !== '.%(ext)s' && substr($customTpl, -5) !== '.flac') {
                $customTpl .= '.%(ext)s';
            }

            // Build execution command
            $cmd = "";
            if ($service === 'apple' || stripos($url, 'music.apple.com') !== false) {
                $cmd = "docker run --rm --network host -v " . escapeshellarg($targetDir) . ":/downloads ghcr.io/zhaarey/apple-music-downloader " . escapeshellarg($url);
            } else {
                $ytdlp = file_exists('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : 'yt-dlp';
                $outTemplate = escapeshellarg($targetDir . '/' . ltrim($customTpl, '/'));
                $cmd = "{$ytdlp} --extract-audio --audio-format flac --audio-quality 0 --embed-thumbnail --embed-metadata -o {$outTemplate} " . escapeshellarg($url);
            }

            $bgCmd = "nohup " . $cmd . " >> " . escapeshellarg($logFile) . " 2>&1 & echo $!";
            $pid = (int)trim(shell_exec($bgCmd));

            saveStatus([
                'is_running' => true,
                'pid' => $pid,
                'url' => $url,
                'service' => $service,
                'quality' => $quality,
                'template' => $filenameTemplate,
                'started_at' => time()
            ]);

            echo json_encode([
                'success' => true,
                'message' => 'Download started in background',
                'service' => $service,
                'quality' => $quality,
                'target_directory' => $targetDir,
                'pid' => $pid
            ]);
            break;

        case 'clear':
            file_put_contents($logFile, '');
            saveStatus([
                'is_running' => false,
                'url' => '',
                'service' => '',
                'quality' => '24_96',
                'logs' => ''
            ]);
            echo json_encode(['success' => true]);
            break;

        case 'parse_spotify':
            $rawInput = json_decode(file_get_contents('php://input'), true) ?: $_GET;
            $url = trim($rawInput['url'] ?? '');
            if (empty($url)) {
                http_response_code(400);
                echo json_encode(['error' => 'URL is required']);
                break;
            }

            // Extract type and ID: playlist, album, track
            $type = 'playlist';
            $id = '';
            if (preg_match('#spotify\.com/(playlist|album|track)/([a-zA-Z0-9]+)#', $url, $m)) {
                $type = $m[1];
                $id = $m[2];
            }

            if (empty($id)) {
                http_response_code(400);
                echo json_encode(['error' => 'Could not extract Spotify ID from URL']);
                break;
            }

            $embedUrl = "https://open.spotify.com/embed/{$type}/{$id}";
            $opts = [
                'http' => [
                    'method' => 'GET',
                    'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nAccept-Language: en-US,en;q=0.9\r\n",
                    'timeout' => 12
                ]
            ];
            $context = stream_context_create($opts);
            $html = @file_get_contents($embedUrl, false, $context);

            if (!$html) {
                http_response_code(502);
                echo json_encode(['error' => 'Failed to reach Spotify embed service']);
                break;
            }

            $parsedTracks = [];
            $title = "Spotify " . ucfirst($type);
            $cover = "";

            if (preg_match('#<script id="__NEXT_DATA__" type="application/json">(.*?)</script>#s', $html, $matches)) {
                $jsonData = json_decode($matches[1], true);
                $entity = $jsonData['props']['pageProps']['state']['data']['entity'] ?? [];
                $title = $entity['name'] ?? $title;
                $cover = $entity['coverArt']['sources'][0]['url'] ?? '';

                $rawTrackList = $entity['trackList'] ?? [];
                foreach ($rawTrackList as $t) {
                    $tTitle = $t['title'] ?? '';
                    $tArtist = $t['subtitle'] ?? '';
                    $tDur = (int)(($t['duration'] ?? 0) / 1000);
                    $preview = $t['audioPreview']['url'] ?? '';
                    $uri = $t['uri'] ?? '';

                    if (!empty($tTitle)) {
                        $parsedTracks[] = [
                            'title' => $tTitle,
                            'artist' => $tArtist,
                            'duration' => $tDur,
                            'preview_url' => $preview,
                            'spotify_uri' => $uri
                        ];
                    }
                }
            }

            echo json_encode([
                'success' => true,
                'type' => $type,
                'id' => $id,
                'title' => $title,
                'cover' => $cover,
                'track_count' => count($parsedTracks),
                'tracks' => $parsedTracks
            ]);
            break;

        case 'parse_youtube_playlist':
            $rawInput = json_decode(file_get_contents('php://input'), true) ?: $_GET;
            $url = trim($rawInput['url'] ?? '');
            if (empty($url)) {
                http_response_code(400);
                echo json_encode(['error' => 'URL is required']);
                break;
            }

            $ytdlp = file_exists('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : (file_exists('/usr/bin/yt-dlp') ? '/usr/bin/yt-dlp' : 'yt-dlp');
            $cmd = escapeshellcmd($ytdlp) . " --yes-playlist --no-warnings --flat-playlist --print " . escapeshellarg("%(id)s|||%(title)s|||%(uploader)s|||%(thumbnail)s|||%(duration)s") . " " . escapeshellarg($url);
            $out = shell_exec($cmd);
            $lines = array_filter(explode("\n", trim($out ?? '')));
            $videos = [];
            foreach ($lines as $line) {
                $parts = explode('|||', $line);
                if (count($parts) >= 4) {
                    $videos[] = [
                        'id' => trim($parts[0]),
                        'title' => trim($parts[1]),
                        'artist' => trim($parts[2]),
                        'thumbnail' => trim($parts[3]),
                        'duration' => (int)($parts[4] ?? 0)
                    ];
                }
            }
            echo json_encode([
                'success' => true,
                'track_count' => count($videos),
                'tracks' => $videos
            ]);
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