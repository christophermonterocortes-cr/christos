<?php
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? 'list';

// Public share stream action handles its own output
if ($action === 'stream_share' || $action === 'raw') {
    handleRawStream();
    exit;
}

header('Content-Type: application/json; charset=utf-8');

function getRoots() {
    $roots = [];
    if (defined('FILE_BROWSER_ROOTS')) {
        foreach (FILE_BROWSER_ROOTS as $k => $v) {
            $path = $v['path'];
            // Check if path exists or fallback for local Windows dev
            if (!file_exists($path)) {
                if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                    $winFallback = "C:/Users/CHRISTOPHER/Downloads";
                    if (file_exists($winFallback)) $path = $winFallback;
                }
            }
            $roots[$k] = [
                'id' => $k,
                'name' => $v['name'],
                'path' => $path
            ];
        }
    }
    if (empty($roots)) {
        $roots['root'] = [
            'id' => 'root',
            'name' => 'Storage',
            'path' => (file_exists('/mnt/DISK_MAC') ? '/mnt/DISK_MAC' : __DIR__ . '/..')
        ];
    }
    return $roots;
}

function resolveSecurePath($reqPath, $rootKey = 'everything') {
    $roots = getRoots();
    $rootInfo = $roots[$rootKey] ?? reset($roots);
    $basePath = realpath($rootInfo['path']);

    if (!$basePath) {
        return ['error' => 'Root storage path is inaccessible'];
    }

    // Canonical path segmentation to neutralize path traversal
    $normalized = str_replace('\\', '/', $reqPath);
    $segments = array_filter(explode('/', $normalized), function($seg) {
        return $seg !== '' && $seg !== '.';
    });
    $safeSegments = [];
    foreach ($segments as $seg) {
        if ($seg === '..') {
            array_pop($safeSegments);
        } else {
            $safeSegments[] = $seg;
        }
    }
    $cleanPath = implode(DIRECTORY_SEPARATOR, $safeSegments);

    $targetPath = empty($cleanPath) ? $basePath : $basePath . DIRECTORY_SEPARATOR . $cleanPath;
    $realTarget = realpath($targetPath);

    if ($realTarget === false) {
        // If creating a file/folder, parent must exist and be strictly within basePath
        $parent = realpath(dirname($targetPath));
        if ($parent && ($parent === $basePath || strpos($parent, $basePath . DIRECTORY_SEPARATOR) === 0)) {
            return [
                'valid' => true,
                'path' => $targetPath,
                'rel_path' => $cleanPath,
                'root' => $rootInfo,
                'exists' => false
            ];
        }
        return ['error' => 'Path not found'];
    }

    if ($realTarget !== $basePath && strpos($realTarget, $basePath . DIRECTORY_SEPARATOR) !== 0) {
        return ['error' => 'Access denied: outside root directory'];
    }

    $rel = trim(substr($realTarget, strlen($basePath)), '/\\');

    return [
        'valid' => true,
        'path' => $realTarget,
        'rel_path' => $rel,
        'root' => $rootInfo,
        'exists' => true
    ];
}

function getMimeType($file) {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $map = [
        'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'flac' => 'audio/flac', 'wav' => 'audio/wav', 'alac' => 'audio/mp4', 'ogg' => 'audio/ogg',
        'mp4' => 'video/mp4', 'mkv' => 'video/x-matroska', 'webm' => 'video/webm', 'avi' => 'video/x-msvideo', 'mov' => 'video/quicktime',
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp', 'svg' => 'image/svg+xml',
        'pdf' => 'application/pdf', 'txt' => 'text/plain', 'json' => 'application/json', 'js' => 'text/javascript', 'css' => 'text/css',
        'zip' => 'application/zip', 'tar' => 'application/x-tar', 'gz' => 'application/gzip', 'iso' => 'application/x-iso9660-image'
    ];
    return $map[$ext] ?? 'application/octet-stream';
}

function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

function getFileIconType($file, $isDir) {
    if ($isDir) return 'folder';
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if (in_array($ext, ['mp3', 'flac', 'm4a', 'alac', 'wav', 'ogg'])) return 'audio';
    if (in_array($ext, ['mp4', 'mkv', 'avi', 'mov', 'webm'])) return 'video';
    if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'])) return 'image';
    if ($ext === 'pdf') return 'pdf';
    if (in_array($ext, ['zip', 'rar', 'tar', 'gz', '7z', 'iso'])) return 'archive';
    if (in_array($ext, ['txt', 'md', 'json', 'js', 'php', 'html', 'css', 'py', 'sh', 'xml'])) return 'code';
    return 'file';
}

try {
    $rootKey = $_GET['root'] ?? 'everything';
    $reqPath = $_GET['path'] ?? '';

    switch ($action) {
        case 'roots':
            echo json_encode(array_values(getRoots()));
            break;

        case 'list':
            $resolved = resolveSecurePath($reqPath, $rootKey);
            if (isset($resolved['error'])) {
                http_response_code(400);
                echo json_encode(['error' => $resolved['error']]);
                break;
            }

            $target = $resolved['path'];
            if (!is_dir($target)) {
                http_response_code(400);
                echo json_encode(['error' => 'Target is not a directory']);
                break;
            }

            $items = [];
            $dirHandle = opendir($target);
            if ($dirHandle) {
                while (($entry = readdir($dirHandle)) !== false) {
                    if ($entry === '.' || $entry === '..') continue;
                    $itemPath = $target . DIRECTORY_SEPARATOR . $entry;
                    $isDir = is_dir($itemPath);
                    $size = $isDir ? 0 : (@filesize($itemPath) ?: 0);
                    $mtime = @filemtime($itemPath) ?: 0;
                    $ext = $isDir ? '' : strtolower(pathinfo($entry, PATHINFO_EXTENSION));
                    $icon = getFileIconType($entry, $isDir);

                    $items[] = [
                        'name' => $entry,
                        'is_dir' => $isDir,
                        'size' => $size,
                        'formatted_size' => $isDir ? '-' : formatBytes($size),
                        'mtime' => $mtime,
                        'formatted_date' => date('Y-m-d H:i', $mtime),
                        'extension' => $ext,
                        'icon' => $icon,
                        'mime_type' => $isDir ? 'directory' : getMimeType($entry)
                    ];
                }
                closedir($dirHandle);
            }

            // Sort directories first, then alphabetically
            usort($items, function($a, $b) {
                if ($a['is_dir'] === $b['is_dir']) {
                    return strcasecmp($a['name'], $b['name']);
                }
                return $a['is_dir'] ? -1 : 1;
            });

            // Build breadcrumbs
            $breadcrumbs = [['name' => $resolved['root']['name'], 'path' => '']];
            if (!empty($resolved['rel_path'])) {
                $parts = explode(DIRECTORY_SEPARATOR, $resolved['rel_path']);
                $cum = '';
                foreach ($parts as $p) {
                    if (empty($p)) continue;
                    $cum = empty($cum) ? $p : $cum . '/' . $p;
                    $breadcrumbs[] = ['name' => $p, 'path' => $cum];
                }
            }

            echo json_encode([
                'root' => $resolved['root']['id'],
                'root_name' => $resolved['root']['name'],
                'current_path' => str_replace('\\', '/', $resolved['rel_path']),
                'breadcrumbs' => $breadcrumbs,
                'items' => $items,
                'total_items' => count($items)
            ]);
            break;

        case 'upload':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                http_response_code(405);
                echo json_encode(['error' => 'POST method required']);
                break;
            }

            $resolved = resolveSecurePath($reqPath, $rootKey);
            if (isset($resolved['error']) || !is_dir($resolved['path'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid upload destination directory']);
                break;
            }

            if (empty($_FILES['files'])) {
                http_response_code(400);
                echo json_encode(['error' => 'No files uploaded']);
                break;
            }

            $uploaded = [];
            $files = $_FILES['files'];
            $count = is_array($files['name']) ? count($files['name']) : 1;
            $dangerousExts = ['php', 'phtml', 'php3', 'php4', 'php5', 'phar', 'sh', 'bash', 'exe', 'bat', 'cmd', 'py', 'pl', 'cgi', 'htaccess', 'ini'];

            for ($i = 0; $i < $count; $i++) {
                $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
                $tmp = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
                $err = is_array($files['error']) ? $files['error'][$i] : $files['error'];

                if ($err === UPLOAD_ERR_OK && is_uploaded_file($tmp)) {
                    $cleanName = basename($name);
                    $ext = strtolower(pathinfo($cleanName, PATHINFO_EXTENSION));
                    // Disallow executable script extensions or hidden configuration files
                    if (in_array($ext, $dangerousExts) || str_starts_with($cleanName, '.')) {
                        continue;
                    }
                    $dest = $resolved['path'] . DIRECTORY_SEPARATOR . $cleanName;
                    if (move_uploaded_file($tmp, $dest)) {
                        $uploaded[] = $cleanName;
                    }
                }
            }

            echo json_encode(['success' => true, 'uploaded' => $uploaded, 'count' => count($uploaded)]);
            break;

        case 'mkdir':
            $raw = file_get_contents('php://input');
            $data = json_decode($raw, true) ?: $_POST;
            $name = trim($data['name'] ?? '');
            if (empty($name)) {
                http_response_code(400);
                echo json_encode(['error' => 'Folder name is required']);
                break;
            }

            $cleanName = basename($name);
            $targetDir = empty($reqPath) ? $cleanName : $reqPath . '/' . $cleanName;
            $resolved = resolveSecurePath($targetDir, $rootKey);

            if (file_exists($resolved['path'])) {
                http_response_code(409);
                echo json_encode(['error' => 'Folder already exists']);
                break;
            }

            if (mkdir($resolved['path'], 0777, true)) {
                echo json_encode(['success' => true, 'message' => 'Folder created successfully']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to create folder']);
            }
            break;

        case 'delete':
            $raw = file_get_contents('php://input');
            $data = json_decode($raw, true) ?: $_POST;
            $names = $data['names'] ?? [$data['name'] ?? null];
            $names = array_filter((array)$names);

            if (empty($names)) {
                http_response_code(400);
                echo json_encode(['error' => 'No items specified for deletion']);
                break;
            }

            $deleted = [];
            foreach ($names as $item) {
                $target = empty($reqPath) ? $item : $reqPath . '/' . $item;
                $resolved = resolveSecurePath($target, $rootKey);
                if (!isset($resolved['error']) && file_exists($resolved['path'])) {
                    if (is_dir($resolved['path'])) {
                        deleteDirRecursive($resolved['path']);
                    } else {
                        @unlink($resolved['path']);
                    }
                    $deleted[] = $item;
                }
            }
            echo json_encode(['success' => true, 'deleted' => $deleted]);
            break;

        case 'copy':
        case 'move':
            $raw = file_get_contents('php://input');
            $data = json_decode($raw, true) ?: $_POST;
            $items = (array)($data['items'] ?? []);
            $destPath = $data['dest_path'] ?? '';
            $destRoot = $data['dest_root'] ?? $rootKey;

            $resolvedDest = resolveSecurePath($destPath, $destRoot);
            if (isset($resolvedDest['error']) || !is_dir($resolvedDest['path'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid destination directory']);
                break;
            }

            $processed = [];
            foreach ($items as $item) {
                $source = empty($reqPath) ? $item : $reqPath . '/' . $item;
                $resolvedSrc = resolveSecurePath($source, $rootKey);
                if (!isset($resolvedSrc['error']) && file_exists($resolvedSrc['path'])) {
                    $targetItem = $resolvedDest['path'] . DIRECTORY_SEPARATOR . basename($resolvedSrc['path']);
                    if ($action === 'move') {
                        rename($resolvedSrc['path'], $targetItem);
                    } else {
                        copyRecursive($resolvedSrc['path'], $targetItem);
                    }
                    $processed[] = $item;
                }
            }
            echo json_encode(['success' => true, 'action' => $action, 'items' => $processed]);
            break;

        case 'share':
            $resolved = resolveSecurePath($reqPath, $rootKey);
            if (isset($resolved['error']) || !file_exists($resolved['path'])) {
                http_response_code(404);
                echo json_encode(['error' => 'File not found']);
                break;
            }

            $token = bin2hex(random_bytes(24));
            $db = get_db();
            $stmt = $db->prepare("INSERT INTO share_tokens (token, file_path, expires_at) VALUES (?, ?, ?)");
            $expiresAt = date('Y-m-d H:i:s', time() + 86400 * 7); // 7 days link
            $stmt->execute([$token, $resolved['path'], $expiresAt]);

            $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? '192.168.0.245:16010';
            $shareUrl = "{$scheme}://{$host}/api/files.php?action=stream_share&token={$token}";

            echo json_encode([
                'success' => true,
                'token' => $token,
                'share_url' => $shareUrl,
                'filename' => basename($resolved['path']),
                'expires_at' => $expiresAt
            ]);
            break;

        case 'search':
            $q = trim($_GET['q'] ?? '');
            if (empty($q)) {
                echo json_encode([]);
                break;
            }
            $resolved = resolveSecurePath('', $rootKey);
            $baseDir = $resolved['path'];

            $results = [];
            $rdi = new RecursiveDirectoryIterator($baseDir, FilesystemIterator::SKIP_DOTS);
            $rii = new RecursiveIteratorIterator($rdi, RecursiveIteratorIterator::SELF_FIRST, RecursiveIteratorIterator::CATCH_GET_CHILD);

            $count = 0;
            foreach ($rii as $file) {
                if ($count >= 50) break;
                if (stripos($file->getFilename(), $q) !== false) {
                    $isDir = $file->isDir();
                    $rel = substr($file->getPathname(), strlen($baseDir) + 1);
                    $results[] = [
                        'name' => $file->getFilename(),
                        'rel_path' => str_replace('\\', '/', $rel),
                        'is_dir' => $isDir,
                        'size' => $isDir ? 0 : $file->getSize(),
                        'formatted_size' => $isDir ? '-' : formatBytes($file->getSize()),
                        'icon' => getFileIconType($file->getFilename(), $isDir)
                    ];
                    $count++;
                }
            }
            echo json_encode($results);
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

function handleRawStream() {
    $token = $_GET['token'] ?? null;
    $file = null;

    if ($token) {
        $db = get_db();
        $stmt = $db->prepare("SELECT file_path, expires_at FROM share_tokens WHERE token = ?");
        $stmt->execute([$token]);
        $row = $stmt->fetch();
        if ($row && file_exists($row['file_path'])) {
            if (!empty($row['expires_at']) && strtotime($row['expires_at']) < time()) {
                http_response_code(403);
                die("Link has expired.");
            }
            $file = $row['file_path'];
        }
    } else {
        $rootKey = $_GET['root'] ?? 'everything';
        $reqPath = $_GET['path'] ?? '';
        $resolved = resolveSecurePath($reqPath, $rootKey);
        if (!isset($resolved['error']) && file_exists($resolved['path'])) {
            $file = $resolved['path'];
        }
    }

    if (!$file || !file_exists($file)) {
        http_response_code(404);
        die("File not found or link has expired.");
    }

    set_time_limit(0);

    if (is_dir($file)) {
        // Zip directory for download
        $zipName = basename($file) . '.zip';
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . rawurlencode($zipName) . '"');
        $zip = new ZipArchive();
        $tmpZip = tempnam(sys_get_temp_dir(), 'zip');
        $zip->open($tmpZip, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($file, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($files as $f) {
            if (!$f->isDir()) {
                $filePath = $f->getRealPath();
                $rel = substr($filePath, strlen($file) + 1);
                $zip->addFile($filePath, $rel);
            }
        }
        $zip->close();
        readfile($tmpZip);
        @unlink($tmpZip);
        exit;
    }

    $mime = getMimeType($file);
    $size = filesize($file);
    $download = isset($_GET['download']) && $_GET['download'] === '1';

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

    $disp = $download ? 'attachment' : 'inline';
    header('Content-Disposition: ' . $disp . '; filename="' . rawurlencode(basename($file)) . '"');

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
    $bufferSize = 64 * 1024;

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

function deleteDirRecursive($dir) {
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        (is_dir("$dir/$file")) ? deleteDirRecursive("$dir/$file") : @unlink("$dir/$file");
    }
    return @rmdir($dir);
}

function copyRecursive($src, $dst) {
    if (is_dir($src)) {
        @mkdir($dst, 0777, true);
        $files = scandir($src);
        foreach ($files as $file) {
            if ($file != "." && $file != "..") {
                copyRecursive("$src/$file", "$dst/$file");
            }
        }
    } else if (file_exists($src)) {
        copy($src, $dst);
    }
}
