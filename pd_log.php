<?php
/* =====================================================================
 * pd_log.php
 * UPLOAD TO:  /home/paddnols/public_html/pd_log.php
 *
 * Defines:
 *   pd_log_hit()    — records one request to pd_access_log
 *   pd_bomb_armed() — is the gzip bomb currently live?
 *   pd_send_bomb()  — streams the gzip bomb to the client, then exits
 *   pd_guard()      — ban check + log + THREE defence rules:
 *                       1) honeypot (instant ban on trap paths — intent)
 *                       2) burst    (volume / overload protection)
 *                       3) scan     (repeated 404 probing / scrapers)
 *
 * On a honeypot hit the attacker is banned AND — if the bomb is armed —
 * served a ~10 GB gzip bomb instead of a plain 403. Because the ban check
 * runs first, every later request from that IP gets the cheap 403, so the
 * bomb only ever goes out ONCE per IP per ban window.
 *
 * Called by index.php (page loads) and notfound.php (404s).
 * Upload as-is — no editing needed.
 * ===================================================================== */

/* ---- bomb config ---------------------------------------------------
 * PD_BOMB_ENABLED : master switch. false => honeypot reverts to clean 403.
 * PD_BOMB_FILE    : the pre-built gzip bomb. Kept OUTSIDE public_html so
 *                   nobody can fetch it directly — it only ever leaves the
 *                   server through pd_send_bomb(). Build it with:
 *                     dd if=/dev/zero bs=1M count=10240 | gzip -9 > 10G.gz
 *                   then drop 10G.gz in /home/paddnols/ (one level up).
 * ------------------------------------------------------------------ */
const PD_BOMB_ENABLED = true;
define('PD_BOMB_FILE', dirname(__DIR__) . '/10G.gz');   // /home/paddnols/10G.gz

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

/* ---- bomb: armed? --------------------------------------------------
 * Live only if the switch is on AND the payload actually exists. If the
 * file is missing we quietly fall back to a normal 403 — never a broken
 * response. To toggle the bomb live WITHOUT editing this file, replace
 * the PD_BOMB_ENABLED check with a sentinel file you create/delete in
 * cPanel, e.g.:
 *     return is_readable(__DIR__ . '/bomb.armed') && is_readable(PD_BOMB_FILE);
 * ------------------------------------------------------------------ */
function pd_bomb_armed(): bool {
    return PD_BOMB_ENABLED && is_readable(PD_BOMB_FILE);
}

/* ---- bomb: deliver --------------------------------------------------
 * Streams the pre-gzipped payload as if it were an ordinary compressed
 * 200 response. No 403 here on purpose — a 403 makes a scanner bail; we
 * want it to ingest the payload and inflate itself into oblivion.
 * readfile() streams, so OUR memory stays flat regardless of size.
 * ------------------------------------------------------------------ */
function pd_send_bomb(): void {
    @ini_set('zlib.output_compression', '0');               // don't let the host re-compress
    if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
    while (ob_get_level() > 0) ob_end_clean();              // drop any buffering

    header('Content-Encoding: gzip');
    header('Content-Type: text/html; charset=UTF-8');
    header('Content-Length: ' . filesize(PD_BOMB_FILE));
    header('Cache-Control: no-store');

    readfile(PD_BOMB_FILE);
    exit;
}

function pd_guard(): void {
    $pdo = pd_pdo();
    $ip  = $_SERVER['REMOTE_ADDR'] ?? '';
    $uri = $_SERVER['REQUEST_URI'] ?? '';

    // --- already banned? cheapest path, runs first -------------------
    //     This is also what caps the bomb to ONE delivery per IP: once
    //     an attacker is here in the blocklist, they never reach Rule 1
    //     again, so they get a free 403 instead of another 10 MB.
    $ban = $pdo->prepare(
        "SELECT 1 FROM pd_blocklist
         WHERE ip = ? AND (expires_at IS NULL OR expires_at > NOW())");
    $ban->execute([$ip]);
    if ($ban->fetchColumn()) { http_response_code(403); exit; }

    // --- log this request (before the checks, so it counts) ----------
    pd_log_hit();

    // --- RULE 1: honeypot (intent) -> instant ban (+ bomb) -----------
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
        if (stripos($uri, $t) === false) continue;

        $pdo->prepare(
            "INSERT IGNORE INTO pd_blocklist (ip, reason, expires_at)
             VALUES (?, 'honeypot', NOW() + INTERVAL 7 DAY)")
            ->execute([$ip]);

        // Armed? Bomb them and stop here (pd_send_bomb exits).
        if (pd_bomb_armed()) {
            pd_notify("💣 Bombed `$ip` — Hit Trap Path: `$uri`");
            pd_send_bomb();
        }

        // Disarmed (or no payload): the original clean 403.
        pd_notify("🚨 Banned `$ip` — Hit Trap Path: `$uri`");
        http_response_code(403); exit;
    }

    // --- RULE 2: burst (volume) -> overload / DDOS protection --------
    //     5+ requests from one IP within 20 seconds.
    //     Short 24h ban — often just an impatient real person.
    //     NO BOMB here on purpose: never drop 10 GB on a maybe-human.
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
    //     Kept as a clean 403 by default. To bomb scanners too, wrap the
    //     exit below the same way Rule 1 does:
    //         if (pd_bomb_armed()) { pd_notify("💣 …"); pd_send_bomb(); }
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