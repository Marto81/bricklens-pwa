<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Carga opcional de archivo privado fuera de public_html (ej: ../bricklens-secrets.php)
$secretsPath = dirname(__DIR__, 2) . '/bricklens-secrets.php';
$secrets = is_file($secretsPath) ? (array) include $secretsPath : [];

$env = static function (string $key) use ($secrets): string {
    $v = getenv($key);
    if ($v !== false && $v !== '') return (string) $v;
    return isset($secrets[$key]) ? (string) $secrets[$key] : '';
};

echo json_encode([
    'ok' => true,
    'status' => 'ok',
    'runtime' => 'php',
    'service' => 'BrickLens PWA Proxy v2 (PHP)',
    'providers' => [
        'brickognize' => true,
        'rebrickable' => $env('REBRICKABLE_API_KEY') !== '',
        'brickowl' => $env('BRICKOWL_API_KEY') !== '',
        'ebay' => $env('EBAY_CLIENT_ID') !== '' && $env('EBAY_CLIENT_SECRET') !== '',
    ],
    'timestamp' => gmdate('c'),
]);
