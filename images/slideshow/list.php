<?php
// Lists the images in this folder for scripts/jte_slideshow.js.
//
// A page cannot read a directory - JS only ever knows the URLs it is told
// about - and Options -Indexes in .htaccess means there is no autoindex to
// scrape either (this folder answers 403). So the listing has to come from the
// server, and that is all this does.
//
// The point of doing it here rather than shipping a checked-in manifest is that
// the folder stays the single source of truth: drop a picture in, and it is in
// the rotation on the next page load with nothing to regenerate and nothing to
// keep in sync.
//
// Lives in the folder it describes so the two cannot drift apart, and reached
// as /images/slideshow/list - the root .htaccess serves .php without the
// extension. The no-store header that .htaccess puts on non-image responses
// applies here too, which is what makes a newly added file show up immediately.

header('Content-Type: application/json; charset=utf-8');

$allowed = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'];
$files   = [];

foreach (glob(__DIR__ . '/*') as $path) {
    if (!is_file($path)) {
        continue;
    }

    // Filtering on extension is also what keeps this script, and anything else
    // non-image someone leaves in here, out of its own listing.
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed, true)) {
        continue;
    }

    $files[] = basename($path);
}

// Natural order so Document_02 sorts before Document_10 rather than after it.
// Only matters when SHUFFLE is off in the slideshow, but a listing that reads
// in a sensible order is easier to eyeball when something looks wrong.
sort($files, SORT_NATURAL | SORT_FLAG_CASE);

echo json_encode(array_values($files), JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
