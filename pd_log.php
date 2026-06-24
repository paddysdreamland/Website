<?php
/* =====================================================================
 * pd_log.php
 * UPLOAD TO:  /home/paddnols/public_html/pd_log.php
 *
 * Defines:
 *   pd_log_hit()        — records one request to pd_access_log
 *   pd_bomb_armed()     — is the gzip bomb currently live?
 *   pd_send_bomb()      — streams the gzip bomb to the client, then exits
 *   pd_guard_degraded() — throttled "guard fell back" alert (best-effort)
 *   pd_guard()          — ban check + log + THREE defence rules:
 *                           1) honeypot (instant ban on trap paths)
 *                           2) burst    (volume / overload protection)
 *                           3) scan     (repeated 404 probing / scrapers)
 *
 * FAILS OPEN:
 *   All DB work in pd_guard() is wrapped. If anything throws (missing
 *   column, dropped connection, etc.) the request is served UNGUARDED
 *   rather than 500ing the whole site, and Paddy is pinged (throttled).
 *   A guard that takes the site down when it trips over its own schema
 *   is worse than one that briefly lets a scraper through. The intentional
 *   exit paths (403s, bomb) end the script before the catch sees them, so
 *   real bans/bombs are unaffected.
 *
 * VICTIM PROTECTION (Sec-Fetch-Site):
 *   A real browser ALWAYS sends Sec-Fetch-Site; curl / python / scanner
 *   tooling does not. An attacker can't reflect the bomb at a stranger
 *   (TCP can't be source-spoofed), but they CAN embed a trap URL in an
 *   <img>/<iframe> or post the bare link, so a MEMBER's own browser fires
 *   the request. We defuse that everywhere:
 *     - honeypot: any browser request to a trap -> quiet 404, no punishment
 *     - scan/burst: cross-site / same-site requests don't count toward a ban
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
 * PD_BOMB_FILE    : pre-built gzip bomb, kept OUTSIDE public_html so nobody
 *                   can fetch it directly. Build it with:
 *                     dd if=/dev/zero bs=1M count=10240 | gzip -9 > 10G.gz
 *                   then drop 10G.gz in /home/paddnols/ (one level up).
 * ------------------------------------------------------------------ */
const PD_BOMB_ENABLED = true;
define('PD_BOMB_FILE', dirname(__DIR__) . '/10G.gz');   // /home/paddnols/10G.gz

/* Sec-Fetch-Site values that mean "initiated from off-site" (the embed
 * weaponization signature). These never count toward a ban. */
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
 * Live only if the switch is on AND the payload exists. Missing file =>
 * quiet fall back to a normal 403, never a broken response.
 * To toggle live without editing this file, swap the PD_BOMB_ENABLED
 * check for a sentinel: is_readable(__DIR__ . '/bomb.armed')
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

/* ---- degraded alert ------------------------------------------------
 * Best-effort, throttled ping when pd_guard() fails open. Uses a temp
 * FILE for throttling, not the DB — the DB may be the thing that's down.
 * Never throws.
 * ------------------------------------------------------------------ */
function pd_guard_degraded(Throwable $e): void {
    try {
        $flag = sys_get_temp_dir() . '/pd_guard_degraded';
        if (!is_file($flag) || (time() - @filemtime($flag)) > 300) {   // once / 5 min
            @touch($flag);
            pd_notify('🛟 Guard degraded — serving UNGUARDED for now: ' . $e->getMessage());
        }
    } catch (Throwable $ignored) { /* alerting must never break the page */ }
}

function pd_guard(): void {
  try {
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
    //     A non-browser hitting these is unambiguously hostile. A BROWSER
    //     hitting one is a member tricked via an embedded <img>/<iframe>
    //     or a posted link — never punish them; quiet 404 instead.
    $traps = [
        '/.env',
        '/.aws',
        '/.git',
        '/.dev',
        '/.ssh',
        '/.vscode',
        '/wp-login.php',
        '/wp-content',
        '/wp-includes',
        '/wp-admin',
        '/wp-json',
        '/config.json',
        '/vendor',
        '/admin',
        '/mod',
        '/inputs.php',
        '/confirmedsearchleak',
        '/thisthing',
        '/thatthing',
        '/andthisthing',
        '/andthatthing',
        '/enhancecp',
        '/plugins',
        '/shell.php'
    ];

    foreach ($traps as $t) {
        if (stripos($uri, $t) === false) continue;

        if ($browserRequest) {
            // A member's browser was sent here, not a scanner. Don't ban,
            // don't bomb. If it came cross-site, that's the embed signature
            // — tip Paddy off, then 404 the victim harmlessly.
            $fs = strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
            if (in_array($fs, PD_OFFSITE_FETCH, true)) {
                $ref = $_SERVER['HTTP_REFERER'] ?? '(referrer hidden)';
                pd_notify("⚠️ Trap weaponization? Victim `$ip` → `$uri` (embedded on `$ref`)");
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
    //     often just an impatient real person. Cross-site / same-site
    //     requests are EXCLUDED so an embedded batch of <img> tags can't
    //     trip it; legit same-origin browsing still counts.
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
    //     Catches slow scanners and the headless-browser scanner that
    //     dodged the honeypot insta-ban. Cross-site / same-site 404s are
    //     EXCLUDED so an embedded batch of trap URLs can't push a tricked
    //     victim over the threshold.
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

  } catch (Throwable $e) {
    // Fail OPEN: serve the page unguarded rather than 500 the whole site.
    // (Intentional 403/bomb paths exit before reaching here, so real bans
    // and bombs are unaffected — only genuine errors land in this catch.)
    pd_guard_degraded($e);
    return;
  }
}