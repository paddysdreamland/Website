<?php
declare(strict_types=1);

// pd_posts.php  —  returns the published news posts as JSON for pd_post_manager.js.
// Newest first, hidden posts excluded. Mirrors the DB setup used by auth/me.php.

$config = require dirname(__DIR__) . '/private/pd_config.php';
require dirname(__DIR__) . '/private/pd_lib.php';

header('Content-Type: application/json');

$pdo = pd_db($config);

$rows = $pdo->query(
    'SELECT post_key, header, post_date, post_body, post_images, post_signature, irrelevant
       FROM pd_newsposts
      WHERE hidden = 0
      ORDER BY post_date DESC'
)->fetchAll(PDO::FETCH_ASSOC);

$posts = array_map(static function (array $row): array {
    return [
        'postKey'       => $row['post_key'],
        'postHeader'    => $row['header'],
        // DATE -> the human format the renderer prints verbatim, e.g. "3rd of January 2026".
        'postDate'      => date('jS \o\f F Y', strtotime($row['post_date'])),
        'postBody'      => json_decode($row['post_body'], true) ?? [],
        'postImages'    => $row['post_images'] !== null ? (json_decode($row['post_images'], true) ?? []) : [],
        'postSignature' => $row['post_signature'],
        'irrelevant'    => (bool) $row['irrelevant'],
    ];
}, $rows);

echo json_encode($posts);
