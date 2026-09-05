<?php
require_once __DIR__ . '/../includes/db.php';

// Enable CORS for Web Audio API AudioContext support
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
header('Access-Control-Allow-Headers: Range, Content-Type, Authorization, X-Requested-With');
header('Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ------------------------------------------------------------
// NOFUFAUDIO ONLINE STREAMING: DIRECT YOUTUBE RESOLVER & SEARCH
// ------------------------------------------------------------
$action = $_GET['action'] ?? '';

if ($action === 'resolve_yt') {
    header('Content-Type: application/json; charset=utf-8');
    $inputUrl = trim($_GET['id'] ?? $_GET['url'] ?? $_GET['video_id'] ?? '');
    $videoId = '';
    if (str_contains($inputUrl, 'youtu.be/')) {
        $parts = explode('youtu.be/', $inputUrl);
        $videoId = explode('?', explode('#', $parts[1] ?? '')[0])[0];
    } elseif (str_contains($inputUrl, 'v=')) {
        parse_str(parse_url($inputUrl, PHP_URL_QUERY) ?? '', $qParams);
        $videoId = $qParams['v'] ?? '';
    } elseif (str_contains($inputUrl, 'embed/')) {
        $parts = explode('embed/', $inputUrl);
        $videoId = explode('?', explode('#', $parts[1] ?? '')[0])[0];
    } else {
        $videoId = trim($inputUrl);
    }

    if (empty($videoId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid YouTube video ID or URL']);
        exit;
    }

    $ytdlp = file_exists('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : (file_exists('/usr/bin/yt-dlp') ? '/usr/bin/yt-dlp' : 'yt-dlp');
    $cmd = escapeshellcmd($ytdlp) . " --no-playlist --no-warnings -f " . escapeshellarg("bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio") . " --print " . escapeshellarg("%(title)s|||%(uploader)s|||%(thumbnail)s|||%(url)s|||%(duration)s") . " " . escapeshellarg("https://www.youtube.com/watch?v={$videoId}");
    
    $out = shell_exec($cmd);
    $lines = array_filter(explode("\n", trim($out ?? '')));
    $matched = null;
    foreach ($lines as $line) {
        if (str_contains($line, '|||')) {
            $matched = $line;
            break;
        }
    }

    if (!$matched) {
        http_response_code(502);
        echo json_encode(['error' => 'Failed to extract YouTube stream URL']);
        exit;
    }

    $parts = explode('|||', $matched);
    $title = trim($parts[0] ?? 'YouTube Audio');
    $uploader = trim($parts[1] ?? 'YouTube');
    $thumb = trim($parts[2] ?? '');
    $streamUrl = trim($parts[3] ?? '');
    $dur = (int)($parts[4] ?? 0);

    echo json_encode([
        'status' => 'success',
        'success' => true,
        'video_id' => $videoId,
        'title' => $title,
        'artist' => $uploader,
        'album' => 'YouTube Audio Stream',
        'thumbnail' => $thumb,
        'stream_url' => $streamUrl,
        'duration' => $dur
    ]);
    exit;
}

if ($action === 'search_yt') {
    header('Content-Type: application/json; charset=utf-8');
    $query = trim($_GET['q'] ?? $_GET['query'] ?? '');
    if (empty($query)) {
        echo json_encode(['status' => 'success', 'success' => true, 'results' => []]);
        exit;
    }

    $ytdlp = file_exists('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : (file_exists('/usr/bin/yt-dlp') ? '/usr/bin/yt-dlp' : 'yt-dlp');
    $cmd = escapeshellcmd($ytdlp) . " --no-playlist --no-warnings --flat-playlist --print " . escapeshellarg("%(id)s|||%(title)s|||%(uploader)s|||%(thumbnail)s|||%(duration)s") . " " . escapeshellarg("ytsearch12:{$query}");

    $out = shell_exec($cmd);
    $lines = array_filter(explode("\n", trim($out ?? '')));
    $results = [];
    foreach ($lines as $line) {
        $parts = explode('|||', $line);
        if (count($parts) >= 4) {
            $results[] = [
                'id' => trim($parts[0]),
                'title' => trim($parts[1]),
                'artist' => trim($parts[2]),
                'uploader' => trim($parts[2]),
                'thumbnail' => trim($parts[3]),
                'duration' => (int)($parts[4] ?? 0)
            ];
        }
    }

    echo json_encode(['status' => 'success', 'success' => true, 'results' => $results]);
    exit;
}

$track_id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($track_id <= 0) {
    http_response_code(400);
    die(json_encode(['error' => 'Invalid track ID']));
}

$db = get_db();
$stmt = $db->prepare("SELECT file_path, format FROM tracks WHERE id = ?");
$stmt->execute([$track_id]);
$track = $stmt->fetch();

if (!$track || !file_exists($track['file_path']) || !is_readable($track['file_path'])) {
    http_response_code(404);
    die(json_encode(['error' => 'Audio file not found on server']));
}

$file = $track['file_path'];
$size = filesize($file);

// Check if client requested transcode explicitly or file is ALAC
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
$isAlac = ($ext === 'alac' || ($ext === 'm4a' && strtolower($track['format'] ?? '') === 'alac') || (isset($_GET['transcode']) && $_GET['transcode'] === '1'));

// Find FFmpeg executable if available
$ffmpegPath = null;
foreach ([
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    'C:\Program Files\Softdeluxe\Free Download Manager\ffmpeg.exe',
    'C:\Program Files\Virtual Desktop Streamer\ffmpeg.exe',
    'ffmpeg'
] as $cand) {
    if (file_exists($cand) || (str_contains($cand, 'ffmpeg') && is_executable($cand))) {
        $ffmpegPath = $cand;
        break;
    }
}

if ($isAlac && $ffmpegPath) {
    header("Content-Type: audio/wav");
    header("Accept-Ranges: none");
    header("Access-Control-Allow-Origin: *");
    header("Cache-Control: no-cache");

    $seekSec = isset($_GET['ss']) ? (float)$_GET['ss'] : 0;
    $seekArg = ($seekSec > 0) ? "-ss " . escapeshellarg($seekSec) . " " : "";

    while (ob_get_level() > 0) ob_end_clean();
    $cmd = escapeshellarg($ffmpegPath) . " -loglevel error " . $seekArg . "-i " . escapeshellarg($file) . " -c:a pcm_s16le -f wav pipe:1";
    $proc = popen($cmd, 'rb');
    if ($proc) {
        while (!feof($proc) && !connection_aborted()) {
            echo fread($proc, 64 * 1024);
            flush();
        }
        pclose($proc);
        exit;
    }
}

// Determine MIME type
$mimes = [
    'flac' => 'audio/flac',
    'm4a'  => 'audio/mp4',
    'alac' => 'audio/mp4',
    'aac'  => 'audio/aac',
    'mp3'  => 'audio/mpeg',
    'wav'  => 'audio/wav',
    'dsd'  => 'audio/dsd',
    'ogg'  => 'audio/ogg',
    'opus' => 'audio/opus'
];
$mime = $mimes[$ext] ?? 'application/octet-stream';

set_time_limit(0);

$start = 0;
$end = $size - 1;
$isRange = false;

if (isset($_SERVER['HTTP_RANGE'])) {
    if (preg_match('/bytes=\h*(\d+)-(\d*)[\D.*]?/i', $_SERVER['HTTP_RANGE'], $matches)) {
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
header("Content-Disposition: inline; filename=\"" . rawurlencode(basename($file)) . "\"");
header("Cache-Control: public, max-age=31536000");

// Clear output buffers to save memory during lossless playback
while (ob_get_level() > 0) {
    ob_end_clean();
}

$fp = fopen($file, 'rb');
if (!$fp) {
    http_response_code(500);
    exit;
}

if ($start > 0) {
    fseek($fp, $start);
}

$bytesRemaining = $length;
$bufferSize = 64 * 1024; // 64KB chunks for smooth streaming

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
?>