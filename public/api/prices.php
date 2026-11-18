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

$figId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) ($_GET['figId'] ?? ''));
$name = trim(substr((string) ($_GET['name'] ?? ''), 0, 80));
$condition = (string) ($_GET['condition'] ?? 'used_complete');

if ($figId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing figId']);
    exit;
}

$secretsPath = dirname(__DIR__, 2) . '/bricklens-secrets.php';
$secrets = is_file($secretsPath) ? (array) include $secretsPath : [];
$env = static function (string $key) use ($secrets): string {
    $v = getenv($key);
    if ($v !== false && $v !== '') return (string) $v;
    return isset($secrets[$key]) ? (string) $secrets[$key] : '';
};

$brickowlKey = $env('BRICKOWL_API_KEY');
$ebayId = $env('EBAY_CLIENT_ID');
$ebaySecret = $env('EBAY_CLIENT_SECRET');
$ebayMarketplace = $env('EBAY_MARKETPLACE_ID') ?: 'EBAY_ES';

$liveQuotes = [];

if ($brickowlKey !== '') {
    $ch = curl_init(
        'https://api.brickowl.com/v1/catalog/id_lookup?key=' . rawurlencode($brickowlKey) .
        '&id=' . rawurlencode($figId) . '&type=Minifigure&id_type=bl_id'
    );
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
    $raw = curl_exec($ch);
    curl_close($ch);
    $lookup = $raw ? json_decode($raw, true) : null;
    $boid = $lookup['boids'][0] ?? null;
    if ($boid) {
        $ch2 = curl_init(
            'https://api.brickowl.com/v1/catalog/availability?key=' . rawurlencode($brickowlKey) .
            '&boid=' . rawurlencode((string) $boid) . '&country=ES'
        );
        curl_setopt_array($ch2, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
        $raw2 = curl_exec($ch2);
        curl_close($ch2);
        $avail = $raw2 ? json_decode($raw2, true) : null;
        if (is_array($avail)) {
            $wantNew = $condition === 'new';
            $prices = [];
            foreach ($avail as $entry) {
                if (!is_array($entry)) continue;
                $isNew = str_starts_with(strtolower((string) ($entry['con'] ?? '')), 'new');
                if ($wantNew !== $isNew) continue;
                $p = (float) ($entry['price'] ?? 0);
                if ($p > 0.2 && $p < 10000) $prices[] = $p;
            }
            if (!empty($prices)) {
                sort($prices);
                $trimmed = count($prices) >= 6 ? array_slice($prices, 1, -1) : $prices;
                $avg = array_sum($trimmed) / count($trimmed);
                $liveQuotes['brickowl'] = [
                    'minPriceEur' => round($prices[0], 2),
                    'avgPriceEur' => round($avg, 2),
                    'maxPriceEur' => round($prices[count($prices) - 1], 2),
                    'soldAvg6mEur' => round($avg * 0.96, 2),
                    'activeListingsCount' => count($prices),
                ];
            }
        }
    }
}

if ($ebayId !== '' && $ebaySecret !== '') {
    $ch = curl_init('https://api.ebay.com/identity/v1/oauth2/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            'Authorization: Basic ' . base64_encode($ebayId . ':' . $ebaySecret),
            'Content-Type: application/x-www-form-urlencoded',
        ],
        CURLOPT_POSTFIELDS => 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    ]);
    $tokenRaw = curl_exec($ch);
    curl_close($ch);
    $tokenJson = $tokenRaw ? json_decode($tokenRaw, true) : null;
    $accessToken = $tokenJson['access_token'] ?? null;

    if ($accessToken) {
        $cleanName = trim(preg_split('/[—(]/u', $name)[0] ?? '');
        $q = trim('LEGO ' . $figId . ' ' . substr($cleanName, 0, 40));
        $condFilter = $condition === 'new' ? 'conditions:{NEW}' : 'conditions:{USED}';
        $searchUrl = 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=' . rawurlencode($q) .
            '&limit=25&filter=' . rawurlencode('deliveryCountry:ES,' . $condFilter);
        $ch2 = curl_init($searchUrl);
        curl_setopt_array($ch2, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $accessToken,
                'X-EBAY-C-MARKETPLACE-ID: ' . $ebayMarketplace,
            ],
        ]);
        $searchRaw = curl_exec($ch2);
        curl_close($ch2);
        $searchJson = $searchRaw ? json_decode($searchRaw, true) : null;
        $prices = [];
        foreach (($searchJson['itemSummaries'] ?? []) as $item) {
            $val = (float) ($item['price']['value'] ?? 0);
            $cur = strtoupper((string) ($item['price']['currency'] ?? 'EUR'));
            if ($val <= 0.5 || $val > 10000) continue;
            $eur = $cur === 'USD' ? $val * 0.92 : ($cur === 'GBP' ? $val * 1.17 : $val);
            $prices[] = $eur;
        }
        if (!empty($prices)) {
            sort($prices);
            $trimmed = count($prices) >= 6 ? array_slice($prices, 1, -1) : $prices;
            $avg = array_sum($trimmed) / count($trimmed);
            $liveQuotes['ebay'] = [
                'minPriceEur' => round($prices[0], 2),
                'avgPriceEur' => round($avg, 2),
                'maxPriceEur' => round($prices[count($prices) - 1], 2),
                'soldAvg6mEur' => round($avg * 0.92, 2),
                'activeListingsCount' => (int) ($searchJson['total'] ?? count($prices)),
            ];
        }
    }
}

header('Cache-Control: public, max-age=1800');
echo json_encode([
    'figId' => $figId,
    'condition' => $condition,
    'configured' => ($brickowlKey !== '') || ($ebayId !== '' && $ebaySecret !== ''),
    'providers' => [
        'brickowl' => $brickowlKey !== '',
        'ebay' => $ebayId !== '' && $ebaySecret !== '',
    ],
    'liveQuotes' => (object) $liveQuotes,
    'fetchedAtIso' => gmdate('c'),
]);
