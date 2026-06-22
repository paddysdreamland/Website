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
 * VICTIM PROTECTION (Sec-Fetch-Site):
 *   A real browser ALWAYS sends Sec-Fetch-Site; curl / python / scanner
 *   tooling does not. An attacker can't reflect the bomb at a stranger
 *   (TCP can't be source-spoofed), but they CAN embed a trap URL in an
 *   <img>/<iframe> or post the bare link, so a MEMBER's own browser fires
 *   the request and eats the ban/bomb. We defuse that everywhere:
 *     - honeypot: any browser request to a trap -> quiet 404, no punishment
 *     - scan/burst: cross-site / same-site requests don't count toward a ban
 *   so an embedded trap can't trip ANY of the three rules. Direct scanners
 *   (no Sec-Fetch header) are caught exactly as before; a headless-Chromium
 *   scanner dodges the instant honeypot ban but its 404s still accumulate
 *   into the scan rule.
 *
 * REQUIRES these columns on pd_access_log:
 *   ALTER TABLE pd_access_log
 *     ADD COLUMN referer    VARCHAR(512) NULL AFTER user_agent,
 *     ADD COLUMN fetch_site VARCHAR(20)  NULL AFTER referer;
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
 *                   To toggle live without editing this file, swap the
 *                   PD_BOMB_ENABLED check in pd_bomb_armed() for a sentinel:
 *                     is_readable(__DIR__ . '/bomb.armed')
 * ------------------------------------------------------------------ */
const PD_BOMB_ENABLED = true;
define('PD_BOMB_FILE', dirname(__DIR__) . '/10G.gz');   // /home/paddnols/10G.gz

/* ---- which Sec-Fetch-Site values are "initiated from off-site" -----
 * These are the embed/weaponization signatures. They must never count
 * toward a ban, because a member's browser made them under someone
 * else's instructions, not their own.
 * ------------------------------------------------------------------ */
const PD_OFFSITE_FETCH = ['cross-site', 'same-site'];

function pd_log_hit(): void {
    try {
        pd_pdo()->prepare(
            "INSERT INTO pd_access_log (ip, method, uri, user_agent, referer, fetch_site, status)
             VALUES (?,?,?,?,?,?,?)"
        )->execute([
            $_SERVER['REMOTE_ADDR']    ?? '',
            $_SERVER['REQUEST_METHOD'] ?? '',
            substr($_SERVER['REQUEST_URI'] ?? '', 0, 512),
            substr($_SERVER['HTTP_USER_AGENT']    ?? '', 0, 512) ?: null,
            substr($_SERVER['HTTP_REFERER']       ?? '', 0, 512) ?: null,
            substr($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '', 0, 20) ?: null,
            http_response_code() ?: null,
        ]);
    } catch (Throwable $e) { /* logging must never break the page */ }
}

/* ---- bomb: armed? --------------------------------------------------
 * Live only if the switch is on AND the payload actually exists. Missing
 * file => quiet fall back to a normal 403, never a broken response.
 * ------------------------------------------------------------------ */
function pd_bomb_armed(): bool {
    return PD_BOMB_ENABLED && is_readable(PD_BOMB_FILE);
}

/* ---- bomb: deliver --------------------------------------------------
 * Streams the pre-gzipped payload as an ordinary compressed 200. No 403
 * here on purpose — a 403 makes a scanner bail; we want it to ingest the
 * payload and inflate itself into oblivion. readfile() streams, so OUR
 * memory stays flat regardless of size.
 * ------------------------------------------------------------------ */
function pd_send_bomb(): void {
    @ini_set('zlib.output_compression', '0');
    if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
    while (ob_get_level() > 0) ob_end_clean();

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
    //     Also caps the bomb to ONE delivery per IP: once banned, an
    //     attacker never reaches Rule 1 again, just a free 403.
    $ban = $pdo->prepare(
        "SELECT 1 FROM pd_blocklist
         WHERE ip = ? AND (expires_at IS NULL OR expires_at > NOW())");
    $ban->execute([$ip]);
    if ($ban->fetchColumn()) { http_response_code(403); exit; }

    // --- log this request (before the checks, so it counts) ----------
    pd_log_hit();

    // --- is this a real browser? (Sec-Fetch-Site only exists on browsers)
    $browserRequest = isset($_SERVER['HTTP_SEC_FETCH_SITE']);

    // --- RULE 1: honeypot (intent) -> instant ban (+ bomb) -----------
    //     Paths no human or benign crawler ever requests. ONE hit from a
    //     non-browser is unambiguously hostile. A BROWSER hitting a trap,
    //     though, is a member tricked via an embedded <img>/<iframe> or a
    //     posted link — never punish them; quiet 404 instead.
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

        if ($browserRequest) {
            // A member's browser was sent here, not a scanner. Don't ban,
            // don't bomb. If it arrived cross-site, that's the embed
            // signature — tip Paddy off that someone may be weaponizing
            // a trap, then 404 the victim harmlessly.
            $fs = strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
            if (in_array($fs, PD_OFFSITE_FETCH, true)) {
                $ref = $_SERVER['HTTP_REFERER'] ?? '(referrer hidden)';
                pd_notify("⚠️ Trap weaponization? Victim `$ip` → `$uri` (Embedded on `$ref`)");
            }
            http_response_code(404); exit;
        }

        $pdo->prepare(
            "INSERT IGNORE INTO pd_blocklist (ip, reason, expires_at)
             VALUES (?, 'honeypot', NOW() + INTERVAL 7 DAY)")
            ->execute([$ip]);

        if (pd_bomb_armed()) {
            pd_notify("💣 Bombed `$ip` — Hit Trap Path: `$uri`");
            pd_send_bomb();
        }

        pd_notify("🚨 Banned `$ip` — Hit Trap Path: `$uri`");
        http_response_code(403); exit;
    }

    // --- RULE 2: burst (volume) -> overload / DDOS protection --------
    //     5+ requests from one IP within 20 seconds. Short 24h ban —
    //     often just an impatient real person.
    //     Cross-site / same-site requests are EXCLUDED: an attacker can
    //     embed nine <img> tags pointing at real URLs to make a victim's
    //     browser trip this rule. Legit same-origin browsing still counts.
    $burst = $pdo->prepare(
        "SELECT COUNT(*) FROM pd_access_log
         WHERE ip = ? AND created_at > (NOW() - INTERVAL 20 SECOND)
           AND (fetch_site IS NULL OR fetch_site NOT IN ('cross-site','same-site'))");
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
    //     4+ "file not found" (404) hits from one IP within 10 minutes.
    //     Catches slow scanners that dodge the burst rule — and the
    //     headless-browser scanner that dodged the honeypot insta-ban,
    //     since its 404s aren't cross-site and still accumulate here.
    //     Cross-site / same-site 404s are EXCLUDED so an embedded batch
    //     of trap URLs can't push a tricked victim over the threshold.
    $miss = $pdo->prepare(
        "SELECT COUNT(*) FROM pd_access_log
         WHERE ip = ? AND status = 404
           AND created_at > (NOW() - INTERVAL 10 MINUTE)
           AND (fetch_site IS NULL OR fetch_site NOT IN ('cross-site','same-site'))");
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