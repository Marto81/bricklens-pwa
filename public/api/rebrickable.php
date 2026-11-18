<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$secretsPath = dirname(__DIR__, 2) . '/bricklens-secrets.php';
$secrets = is_file($secretsPath) ? (array) include $secretsPath : [];
$apiKey = (string) (getenv('REBRICKABLE_API_KEY') ?: ($secrets['REBRICKABLE_API_KEY'] ?? ''));

if ($apiKey === '') {
    echo json_encode(['configured' => false, 'provider' => 'rebrickable', 'results' => []]);
    exit;
}

function rb_get(string $path, string $apiKey): ?array {
    $ch = curl_init('https://rebrickable.com/api/v3/lego' . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Authorization: key ' . $apiKey,
        ],
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($raw === false || $code < 200 || $code >= 300) return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function infer_part_category(string $name): string {
    $n = strtolower($name);
    if (preg_match('/(helmet|hair|hat|hood|cap|crown|mask|headgear|visor|beanie)/', $n)) return 'headgear';
    if (preg_match('/(minifig head|\bhead\b|cabeza)/', $n) && !preg_match('/(headdress|headgear)/', $n)) return 'head';
    if (preg_match('/(torso|body|upper)/', $n)) return 'torso';
    if (preg_match('/(hips|legs|skirt|dress|lower|tail)/', $n)) return 'legs';
    return 'accessory';
}

$action = $_GET['action'] ?? 'minifig';

if ($action === 'search') {
    $q = trim(substr((string) ($_GET['q'] ?? ''), 0, 80));
    if (strlen($q) < 2) {
        echo json_encode(['configured' => true, 'results' => []]);
        exit;
    }
    $data = rb_get('/minifigs/?search=' . rawurlencode($q) . '&page_size=12', $apiKey);
    $results = [];
    foreach (($data['results'] ?? []) as $row) {
        $results[] = [
            'rebrickableId' => (string) ($row['set_num'] ?? ''),
            'name' => (string) ($row['name'] ?? ''),
            'numParts' => (int) ($row['num_parts'] ?? 4),
            'imageUrl' => (string) ($row['set_img_url'] ?? ''),
        ];
    }
    header('Cache-Control: public, max-age=3600');
    echo json_encode(['configured' => true, 'results' => $results]);
    exit;
}

if ($action === 'part_minifigs') {
    $partNum = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($_GET['part'] ?? ''));
    if ($partNum === '') {
        echo json_encode(['configured' => true, 'partNum' => '', 'minifigs' => []]);
        exit;
    }
    $partInfo = rb_get('/parts/' . rawurlencode($partNum) . '/', $apiKey);
    $colorsData = rb_get('/parts/' . rawurlencode($partNum) . '/colors/?page_size=8', $apiKey);
    $minifigs = [];
    foreach (array_slice(($colorsData['results'] ?? []), 0, 4) as $col) {
        $cid = (int) ($col['color_id'] ?? 0);
        $setsData = rb_get('/parts/' . rawurlencode($partNum) . '/colors/' . $cid . '/sets/?page_size=25', $apiKey);
        foreach (($setsData['results'] ?? []) as $s) {
            $sn = (string) ($s['set_num'] ?? '');
            if (str_starts_with($sn, 'fig-')) {
                $minifigs[$sn] = [
                    'rebrickableId' => $sn,
                    'name' => (string) ($s['name'] ?? $sn),
                    'numParts' => (int) ($s['num_parts'] ?? 4),
                    'imageUrl' => (string) ($s['set_img_url'] ?? ''),
                ];
            }
        }
    }
    header('Cache-Control: public, max-age=3600');
    echo json_encode([
        'configured' => true,
        'partNum' => $partNum,
        'partName' => (string) ($partInfo['name'] ?? $partNum),
        'partImageUrl' => (string) ($partInfo['part_img_url'] ?? ''),
        'minifigs' => array_slice(array_values($minifigs), 0, 16),
    ]);
    exit;
}

$rawId = trim(substr((string) ($_GET['id'] ?? ''), 0, 48));
if ($rawId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing id']);
    exit;
}

$minifigRow = null;
if (str_starts_with(strtolower($rawId), 'fig-')) {
    $minifigRow = rb_get('/minifigs/' . rawurlencode(strtolower($rawId)) . '/', $apiKey);
}
if (!$minifigRow) {
    $search = rb_get('/minifigs/?search=' . rawurlencode($rawId) . '&page_size=5', $apiKey);
    $minifigRow = $search['results'][0] ?? null;
}
if (!$minifigRow || empty($minifigRow['set_num'])) {
    echo json_encode(['configured' => true, 'found' => false, 'id' => $rawId]);
    exit;
}

$setNum = (string) $minifigRow['set_num'];
$partsRes = rb_get('/minifigs/' . rawurlencode($setNum) . '/parts/?page_size=40', $apiKey);
$setsRes = rb_get('/minifigs/' . rawurlencode($setNum) . '/sets/?page_size=12', $apiKey);

$parts = [];
foreach (($partsRes['results'] ?? []) as $entry) {
    $p = $entry['part'] ?? [];
    $c = $entry['color'] ?? [];
    $blIds = $p['external_ids']['BrickLink'] ?? [];
    $partNum = (string) ($blIds[0] ?? $p['part_num'] ?? 'part');
    $name = (string) ($p['name'] ?? 'Pieza LEGO');
    $parts[] = [
        'partNum' => $partNum,
        'rebrickablePartNum' => (string) ($p['part_num'] ?? $partNum),
        'name' => $name,
        'category' => infer_part_category($name),
        'colorName' => (string) ($c['name'] ?? ''),
        'quantity' => (int) ($entry['quantity'] ?? 1),
        'imageUrl' => (string) ($p['part_img_url'] ?? ''),
    ];
}

$sets = [];
$years = [];
foreach (($setsRes['results'] ?? []) as $s) {
    $yr = (int) ($s['year'] ?? 0);
    if ($yr >= 1978 && $yr <= 2030) $years[] = $yr;
    $sets[] = [
        'setNum' => (string) ($s['set_num'] ?? ''),
        'name' => (string) ($s['name'] ?? ''),
        'year' => $yr,
        'imageUrl' => (string) ($s['set_img_url'] ?? ''),
    ];
}
sort($years);

header('Cache-Control: public, max-age=21600');
echo json_encode([
    'configured' => true,
    'found' => true,
    'rebrickableId' => $setNum,
    'name' => (string) ($minifigRow['name'] ?? $rawId),
    'numParts' => (int) ($minifigRow['num_parts'] ?? count($parts) ?: 4),
    'imageUrl' => (string) ($minifigRow['set_img_url'] ?? ''),
    'yearReleased' => $years[0] ?? null,
    'appearsInSets' => count($sets),
    'sampleSetCode' => !empty($sets[0]) ? ($sets[0]['setNum'] . ' (' . $sets[0]['name'] . ')') : null,
    'sets' => $sets,
    'parts' => $parts,
]);
