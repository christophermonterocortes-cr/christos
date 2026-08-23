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