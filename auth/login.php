<?php
declare(strict_types=1);

// auth/login.php  —  kick off the Discord OAuth flow.
// Link your header button here, optionally with ?return=/some/spa/path

$config = require dirname(__DIR__, 2) . '/private/pd_config.php';
require dirname(__DIR__, 2) . '/private/pd_lib.php';

// CSRF protection: a random value we'll check when Discord sends the user back.
$state = bin2hex(random_bytes(16));
setcookie('pd_oauth_state', $state, [
    'expires'  => time() + 600,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);

// Remember where in the SPA they started, so we can return them there.
$return = isset($_GET['return']) ? (string) $_GET['return'] : '/';
setcookie('pd_oauth_return', $return, [
    'expires'  => time() + 600,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);

$params = http_build_query([
    'client_id'     => $config['discord']['client_id'],
    'redirect_uri'  => $config['discord']['redirect_uri'],
    'response_type' => 'code',
    'scope'         => 'identify',   // identity only — no email, keeps PII minimal
    'state'         => $state,
    'prompt'        => 'none',       // skip the consent screen for returning users
]);

header('Location: https://discord.com/api/oauth2/authorize?' . $params);
exit;
