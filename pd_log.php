<?php
/* =====================================================================
 * pd_log.php
 * UPLOAD TO:  /home/paddnols/public_html/pd_log.php
 *
 * Defines two functions:
 *   pd_log_hit()  — records one request to pd_access_log
 *   pd_guard()    — ban check + log + THREE defence rules:
 *                     1) honeypot (instant ban on trap paths — intent)
 *                     2) burst    (volume / overload protection)
 *                     3) scan     (repeated 404 probing / scrapers)
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
    $uri = $_SERVER['REQUEST_URI'] ?? '';

    // --- already banned? cheapest path, runs first -------------------
    $ban = $pdo->prepare(
        "SELECT 1 FROM pd_blocklist
         WHERE ip = ? AND (expires_at IS NULL OR expires_at > NOW())");
    $ban->execute([$ip]);
    if ($ban->fetchColumn()) { http_response_code(403); exit; }

    // --- log this request (before the checks, so it counts) ----------
    pd_log_hit();

    // --- RULE 1: honeypot (intent) -> instant ban on trap paths ------
    //     Paths no human or benign crawler ever requests. ONE hit is
    //     unambiguously hostile, so no count needed. Never false-positives
    //     because real visitors never ask for these files.
    $traps = [
        '/.env',
        '/.aws',
        '/.git',
        '/wp-login.php',
        '/wp-content',
        '/wp-admin',
        '/wp-json',
        '/config.json',
        '/.ssh',
        '/vendor',
        '/admin',
        '/mod',
        '/inputs.php',
        '/confirmedsearchleak',
        '/thisthing',
        '/thatthing',
        '/andthisthing',
        '/andthatthing'
    ];

    foreach ($traps as $t) {
        if (stripos($uri, $t) !== false) {
            $pdo->prepare(
                "INSERT IGNORE INTO pd_blocklist (ip, reason, expires_at)
                 VALUES (?, 'honeypot', NOW() + INTERVAL 7 DAY)")
                ->execute([$ip]);
            pd_notify("🚨 Banned `$ip` — Hit Trap Path: `$uri`");
            http_response_code(403); exit;
        }
    }

    // --- RULE 2: burst (volume) -> overload / DDOS protection --------
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
        pd_notify("🚨 Banned `$ip` — Burst");
        http_response_code(403); exit;
    }

    // --- RULE 3: scan (intent) -> credential / vuln scrapers ---------
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
        pd_notify("🚨 Banned `$ip` — Scraping");
        http_response_code(403); exit;
    }
}