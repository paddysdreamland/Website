<?php
declare(strict_types=1);

// auth/logout.php  —  end the current session.
// Works as a fetch() ping (returns JSON) or a plain link (redirects home).

$config = require dirname(__DIR__, 2) . '/private/pd_config.php';
require dirname(__DIR__, 2) . '/private/pd_lib.php';

$pdo = pd_db($config);

if (!empty($_COOKIE['pd_session'])) {
    $hash = hash('sha256', $_COOKIE['pd_session']);
    $stmt = $pdo->prepare('DELETE FROM pd_sessions WHERE token_hash = ?');
    $stmt->execute([$hash]);
}
pd_clear_cookie('pd_session');

$accept = $_SERVER['HTTP_ACCEPT'] ?? '';
if ($accept !== '' && strpos($accept, 'application/json') !== false) {
    header('Content-Type: application/json');
    echo json_encode(['ok' => true]);
} else {
    header('Location: ' . rtrim($config['app_url'], '/') . '/');
}
exit;
