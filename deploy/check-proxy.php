<?php
/**
 * Upload to public_html and open https://epergaboni.com/check-proxy.php
 *
 * Answers one question: can this server proxy /jevseo to Vercel, or do we
 * need the subdomain instead? Delete the file once you have the answer.
 */
header('Content-Type: text/plain; charset=utf-8');

echo "JevSEO — can this server proxy?\n";
echo str_repeat('=', 46) . "\n\n";

$modules = function_exists('apache_get_modules') ? apache_get_modules() : null;

if ($modules === null) {
    echo "RESULT: UNKNOWN\n\n";
    echo "PHP is not running as an Apache module here, so the module list is\n";
    echo "not visible. That does not mean proxying is unavailable — try the\n";
    echo ".htaccess rules and see whether /jevseo loads or errors.\n\n";
} else {
    $need    = ['mod_proxy', 'mod_proxy_http'];
    $missing = array_values(array_diff($need, $modules));
    $have    = array_values(array_intersect($need, $modules));

    if (empty($missing)) {
        echo "RESULT: YES — proxying should work.\n\n";
        echo "Found: " . implode(', ', $have) . "\n";
        echo "Next: append deploy/hostgator-jevseo.htaccess to public_html/.htaccess\n";
    } else {
        echo "RESULT: NO — use the subdomain instead.\n\n";
        echo "Missing: " . implode(', ', $missing) . "\n";
        echo "Without these, the [P] rewrite flag is ignored and /jevseo will\n";
        echo "return 404 or 500. This is a hosting limitation, not something\n";
        echo ".htaccess can work around.\n";
        echo "Next: set up jevseo.epergaboni.com — one CNAME, no proxying.\n";
    }
    echo "\nmod_rewrite: " . (in_array('mod_rewrite', $modules, true) ? 'yes' : 'NO — needed either way') . "\n";
}

echo "\n" . str_repeat('-', 46) . "\n";
echo "Server:    " . ($_SERVER['SERVER_SOFTWARE'] ?? 'unknown') . "\n";
echo "PHP:       " . PHP_VERSION . " (" . php_sapi_name() . ")\n";
echo "Doc root:  " . ($_SERVER['DOCUMENT_ROOT'] ?? 'unknown') . "\n";

// Can this server reach Vercel at all? A blocked outbound request would also
// stop a proxy from working.
echo "\nOutbound to Vercel: ";
// Referencing $http_response_header is deprecated on PHP 8.4+, and merely
// naming it emits a notice, so reachability is judged on the return value.
$ctx = stream_context_create([
    'http' => ['timeout' => 8, 'method' => 'HEAD', 'ignore_errors' => true],
]);
$reachable = @file_get_contents('https://jevseo-gold.vercel.app/jevseo', false, $ctx) !== false;

if ($reachable) {
    echo "reachable\n";
} else {
    echo "BLOCKED — outbound HTTPS appears to be filtered.\n";
    echo "  A proxy cannot work if this server cannot reach Vercel.\n";
    echo "  Use the subdomain approach instead.\n";
}

echo "\nDelete this file when you are done.\n";
