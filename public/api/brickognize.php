<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit;
}

if (!isset($_FILES['query_image']) || $_FILES['query_image']['error'] !== UPLOAD_ERR_OK) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(400);
    echo json_encode(['error' => 'Missing required form-data field: query_image']);
    exit;
}

$requestedMode = $_GET['mode'] ?? 'figs';
$mode = in_array($requestedMode, ['figs', 'parts'], true) ? $requestedMode : 'figs';
$topK = isset($_GET['top_k_items']) ? max(1, min(50, (int) $_GET['top_k_items'])) : 12;
$minSim = isset($_GET['min_similarity_items']) ? max(0.05, min(1.0, (float) $_GET['min_similarity_items'])) : 0.2;

$tmpPath = $_FILES['query_image']['tmp_name'];
$mimeType = $_FILES['query_image']['type'] ?: 'image/jpeg';
$fileName = $_FILES['query_image']['name'] ?: 'minifig_scan.jpg';

$ch = curl_init("https://api.brickognize.com/predict/{$mode}/?top_k_items={$topK}&min_similarity_items={$minSim}");
$cfile = new CURLFile($tmpPath, $mimeType, $fileName);

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => ['query_image' => $cfile],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => ['Accept: application/json'],
]);

$response = curl_exec($ch);
$httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => $curlErr ?: 'Upstream Brickognize proxy error']);
    exit;
}

http_response_code($httpCode > 0 ? $httpCode : 200);
echo $response;
