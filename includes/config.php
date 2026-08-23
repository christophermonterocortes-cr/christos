<?php
// CHRISTOS Hi-Fi Audio & Media Server Configuration

// Database Engine (sqlite or mysql)
$dbTypeEnv = getenv('DB_TYPE') ?: 'sqlite';
define('DB_TYPE', $dbTypeEnv);

// SQLite Database Path
$sqlitePathEnv = getenv('DB_SQLITE_PATH') ?: (is_dir('/data') ? '/data/christos.db' : __DIR__ . '/../christos.db');
define('DB_SQLITE_PATH', $sqlitePathEnv);

// MySQL Database configuration
$dbHostEnv = getenv('DB_HOST') ?: '192.168.0.245';
$dbPortEnv = getenv('DB_PORT') ?: '3067';
$dbNameEnv = getenv('DB_NAME') ?: 'christos';
$dbUserEnv = getenv('DB_USER') ?: 'root';
$dbPassEnv = getenv('DB_PASS') ?: 'root';

if (strpos($dbHostEnv, ':') !== false) {
    list($parsedHost, $parsedPort) = explode(':', $dbHostEnv, 2);
    $dbHostEnv = $parsedHost;
    $dbPortEnv = $parsedPort;
}

define('DB_HOST', $dbHostEnv);
define('DB_PORT', $dbPortEnv);
define('DB_NAME', $dbNameEnv);
define('DB_USER', $dbUserEnv);
define('DB_PASS', $dbPassEnv);

// Multi-Library Definitions (Strictly Separated)
define('LIBRARIES', [
    'flac' => [
        'name' => 'FLAC Master Collection',
        'slug' => 'flac',
        'icon' => 'disc',
        'paths' => [
            '/mnt/DISK_MAC/everything/Music',
            '/mnt/DISK_MAC/everything/music'
        ]
    ],
    'apple_music' => [
        'name' => 'Apple Music Lossless',
        'slug' => 'apple_music',
        'icon' => 'music',
        'paths' => [
            '/mnt/DISK_MAC/everything/Different World - 1445140820 - 16B-44.1kHz - ALAC',
            '/mnt/DISK_MAC/everything/downloads/ALAC',
            '/mnt/DISK_MAC/everything/music alac',
            'C:/Users/CHRISTOPHER/Downloads/Different World - 1445140820 - 16B-44.1kHz - ALAC',
            'C:/Users/CHRISTOPHER/Downloads/music alac'
        ]
    ]
]);

// All Music paths combined for scanner fallback
$allMusicPaths = [];
foreach (LIBRARIES as $lib) {
    foreach ($lib['paths'] as $p) {
        $allMusicPaths[] = $p;
    }
}
define('MUSIC_PATHS', array_values(array_unique($allMusicPaths)));

// Movies & TV Shows Root Paths
define('MOVIES_PATH', getenv('MOVIES_PATH') ?: '/mnt/DISK_MAC/thecus/LL/disk/media');
define('TV_SHOWS_PATH', getenv('TV_SHOWS_PATH') ?: '/mnt/DISK_MAC/thecus/LL/disk/Series(TVshows)');

// Allowed File Browser Roots
define('FILE_BROWSER_ROOTS', [
    'everything' => [
        'name' => 'Everything Storage',
        'path' => '/mnt/DISK_MAC/everything'
    ],
    'thecus' => [
        'name' => 'Thecus Media & Backup',
        'path' => '/mnt/DISK_MAC/thecus'
    ]
]);

// Lossless Downloader Output Directories
define('DOWNLOADS_PATH', getenv('DOWNLOADS_PATH') ?: '/mnt/DISK_MAC/everything/downloads');
define('UNIVERSAL_DOWNLOADS_PATH', getenv('UNIVERSAL_DOWNLOADS_PATH') ?: '/mnt/DISK_MAC/everything/universal-downloader');

// Security & Sessions
define('SESSION_SECRET', getenv('SESSION_SECRET') ?: 'christos_hifi_production_secret_key_2026');
define('APP_VERSION', '2.4.0');
?>