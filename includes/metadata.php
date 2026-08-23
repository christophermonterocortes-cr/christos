<?php
/**
 * CHRISTOS Pure-PHP Audio Metadata Reader & Artwork Extractor
 * Supports FLAC, MP3 (ID3v2/v1), M4A/ALAC (MP4/QuickTime), and WAV
 */

class AudioMetadata {
    public static function analyze($filepath) {
        if (!file_exists($filepath) || !is_readable($filepath)) {
            return self::getDefaults($filepath);
        }

        $ext = strtolower(pathinfo($filepath, PATHINFO_EXTENSION));
        $data = self::getDefaults($filepath);

        try {
            switch ($ext) {
                case 'flac':
                    $data = self::analyzeFlac($filepath, $data);
                    break;
                case 'mp3':
                    $data = self::analyzeMp3($filepath, $data);
                    break;
                case 'm4a':
                case 'alac':
                case 'aac':
                    $data = self::analyzeMp4($filepath, $data);
                    break;
                case 'wav':
                    $data = self::analyzeWav($filepath, $data);
                    break;
            }
        } catch (Exception $e) {
            // Fall back to filename-derived defaults on parse error
        }

        // Auto-discover folder art if no art path set
        if (empty($data['art_path'])) {
            $dir = dirname($filepath);
            $artFiles = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'album.jpg', 'album.png'];
            foreach ($artFiles as $artFile) {
                $candidate = $dir . DIRECTORY_SEPARATOR . $artFile;
                if (file_exists($candidate)) {
                    $data['art_path'] = $candidate;
                    break;
                }
            }
        }

        return $data;
    }

    private static function getDefaults($filepath) {
        $filename = pathinfo($filepath, PATHINFO_FILENAME);
        $parts = explode(' - ', $filename, 2);
        $artist = count($parts) === 2 ? trim($parts[0]) : 'Unknown Artist';
        $title = count($parts) === 2 ? trim($parts[1]) : $filename;

        return [
            'title' => $title,
            'artist' => $artist,
            'album' => 'Unknown Album',
            'year' => null,
            'track_number' => 1,
            'duration' => 0,
            'bit_depth' => 16,
            'sample_rate' => 44100,
            'format' => strtolower(pathinfo($filepath, PATHINFO_EXTENSION)),
            'art_path' => null,
            'embedded_art' => null
        ];
    }

    private static function analyzeFlac($filepath, $data) {
        $fp = fopen($filepath, 'rb');
        if (!$fp) return $data;

        $magic = fread($fp, 4);
        if ($magic !== 'fLaC') {
            fclose($fp);
            return $data;
        }

        $isLast = false;
        while (!$isLast && !feof($fp)) {
            $header = fread($fp, 4);
            if (strlen($header) < 4) break;
            $byte0 = ord($header[0]);
            $isLast = ($byte0 & 0x80) !== 0;
            $blockType = $byte0 & 0x7F;
            $blockSize = (ord($header[1]) << 16) | (ord($header[2]) << 8) | ord($header[3]);

            if ($blockType === 0) { // STREAMINFO
                $info = fread($fp, $blockSize);
                if (strlen($info) >= 18) {
                    $sr_and_ch = (ord($info[10]) << 12) | (ord($info[11]) << 4) | ((ord($info[12]) & 0xF0) >> 4);
                    $data['sample_rate'] = $sr_and_ch;
                    $channels = (ord($info[12]) >> 1) & 0x07;
                    $bits = (((ord($info[12]) & 0x01) << 4) | (ord($info[13]) >> 4)) + 1;
                    $data['bit_depth'] = $bits;
                    
                    $totalSamples = ((ord($info[13]) & 0x0F) << 32) |
                                    (ord($info[14]) << 24) |
                                    (ord($info[15]) << 16) |
                                    (ord($info[16]) << 8) |
                                    ord($info[17]);
                    if ($data['sample_rate'] > 0) {
                        $data['duration'] = round($totalSamples / $data['sample_rate']);
                    }
                }
            } elseif ($blockType === 4) { // VORBIS_COMMENT
                $commentData = fread($fp, $blockSize);
                if (strlen($commentData) >= 4) {
                    $vendorLen = unpack('V', substr($commentData, 0, 4))[1];
                    $offset = 4 + $vendorLen;
                    if (strlen($commentData) >= $offset + 4) {
                        $numComments = unpack('V', substr($commentData, $offset, 4))[1];
                        $offset += 4;
                        for ($i = 0; $i < $numComments && $offset + 4 <= strlen($commentData); $i++) {
                            $len = unpack('V', substr($commentData, $offset, 4))[1];
                            $offset += 4;
                            if ($offset + $len <= strlen($commentData)) {
                                $comment = substr($commentData, $offset, $len);
                                $offset += $len;
                                $pair = explode('=', $comment, 2);
                                if (count($pair) === 2) {
                                    $key = strtoupper($pair[0]);
                                    $val = $pair[1];
                                    if ($key === 'TITLE') $data['title'] = $val;
                                    elseif ($key === 'ARTIST' || $key === 'ALBUMARTIST') $data['artist'] = $val;
                                    elseif ($key === 'ALBUM') $data['album'] = $val;
                                    elseif ($key === 'TRACKNUMBER') $data['track_number'] = (int)$val;
                                    elseif ($key === 'DATE' || $key === 'YEAR') $data['year'] = (int)substr($val, 0, 4);
                                }
                            }
                        }
                    }
                }
            } elseif ($blockType === 6) { // METADATA_BLOCK_PICTURE
                $picData = fread($fp, $blockSize);
                if (strlen($picData) >= 32) {
                    $picType = unpack('N', substr($picData, 0, 4))[1];
                    $mimeLen = unpack('N', substr($picData, 4, 4))[1];
                    $mime = substr($picData, 8, $mimeLen);
                    $offset = 8 + $mimeLen;
                    $descLen = unpack('N', substr($picData, $offset, 4))[1];
                    $offset += 4 + $descLen + 16; // skip desc, width(4), height(4), depth(4), colors(4)
                    if (strlen($picData) >= $offset + 4) {
                        $imgLen = unpack('N', substr($picData, $offset, 4))[1];
                        $offset += 4;
                        if ($imgLen > 0 && strlen($picData) >= $offset + $imgLen) {
                            $rawImg = substr($picData, $offset, $imgLen);
                            $cacheDir = is_dir('/data') ? '/data/covers' : sys_get_temp_dir() . '/christos_covers';
                            if (!is_dir($cacheDir)) @mkdir($cacheDir, 0777, true);
                            $ext = (stripos($mime, 'png') !== false) ? 'png' : 'jpg';
                            $cachePath = $cacheDir . '/art_' . md5($filepath) . '.' . $ext;
                            @file_put_contents($cachePath, $rawImg);
                            if (file_exists($cachePath) && filesize($cachePath) > 0) {
                                $data['art_path'] = $cachePath;
                            }
                        }
                    }
                }
            } else {
                fseek($fp, $blockSize, SEEK_CUR);
            }
        }
        fclose($fp);
        return $data;
    }

    private static function analyzeMp3($filepath, $data) {
        $fp = fopen($filepath, 'rb');
        if (!$fp) return $data;

        $header = fread($fp, 10);
        if (strlen($header) >= 10 && substr($header, 0, 3) === 'ID3') {
            $majorVersion = ord($header[3]);
            $tagSize = ((ord($header[6]) & 0x7F) << 21) |
                       ((ord($header[7]) & 0x7F) << 14) |
                       ((ord($header[8]) & 0x7F) << 7) |
                       (ord($header[9]) & 0x7F);

            $tagData = fread($fp, $tagSize);
            $offset = 0;
            $len = strlen($tagData);

            while ($offset < $len - 10) {
                if ($majorVersion === 3 || $majorVersion === 4) {
                    $frameId = substr($tagData, $offset, 4);
                    if (ord($frameId[0]) === 0) break;
                    
                    if ($majorVersion === 4) {
                        $frameSize = ((ord($tagData[$offset+4]) & 0x7F) << 21) |
                                     ((ord($tagData[$offset+5]) & 0x7F) << 14) |
                                     ((ord($tagData[$offset+6]) & 0x7F) << 7) |
                                     (ord($tagData[$offset+7]) & 0x7F);
                    } else {
                        $frameSize = (ord($tagData[$offset+4]) << 24) |
                                     (ord($tagData[$offset+5]) << 16) |
                                     (ord($tagData[$offset+6]) << 8) |
                                     ord($tagData[$offset+7]);
                    }
                    $offset += 10;
                    if ($frameSize <= 0 || $offset + $frameSize > $len) break;

                    $frameContent = substr($tagData, $offset, $frameSize);
                    $offset += $frameSize;
                    
                    $text = self::cleanId3Text($frameContent);
                    if ($frameId === 'TIT2') $data['title'] = $text;
                    elseif ($frameId === 'TPE1' || $frameId === 'TPE2') $data['artist'] = $text;
                    elseif ($frameId === 'TALB') $data['album'] = $text;
                    elseif ($frameId === 'TRCK') $data['track_number'] = (int)$text;
                    elseif ($frameId === 'TYER' || $frameId === 'TDRC') $data['year'] = (int)substr($text, 0, 4);
                } elseif ($majorVersion === 2) {
                    $frameId = substr($tagData, $offset, 3);
                    if (ord($frameId[0]) === 0) break;
                    $frameSize = (ord($tagData[$offset+3]) << 16) | (ord($tagData[$offset+4]) << 8) | ord($tagData[$offset+5]);
                    $offset += 6;
                    if ($frameSize <= 0 || $offset + $frameSize > $len) break;

                    $frameContent = substr($tagData, $offset, $frameSize);
                    $offset += $frameSize;

                    $text = self::cleanId3Text($frameContent);
                    if ($frameId === 'TT2') $data['title'] = $text;
                    elseif ($frameId === 'TP1') $data['artist'] = $text;
                    elseif ($frameId === 'TAL') $data['album'] = $text;
                    elseif ($frameId === 'TRK') $data['track_number'] = (int)$text;
                    elseif ($frameId === 'TYE') $data['year'] = (int)substr($text, 0, 4);
                } else {
                    break;
                }
            }
        }

        // Estimate MP3 duration based on size
        $fileSize = filesize($filepath);
        $data['duration'] = max(1, round($fileSize / (16000))); // default assumption ~128-256kbps
        fclose($fp);
        return $data;
    }

    private static function cleanId3Text($raw) {
        if (strlen($raw) <= 1) return '';
        $encoding = ord($raw[0]);
        $text = substr($raw, 1);
        if ($encoding === 1 || $encoding === 2) {
            $text = mb_convert_encoding($text, 'UTF-8', 'UTF-16');
        }
        return trim(str_replace("\0", '', $text));
    }

    private static function analyzeMp4($filepath, $data) {
        $fp = fopen($filepath, 'rb');
        if (!$fp) return $data;

        $fileSize = filesize($filepath);
        $data = self::parseMp4Atoms($fp, 0, $fileSize, $data);
        fclose($fp);
        return $data;
    }

    private static function parseMp4Atoms($fp, $offset, $endOffset, $data) {
        // Container atoms that we need to descend into
        $containers = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'ilst'];

        fseek($fp, $offset);
        while (ftell($fp) < $endOffset - 8) {
            $pos = ftell($fp);
            $header = fread($fp, 8);
            if (strlen($header) < 8) break;

            $size = unpack('N', substr($header, 0, 4))[1];
            $type = substr($header, 4, 4);

            // Handle 64-bit extended size
            if ($size === 1) {
                $ext = fread($fp, 8);
                if (strlen($ext) < 8) break;
                $size = unpack('J', $ext)[1];
                $headerSize = 16;
            } elseif ($size === 0) {
                // Atom extends to end of file
                $size = $endOffset - $pos;
                $headerSize = 8;
            } else {
                $headerSize = 8;
            }

            if ($size < $headerSize || $pos + $size > $endOffset) break;

            $atomDataStart = $pos + $headerSize;
            $atomDataEnd = $pos + $size;

            // meta atom has a 4-byte version/flags field before its children
            if ($type === 'meta') {
                $atomDataStart += 4;
                fseek($fp, $atomDataStart);
                $data = self::parseMp4Atoms($fp, $atomDataStart, $atomDataEnd, $data);
            }
            // Descend into container atoms
            elseif (in_array($type, $containers)) {
                fseek($fp, $atomDataStart);
                $data = self::parseMp4Atoms($fp, $atomDataStart, $atomDataEnd, $data);
            }
            // mvhd — movie header, contains duration and timescale
            elseif ($type === 'mvhd') {
                fseek($fp, $atomDataStart);
                $mvhdData = fread($fp, min(120, $atomDataEnd - $atomDataStart));
                if (strlen($mvhdData) >= 24) {
                    $version = ord($mvhdData[0]);
                    if ($version === 0) {
                        // version 0: 4-byte timescale at offset 12, 4-byte duration at offset 16
                        $timescale = unpack('N', substr($mvhdData, 12, 4))[1];
                        $dur = unpack('N', substr($mvhdData, 16, 4))[1];
                    } else {
                        // version 1: 4-byte timescale at offset 20, 8-byte duration at offset 24
                        $timescale = unpack('N', substr($mvhdData, 20, 4))[1];
                        $dur = unpack('J', substr($mvhdData, 24, 8))[1];
                    }
                    if ($timescale > 0 && $dur > 0) {
                        $data['duration'] = (int)round($dur / $timescale);
                    }
                }
            }
            // ilst item atoms: ©nam, ©ART, ©alb, ©day, trkn, etc.
            elseif (strlen($type) === 4 && (ord($type[0]) === 0xA9 || in_array($type, ['trkn', 'aART', 'covr', 'disk']))) {
                fseek($fp, $atomDataStart);
                $atomBody = fread($fp, min(8192, $atomDataEnd - $atomDataStart));
                // Find the 'data' sub-atom
                $dataPos = strpos($atomBody, 'data');
                if ($dataPos !== false && $dataPos >= 4 && $dataPos + 16 <= strlen($atomBody)) {
                    // data atom: 4-byte size before 'data', then 4-byte type flags, 4-byte locale, then value
                    $dataAtomSize = unpack('N', substr($atomBody, $dataPos - 4, 4))[1];
                    $val = substr($atomBody, $dataPos + 12, max(0, $dataAtomSize - 16));
                    if ($type === "\xA9nam" || $type === "\xC2\xA9nam") $data['title'] = trim($val);
                    elseif ($type === "\xA9ART" || $type === "\xC2\xA9ART" || $type === 'aART') $data['artist'] = trim($val);
                    elseif ($type === "\xA9alb" || $type === "\xC2\xA9alb") $data['album'] = trim($val);
                    elseif ($type === "\xA9day" || $type === "\xC2\xA9day") $data['year'] = (int)substr(trim($val), 0, 4);
                    elseif ($type === 'trkn' && strlen($val) >= 4) {
                        $data['track_number'] = unpack('n', substr($val, 2, 2))[1];
                    }
                }
            }
            // stsd — sample description, can extract codec info & bit depth
            elseif ($type === 'stsd') {
                fseek($fp, $atomDataStart);
                $stsdData = fread($fp, min(512, $atomDataEnd - $atomDataStart));
                // Check for 'alac' or 'mp4a' codec identifier
                $alacPos = strpos($stsdData, 'alac');
                if ($alacPos !== false) {
                    $data['format'] = 'alac';
                    // Check for ALACSpecificConfig atom after standard audio sample entry
                    // Standard audio entry is 28 or 36 bytes, then the child 'alac' atom (size:4, 'alac':4, version:4, config:24)
                    $subAlacPos = strpos($stsdData, 'alac', $alacPos + 4);
                    if ($subAlacPos !== false && $subAlacPos + 24 <= strlen($stsdData)) {
                        // After 'alac' (4 bytes) + version/flags (4 bytes) + frameLength (4 bytes) + compatibleVersion (1 byte):
                        // bitDepth is at offset 13 from 'alac'
                        $bitDepth = ord($stsdData[$subAlacPos + 13]);
                        if ($bitDepth >= 8 && $bitDepth <= 32) {
                            $data['bit_depth'] = $bitDepth;
                        }
                        // sampleRate is 4 bytes at offset 20 from 'alac'
                        $sr = unpack('N', substr($stsdData, $subAlacPos + 20, 4))[1];
                        if ($sr > 0 && $sr <= 384000) {
                            $data['sample_rate'] = $sr;
                        }
                    }
                } elseif (strpos($stsdData, 'mp4a') !== false) {
                    $data['format'] = 'aac';
                }

                // Fallback sample rate extraction from audio sample entry header (offset 24 from format fourcc)
                $codecPos = ($alacPos !== false) ? $alacPos : strpos($stsdData, 'mp4a');
                if ($codecPos !== false && ($data['sample_rate'] < 8000 || $data['sample_rate'] > 384000) && $codecPos + 26 <= strlen($stsdData)) {
                    $sr = unpack('n', substr($stsdData, $codecPos + 24, 2))[1];
                    if ($sr >= 8000 && $sr <= 384000) {
                        $data['sample_rate'] = $sr;
                    }
                }
            }

            // Move to next atom
            fseek($fp, $pos + $size);
        }

        return $data;
    }

    private static function analyzeWav($filepath, $data) {
        $fp = fopen($filepath, 'rb');
        if (!$fp) return $data;

        $header = fread($fp, 12);
        if (strlen($header) >= 12 && substr($header, 0, 4) === 'RIFF' && substr($header, 8, 4) === 'WAVE') {
            while (!feof($fp)) {
                $chunkHeader = fread($fp, 8);
                if (strlen($chunkHeader) < 8) break;
                $id = substr($chunkHeader, 0, 4);
                $size = unpack('V', substr($chunkHeader, 4, 4))[1];

                if ($id === 'fmt ') {
                    $fmt = fread($fp, $size);
                    if (strlen($fmt) >= 16) {
                        $channels = unpack('v', substr($fmt, 2, 2))[1];
                        $data['sample_rate'] = unpack('V', substr($fmt, 4, 4))[1];
                        $data['bit_depth'] = unpack('v', substr($fmt, 14, 2))[1];
                    }
                } elseif ($id === 'data') {
                    if (!empty($data['sample_rate']) && !empty($data['bit_depth']) && !empty($channels)) {
                        $bytesPerSec = $data['sample_rate'] * $channels * ($data['bit_depth'] / 8);
                        if ($bytesPerSec > 0) {
                            $data['duration'] = round($size / $bytesPerSec);
                        }
                    }
                    fseek($fp, $size, SEEK_CUR);
                } else {
                    fseek($fp, $size, SEEK_CUR);
                }
            }
        }
        fclose($fp);
        return $data;
    }
}
?>