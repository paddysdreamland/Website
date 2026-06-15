<?php
require '/home/paddnols/private/pd_mon_config.php';
require __DIR__ . '/pd_log.php';
$pdo = pd_pdo();
$ip  = $_SERVER['REMOTE_ADDR'] ?? '';

$ban = $pdo->prepare(
    "SELECT 1 FROM pd_blocklist
     WHERE ip = ? AND (expires_at IS NULL OR expires_at > NOW())");
$ban->execute([$ip]);
if ($ban->fetchColumn()) { http_response_code(403); exit; }

pd_log_hit();

$c = $pdo->prepare(
    "SELECT COUNT(*) FROM pd_access_log
     WHERE ip = ? AND created_at > (NOW() - INTERVAL 20 SECOND)");
$c->execute([$ip]);

if ((int)$c->fetchColumn() > 4) {
    $pdo->prepare(
        "INSERT IGNORE INTO pd_blocklist (ip, reason, expires_at)
         VALUES (?, 'burst', NOW() + INTERVAL 24 HOUR)")
        ->execute([$ip]);
    pd_notify("🚨 banned `$ip` — burst");
    http_response_code(403); exit;
}

http_response_code(204); // "done, nothing to send back"