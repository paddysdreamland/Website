<?php
declare(strict_types=1);

// auth/unlink.php  —  let a user delete their stored data (GDPR).
// POST only, so it can't be triggered by a stray <img> or link (basic CSRF guard).

$config = require dirname(__DIR__, 2) . '/private/pd_config.php';
require dirname(__DIR__, 2) . '/private/pd_lib.php';

header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

$pdo  = pd_db($config);
$user = pd_current_user($pdo);
if (!$user) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
    exit;
}

// Deleting the user cascades to pd_sessions via the foreign key.
// NOTE: when you build the reactions table (also keyed on discord_id),
// either add it to the cascade or delete those rows here too.
$stmt = $pdo->prepare('DELETE FROM pd_users WHERE discord_id = ?');
$stmt->execute([$user['discord_id']]);

pd_clear_cookie('pd_session');
echo json_encode(['ok' => true]);
