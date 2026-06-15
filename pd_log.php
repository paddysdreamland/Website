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
