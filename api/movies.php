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

if ($action === 'embedded_subtitle') {
    serveEmbeddedSubtitle();
    exit;
}

if ($action === 'online_subtitle') {
    serveOnlineSubtitle();
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
    @file_put_contents($cacheFile, json_encode($cache, JSON_PRETTY_PRINT));
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
    
    // Custom mappings for known movie titles and releases
    if (stripos($raw, 'Kimi no Na wa') !== false || stripos($raw, 'Your Name') !== false) {
        $cleanTitle = 'Your Name.';
        $year = 2016;
    } elseif (stripos($raw, 'Super Mario Galaxy') !== false) {
        $cleanTitle = 'The Super Mario Galaxy Movie';
        $year = 2026;
    } elseif (stripos($raw, 'Amazing Digital Circus') !== false) {
        $cleanTitle = 'The Amazing Digital Circus: The Last Act';
        $year = 2026;
    } elseif (stripos($raw, 'Deadpool') !== false && stripos($raw, 'Wolverine') !== false) {
        $cleanTitle = 'Deadpool & Wolverine';
        $year = 2024;
    } elseif (stripos($raw, 'Five Nights') !== false && stripos($raw, 'Freddy') !== false) {
        $cleanTitle = "Five Nights at Freddy's";
        $year = 2023;
    } elseif (stripos($raw, 'El.amateur') !== false || stripos($raw, 'The Amateur') !== false) {
        $cleanTitle = 'The Amateur';
        $year = 2025;
    } elseif (stripos($raw, 'The.monkey') !== false || stripos($raw, 'The Monkey') !== false) {
        $cleanTitle = 'The Monkey';
        $year = 2025;
    } elseif (stripos($raw, 'Citizen.Vigilante') !== false || stripos($raw, 'Citizen Vigilante') !== false) {
        $cleanTitle = 'Citizen Vigilante';
        $year = 2026;
    } elseif (stripos($raw, 'Death of Robin Hood') !== false) {
        $cleanTitle = 'The Death of Robin Hood';
        $year = 2026;
    } elseif (stripos($raw, 'Spider-Man') !== false || stripos($raw, 'Spider.Man') !== false) {
        $cleanTitle = 'Spider-Man: Brand New Day';
        $year = 2026;
    } elseif (stripos($raw, 'Young.Washington') !== false || stripos($raw, 'Young Washington') !== false) {
        $cleanTitle = 'Young Washington';
        $year = 2026;
    } elseif (stripos($raw, 'The.Odyssey') !== false || stripos($raw, 'The Odyssey') !== false) {
        $cleanTitle = 'The Odyssey';
        $year = 2026;
    } elseif (stripos($raw, 'Inside.Out.2') !== false || stripos($raw, 'Inside Out 2') !== false) {
        $cleanTitle = 'Inside Out 2';
        $year = 2024;
    } elseif (stripos($raw, 'Inside Out') !== false || stripos($raw, 'Inside.Out') !== false) {
        $cleanTitle = 'Inside Out';
        $year = 2015;
    } elseif (stripos($raw, 'Backrooms') !== false) {
        $cleanTitle = 'Backrooms';
        $year = 2026;
    } elseif (stripos($raw, 'Skyfall') !== false) {
        $cleanTitle = 'Skyfall';
        $year = 2012;
    } elseif (stripos($raw, 'Spectre') !== false) {
        $cleanTitle = 'Spectre';
        $year = 2015;
    } elseif (stripos($raw, 'Flow') !== false) {
        $cleanTitle = 'Flow';
        $year = 2024;
    } elseif (stripos($raw, 'Michael') !== false) {
        $cleanTitle = 'Michael';
        $year = 2026;
    } elseif (stripos($raw, 'Napoleon') !== false || stripos($raw, 'Napole') !== false) {
        $cleanTitle = 'Napoleon';
        $year = 2023;
    } else {
        $year = null;
        if (preg_match('/\b(19\d{2}|20\d{2})\b/', $raw, $matches, PREG_OFFSET_CAPTURE)) {
            $year = (int)$matches[1][0];
            $before = substr($raw, 0, $matches[1][1]);
            if (strlen(trim($before)) >= 3) {
                $raw = $before;
            }
        }
        $clean = preg_replace('/(\[.*?\]|\(.*?\))/', ' ', $raw);
        $clean = preg_replace('/(1080p|2160p|4k|720p|uhd|bluray|web-dl|webrip|web|hdr|atmos|dts|x264|x265|hevc|h264|h265|yts|yify|aac|ddp|telesync|dual-lat|cinecalidad|ita|eng|latino|ben the men|sampa).*$/i', '', $clean);
        $clean = str_replace(['.', '_', '-'], ' ', $clean);
        $clean = preg_replace('/\s+/', ' ', $clean);
        $cleanTitle = trim(ucwords(strtolower(trim($clean))));
        if (empty($cleanTitle)) $cleanTitle = pathinfo($filename, PATHINFO_FILENAME);
    }

    // Resolution and audio quality parsing
    $rawFull = pathinfo($filename, PATHINFO_FILENAME);
    $quality = 'HD';
    if (stripos($rawFull, '2160p') !== false || stripos($rawFull, '4k') !== false || stripos($rawFull, 'uhd') !== false) {
        $quality = '4K UHD';
    } else if (stripos($rawFull, '1080p') !== false) {
        $quality = '1080p FHD';
    } else if (stripos($rawFull, '720p') !== false) {
        $quality = '720p HD';
    }

    $hdr = '';
    if (stripos($rawFull, 'hdr') !== false || stripos($rawFull, 'dv') !== false || stripos($rawFull, 'dovi') !== false) {
        $hdr = 'HDR';
    }

    $audio = '';
    if (stripos($rawFull, 'atmos') !== false) $audio = 'Dolby Atmos';
    else if (stripos($rawFull, 'ddp5.1') !== false || stripos($rawFull, '5.1') !== false) $audio = '5.1';
    else if (stripos($rawFull, '7.1') !== false) $audio = '7.1';

    return [
        'title' => $cleanTitle,
        'year' => $year,
        'quality' => $quality,
        'hdr' => $hdr,
        'audio' => $audio
    ];
}

function fetchOnlineMovieMetadata($cleanTitle, $year = null) {
    $keys = [
        "b1523c14d9b4b0e408d66dc8ef0f0c05",
        "4e44d9029b1270a757cddc766a1bcb63",
        "843c6756178f8306079986b245037d4f",
        "0d8325a7a7bbbc90998f828a2a893c5d"
    ];

    // 1. Try TMDB Search API
    foreach ($keys as $key) {
        $q = urlencode($cleanTitle);
        $url = "https://api.themoviedb.org/3/search/movie?api_key={$key}&query={$q}";
        if ($year) {
            $url .= "&year={$year}";
        }
        
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 4,
                'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n"
            ]
        ]);
        
        $res = @file_get_contents($url, false, $ctx);
        if ($res) {
            $data = json_decode($res, true);
            if (!empty($data['results'])) {
                foreach ($data['results'] as $r) {
                    if (!empty($r['poster_path'])) {
                        $pYear = !empty($r['release_date']) ? (int)substr($r['release_date'], 0, 4) : $year;
                        
                        // Fetch IMDb ID for subtitles
                        $imdbId = null;
                        $extUrl = "https://api.themoviedb.org/3/movie/" . $r['id'] . "/external_ids?api_key={$key}";
                        $extRes = @file_get_contents($extUrl, false, $ctx);
                        if ($extRes) {
                            $extData = json_decode($extRes, true);
                            $imdbId = $extData['imdb_id'] ?? null;
                        }

                        return [
                            'tmdb_id' => $r['id'],
                            'imdb_id' => $imdbId,
                            'title' => $r['title'] ?? $cleanTitle,
                            'year' => $pYear,
                            'poster' => "https://image.tmdb.org/t/p/w780" . $r['poster_path'],
                            'backdrop' => !empty($r['backdrop_path']) ? "https://image.tmdb.org/t/p/w1280" . $r['backdrop_path'] : null,
                            'overview' => $r['overview'] ?? '',
                            'rating' => !empty($r['vote_average']) ? round($r['vote_average'], 1) : null
                        ];
                    }
                }
            }
        }
    }

    // 2. Try TVMaze API (for animation, specials, TV movies)
    $q = urlencode($cleanTitle);
    $url = "https://api.tvmaze.com/singlesearch/shows?q={$q}";
    $ctx = stream_context_create(['http' => ['timeout' => 3, 'header' => "User-Agent: Mozilla/5.0\r\n"]]);
    $res = @file_get_contents($url, false, $ctx);
    if ($res) {
        $data = json_decode($res, true);
        if (!empty($data['image'])) {
            $img = $data['image']['original'] ?? $data['image']['medium'] ?? null;
            if ($img) {
                $pYear = !empty($data['premiered']) ? (int)substr($data['premiered'], 0, 4) : $year;
                $imdbId = $data['externals']['imdb'] ?? null;
                return [
                    'imdb_id' => $imdbId,
                    'title' => $data['name'] ?? $cleanTitle,
                    'year' => $pYear,
                    'poster' => $img,
                    'backdrop' => null,
                    'overview' => strip_tags($data['summary'] ?? ''),
                    'rating' => !empty($data['rating']['average']) ? round($data['rating']['average'], 1) : null
                ];
            }
        }
    }

    return null;
}

function getEmbeddedSubtitles($filePath, $api = '/api/movies.php') {
    $subtitles = [];
    $cmd = "ffprobe -v error -select_streams s -show_entries stream=index,codec_name:stream_tags=language,title -of json " . escapeshellarg($filePath);
    $json = @shell_exec($cmd);
    if ($json) {
        $data = json_decode($json, true);
        if (!empty($data['streams'])) {
            $subIdx = 0;
            foreach ($data['streams'] as $s) {
                $rawLang = strtolower($s['tags']['language'] ?? 'und');
                $title = $s['tags']['title'] ?? '';
                $lang = 'Unknown';
                if (in_array($rawLang, ['spa', 'es', 'esp'])) $lang = 'Spanish';
                elseif (in_array($rawLang, ['eng', 'en'])) $lang = 'English';
                elseif (in_array($rawLang, ['fra', 'fre', 'fr'])) $lang = 'French';
                elseif (in_array($rawLang, ['ita', 'it'])) $lang = 'Italian';
                elseif (in_array($rawLang, ['jpn', 'ja'])) $lang = 'Japanese';
                elseif (in_array($rawLang, ['por', 'pob', 'pt'])) $lang = 'Portuguese';
                elseif (in_array($rawLang, ['ger', 'deu', 'de'])) $lang = 'German';
                else $lang = ucfirst($rawLang);

                $label = $lang . ' (Embedded' . (!empty($title) ? ' - ' . $title : '') . ')';
                $subtitles[] = [
                    'name' => $label,
                    'lang' => $lang,
                    'type' => 'embedded',
                    'stream_index' => $subIdx,
                    'url' => $api . '?action=embedded_subtitle&file=' . urlencode($filePath) . '&stream=' . $subIdx
                ];
                $subIdx++;
            }
        }
    }
    return $subtitles;
}

function fetchOnlineSubtitles($imdbId, $season = null, $episode = null, $api = '/api/movies.php') {
    if (empty($imdbId)) return [];
    $subtitles = [];
    
    if ($season !== null && $episode !== null) {
        $url = "https://opensubtitles-v3.strem.io/subtitles/series/{$imdbId}:{$season}:{$episode}.json";
    } else {
        $url = "https://opensubtitles-v3.strem.io/subtitles/movie/{$imdbId}.json";
    }

    $ctx = stream_context_create([
        'http' => [
            'timeout' => 4,
            'header' => "User-Agent: Stremio/4.4.168\r\n"
        ]
    ]);

    $res = @file_get_contents($url, false, $ctx);
    if ($res) {
        $data = json_decode($res, true);
        if (!empty($data['subtitles'])) {
            $spaCount = 0;
            $engCount = 0;
            foreach ($data['subtitles'] as $sub) {
                $langCode = strtolower($sub['lang'] ?? '');
                $subUrl = $sub['url'] ?? '';
                if (empty($subUrl)) continue;

                if (in_array($langCode, ['spa', 'es']) && $spaCount < 3) {
                    $spaCount++;
                    $subtitles[] = [
                        'name' => 'Spanish ' . ($spaCount > 1 ? '#' . $spaCount : '(Online)'),
                        'lang' => 'Spanish',
                        'type' => 'online',
                        'url' => $api . '?action=online_subtitle&url=' . urlencode($subUrl)
                    ];
                } elseif (in_array($langCode, ['eng', 'en']) && $engCount < 3) {
                    $engCount++;
                    $subtitles[] = [
                        'name' => 'English ' . ($engCount > 1 ? '#' . $engCount : '(Online)'),
                        'lang' => 'English',
                        'type' => 'online',
                        'url' => $api . '?action=online_subtitle&url=' . urlencode($subUrl)
                    ];
                }
            }
        }
    }

    return $subtitles;
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
            $cacheUpdated = false;
            $forceRefresh = isset($_GET['refresh']);
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
                        if ($fileSize < 100 * 1024 * 1024) continue;
                        
                        $filename = $file->getFilename();
                        if (stripos($filename, 'doodstream') !== false || preg_match('/^[0-9a-f\-]{20,}/i', $filename)) continue;
                        $cacheKey = md5($filePath);

                        if (!$forceRefresh && isset($cache[$cacheKey]) && is_array($cache[$cacheKey]) && !empty($cache[$cacheKey]['title']) && !empty($cache[$cacheKey]['poster']) && strpos($cache[$cacheKey]['poster'], 'http') !== false) {
                            $movieData = $cache[$cacheKey];
                            $movieData['id'] = $idCounter++;
                            $movies[] = $movieData;
                            continue;
                        }

                        $parsed = parseMovieFilename($filename);

                        // 1. Discover local sidecar subtitles
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
                                            'name' => pathinfo($subFile, PATHINFO_FILENAME) . ' (Local)',
                                            'lang' => $lang,
                                            'type' => 'local',
                                            'path' => $subPath,
                                            'url' => "/api/movies.php?action=subtitle&file=" . urlencode($subPath)
                                        ];
                                    }
                                }
                            }
                        }

                        // 2. Discover embedded subtitles inside container
                        $embedSubs = getEmbeddedSubtitles($filePath, '/api/movies.php');
                        foreach ($embedSubs as $es) {
                            $subtitles[] = $es;
                        }

                        // 3. Fetch online metadata & real official poster
                        $online = fetchOnlineMovieMetadata($parsed['title'], $parsed['year']);
                        $finalTitle = $online['title'] ?? $parsed['title'];
                        $finalYear = $online['year'] ?? $parsed['year'];
                        $finalOverview = $online['overview'] ?? 'TrueNAS Cinema Hi-Fi Stream';
                        $finalRating = $online['rating'] ?? '8.5';
                        $imdbId = $online['imdb_id'] ?? null;
                        $posterUrl = !empty($online['poster']) ? $online['poster'] : ("/api/movies.php?action=poster&file=" . urlencode($filePath));

                        // 4. Auto-search online English & Spanish subtitles
                        if ($imdbId) {
                            $onlineSubs = fetchOnlineSubtitles($imdbId, null, null, '/api/movies.php');
                            foreach ($onlineSubs as $os) {
                                $subtitles[] = $os;
                            }
                        }

                        $movieData = [
                            'id' => $idCounter++,
                            'title' => $finalTitle,
                            'year' => $finalYear,
                            'filename' => $filename,
                            'file_path' => $filePath,
                            'size' => $fileSize,
                            'formatted_size' => round($fileSize / (1024 * 1024 * 1024), 2) . ' GB',
                            'format' => strtoupper($ext),
                            'quality' => $parsed['quality'],
                            'hdr' => $parsed['hdr'],
                            'audio' => $parsed['audio'],
                            'poster' => $posterUrl,
                            'overview' => $finalOverview,
                            'rating' => $finalRating,
                            'imdb_id' => $imdbId,
                            'subtitles' => $subtitles,
                            'stream_url' => "/api/movies.php?action=stream&file=" . urlencode($filePath)
                        ];

                        $cache[$cacheKey] = $movieData;
                        $cacheUpdated = true;
                        $movies[] = $movieData;
                    }
                }
            }

            if ($cacheUpdated) {
                saveMoviesCache($cache);
            }

            // Sort by title
            usort($movies, function($a, $b) {
                return strcasecmp($a['title'] ?? '', $b['title'] ?? '');
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

function serveEmbeddedSubtitle() {
    $file = $_GET['file'] ?? '';
    $streamIdx = (int)($_GET['stream'] ?? 0);
    $realFile = realpath($file);
    if (empty($file) || !$realFile || !file_exists($realFile)) {
        http_response_code(404);
        die("Video file not found.");
    }

    $cacheDir = is_dir('/data') ? '/data/subtitles' : sys_get_temp_dir() . '/subtitles';
    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0777, true);

    $vttFile = $cacheDir . '/embed_' . md5($realFile) . '_' . $streamIdx . '.vtt';
    if (!file_exists($vttFile) || filesize($vttFile) === 0) {
        $cmd = "ffmpeg -y -i " . escapeshellarg($realFile) . " -map 0:s:{$streamIdx} " . escapeshellarg($vttFile) . " 2>&1";
        @shell_exec($cmd);
    }

    header('Content-Type: text/vtt; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    if (file_exists($vttFile) && filesize($vttFile) > 0) {
        readfile($vttFile);
    } else {
        echo "WEBVTT\n\n";
    }
    exit;
}

function serveOnlineSubtitle() {
    $subUrl = $_GET['url'] ?? '';
    if (empty($subUrl)) {
        http_response_code(400);
        die("Missing subtitle URL.");
    }

    $cacheDir = is_dir('/data') ? '/data/subtitles' : sys_get_temp_dir() . '/subtitles';
    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0777, true);

    $vttFile = $cacheDir . '/online_' . md5($subUrl) . '.vtt';
    if (!file_exists($vttFile) || filesize($vttFile) === 0) {
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 8,
                'header' => "User-Agent: Stremio/4.4.168\r\n"
            ]
        ]);
        $raw = @file_get_contents($subUrl, false, $ctx);
        if ($raw) {
            // Check if gzipped
            if (substr($raw, 0, 2) === "\x1f\x8b") {
                $raw = @gzdecode($raw);
            }
            if ($raw) {
                if (stripos($raw, 'WEBVTT') === 0) {
                    $vttContent = $raw;
                } else {
                    $vttContent = "WEBVTT\n\n" . preg_replace('/(\d{2}:\d{2}:\d{2}),(\d{3})/', '$1.$2', $raw);
                }
                @file_put_contents($vttFile, $vttContent);
            }
        }
    }

    header('Content-Type: text/vtt; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    if (file_exists($vttFile) && filesize($vttFile) > 0) {
        readfile($vttFile);
    } else {
        echo "WEBVTT\n\n";
    }
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

    $cacheDir = is_dir('/data') ? '/data/movie_posters' : sys_get_temp_dir() . '/movie_posters';
    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0777, true);

    $parsed = parseMovieFilename(basename($file));
    $cachePosterFile = $cacheDir . '/poster_' . md5($parsed['title'] . '_' . ($parsed['year'] ?? '0')) . '.jpg';

    // 1. Check cached downloaded poster
    if (file_exists($cachePosterFile) && filesize($cachePosterFile) > 1024) {
        header("Content-Type: image/jpeg");
        header('Cache-Control: public, max-age=604800');
        readfile($cachePosterFile);
        exit;
    }

    // 2. Check local folder for cover/poster image
    $parentDir = dirname($file);
    foreach (['poster.jpg', 'poster.png', 'cover.jpg', 'cover.png', 'folder.jpg', 'folder.png'] as $c) {
        $cand = $parentDir . DIRECTORY_SEPARATOR . $c;
        if (file_exists($cand) && filesize($cand) > 0) {
            $ext = strtolower(pathinfo($cand, PATHINFO_EXTENSION));
            header("Content-Type: " . (($ext === 'png') ? 'image/png' : 'image/jpeg'));
            header('Cache-Control: public, max-age=604800');
            readfile($cand);
            exit;
        }
    }

    // 3. Fetch from online TMDB / TVMaze APIs and save to cache
    $online = fetchOnlineMovieMetadata($parsed['title'], $parsed['year']);
    if ($online && !empty($online['poster'])) {
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 5,
                'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n"
            ]
        ]);
        $imgData = @file_get_contents($online['poster'], false, $ctx);
        if ($imgData && strlen($imgData) > 1024) {
            @file_put_contents($cachePosterFile, $imgData);
            header("Content-Type: image/jpeg");
            header('Cache-Control: public, max-age=604800');
            echo $imgData;
            exit;
        }
    }

    // 4. Video snapshot fallback via FFmpeg
    $thumbCache = $cacheDir . '/thumb_' . md5($file) . '.jpg';
    if (file_exists($thumbCache) && filesize($thumbCache) > 0) {
        header("Content-Type: image/jpeg");
        header('Cache-Control: public, max-age=604800');
        readfile($thumbCache);
        exit;
    }

    $ffmpeg = '/usr/bin/ffmpeg';
    if (file_exists($ffmpeg) || is_executable($ffmpeg)) {
        $cmd = escapeshellarg($ffmpeg) . " -ss 00:03:00 -i " . escapeshellarg($file) . " -vframes 1 -q:v 2 -vf \"scale=480:-1\" " . escapeshellarg($thumbCache) . " 2>&1";
        @exec($cmd);

        if (file_exists($thumbCache) && filesize($thumbCache) > 0) {
            header("Content-Type: image/jpeg");
            header('Cache-Control: public, max-age=604800');
            readfile($thumbCache);
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
?>