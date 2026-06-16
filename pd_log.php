<?php
/* =====================================================================
 * pd_log.php
 * UPLOAD TO:  /home/paddnols/public_html/pd_log.php
 *
 * Defines two functions:
 *   pd_log_hit()  — records one request to pd_access_log
 *   pd_guard()    — ban check + log + TWO defence rules:
 *                     1) burst   (volume / overload protection)
 *                     2) scan    (repeated 404 probing / scrapers)
 *
 * Called by index.php (page loads) and notfound.php (404s).
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

    // --- already banned? cheapest path, runs first -------------------
    $ban = $pdo->prepare(
        "SELECT 1 FROM pd_blocklist
         WHERE ip = ? AND (expires_at IS NULL OR expires_at > NOW())");
    $ban->execute([$ip]);
    if ($ban->fetchColumn()) { http_response_code(403); exit; }

    // --- log this request (must happen before the checks below, so
    //     the current request counts toward the totals) --------------
    pd_log_hit();

    // --- RULE 1: burst (volume) -> overload / DDOS protection --------
    //     5+ requests from one IP within 20 seconds.
    //     Short 24h ban — often just an impatient real person.
    $burst = $pdo->prepare(
        "SELECT COUNT(*) FROM pd_access_log
         WHERE ip = ? AND created_at > (NOW() - INTERVAL 20 SECOND)");
    $burst->execute([$ip]);
    if ((int)$burst->fetchColumn() > 8) {
        $pdo->prepare(
            "INSERT IGNORE INTO pd_blocklist (ip, reason, expires_at)
             VALUES (?, 'burst', NOW() + INTERVAL 24 HOUR)")
            ->execute([$ip]);
        pd_notify("\🚨 Banned `$ip` — Too Many Requests");
        http_response_code(403); exit;
    }

    // --- RULE 2: scan (intent) -> credential / vuln scrapers ---------
    //     5+ "file not found" (404) hits from one IP within 10 minutes.
    //     Patient window catches slow scanners that dodge the burst rule.
    //     Longer 7-day ban — a real visitor never probes 5 missing files.
    $miss = $pdo->prepare(
        "SELECT COUNT(*) FROM pd_access_log
         WHERE ip = ? AND status = 404
           AND created_at > (NOW() - INTERVAL 10 MINUTE)");
    $miss->execute([$ip]);
    if ((int)$miss->fetchColumn() >= 4) {
        $pdo->prepare(
            "INSERT IGNORE INTO pd_blocklist (ip, reason, expires_at)
             VALUES (?, 'scan', NOW() + INTERVAL 7 DAY)")
            ->execute([$ip]);
        pd_notify("\🚨 Banned `$ip` — Scraping");
        http_response_code(403); exit;
    }
}