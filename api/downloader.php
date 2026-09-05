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