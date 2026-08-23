<?php
require_once __DIR__ . '/config.php';

function get_db() {
    static $pdo = null;
    if ($pdo === null) {
        if (DB_TYPE === 'sqlite') {
            $dbFile = DB_SQLITE_PATH;
            $dbDir = dirname($dbFile);
            if (!is_dir($dbDir)) {
                @mkdir($dbDir, 0777, true);
            }
            $isNew = !file_exists($dbFile) || filesize($dbFile) === 0;
            
            try {
                $pdo = new PDO("sqlite:" . $dbFile, null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                ]);
                $pdo->exec("PRAGMA journal_mode = WAL;");
                $pdo->exec("PRAGMA synchronous = NORMAL;");
                $pdo->exec("PRAGMA foreign_keys = ON;");
                
                init_sqlite_schema($pdo);
            } catch (PDOException $e) {
                if (php_sapi_name() !== 'cli') {
                    http_response_code(500);
                    header('Content-Type: application/json');
                    echo json_encode(['error' => 'SQLite Database connection failed', 'message' => $e->getMessage()]);
                } else {
                    fwrite(STDERR, "SQLite Database connection error: " . $e->getMessage() . "\n");
                }
                exit(1);
            }
        } else {
            $portStr = defined('DB_PORT') && DB_PORT ? ";port=" . DB_PORT : "";
            $dsn = "mysql:host=" . DB_HOST . $portStr . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            try {
                $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
                ]);
            } catch (PDOException $e) {
                error_log("CHRISTOS: MySQL connection failed ({$e->getMessage()}), falling back to SQLite at " . DB_SQLITE_PATH);
                $dbFile = DB_SQLITE_PATH;
                $dbDir = dirname($dbFile);
                if (!is_dir($dbDir)) @mkdir($dbDir, 0777, true);
                $pdo = new PDO("sqlite:" . $dbFile, null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                ]);
                init_sqlite_schema($pdo);
            }
        }
    }
    return $pdo;
}

function init_sqlite_schema($pdo) {
    $schema = "
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        theme_id INTEGER DEFAULT 1,
        visualizer_id INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        art_path TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_artist_name ON artists(name);
    
    CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        year INTEGER,
        art_path TEXT,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_album_artist ON albums(artist_id);
    CREATE INDEX IF NOT EXISTS idx_album_title ON albums(title);

    CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        format TEXT,
        bit_depth INTEGER,
        sample_rate INTEGER,
        duration INTEGER,
        track_number INTEGER,
        library_tag TEXT DEFAULT 'flac',
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_track_album ON tracks(album_id);
    CREATE INDEX IF NOT EXISTS idx_track_title ON tracks(title);
    CREATE INDEX IF NOT EXISTS idx_track_library ON tracks(library_tag);

    CREATE TABLE IF NOT EXISTS lyrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL UNIQUE,
        lrc_text TEXT,
        is_synced INTEGER DEFAULT 0,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
        name TEXT NOT NULL,
        is_public INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id INTEGER NOT NULL,
        track_id INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (playlist_id, track_id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER NOT NULL DEFAULT 1,
        track_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, track_id),
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        track_id INTEGER NOT NULL,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS share_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        file_path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
    );
    ";
    $pdo->exec($schema);

    // Auto-migrate tracks table if library_tag column is missing
    try {
        $pdo->exec("ALTER TABLE tracks ADD COLUMN library_tag TEXT DEFAULT 'flac';");
    } catch (Exception $e) {}
}
?>