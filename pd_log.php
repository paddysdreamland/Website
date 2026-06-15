<?php
/* =====================================================================
 * pd_log.php
 * UPLOAD TO:  /home/paddnols/public_html/pd_log.php
 *
 * The logger. Called once per request by your index.php glue.
 * Upload as-is — no editing needed.
 * ===================================================================== */

function pd_log_hit(): void {
    try {
        pd_pdo()->prepare(
            "INSERT INTO pd_access_log (ip, method, uri, user_agent, status)
             VALUES (?,?,?,?,?)"
        )->execute([
            $_SERVER['REMOTE_ADDR']    ?? '',
            $_SERVER['REQUEST_METHOD'] ?? '',
            substr($_SERVER['REQUEST_URI'] ?? '', 0, 512),
            substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 512) ?: null,
            http_response_code() ?: null,
        ]);
    } catch (Throwable $e) { /* logging must never break the page */ }
}

function pd_guard(): void {
    $pdo = pd_pdo();
    $ip  = $_SERVER['REMOTE_ADDR'] ?? '';

    // banned? cheapest path, runs first
    $ban = $pdo->prepare(
        "SELECT 1 FROM pd_blocklist
         WHERE ip = ? AND (expires_at IS NULL OR expires_at > NOW())");
    $ban->execute([$ip]);
    if ($ban->fetchColumn()) { http_response_code(403); exit; }

    pd_log_hit();

    // burst from this IP in the last 20s?
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
}