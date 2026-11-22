<?php
// Configuration, read from api/settings.php when it exists (the deploy writes it from GitHub secrets,
// see .github/workflows/api.yml and settings.example.php), or else from MLOG_* environment variables
// (compose.yaml, for running it locally).

if (is_file(__DIR__ . '/settings.php')) {
    require_once __DIR__ . '/settings.php';
}

function mlog_setting($name, $default = null)
{
    if (class_exists('Settings') && defined('Settings::' . $name)) {
        return constant('Settings::' . $name);
    }
    $env = getenv('MLOG_' . $name);
    return $env === false ? $default : $env;
}

// Access keys and whose log each opens: ['key' => 'name'] in settings.php, or "key=name,key2=name2".
function mlog_keys()
{
    $keys = mlog_setting('KEYS', []);
    if (is_string($keys)) {
        $out = [];
        foreach (explode(',', $keys) as $pair) {
            $parts = explode('=', trim($pair), 2);
            if (count($parts) === 2 && $parts[0] !== '') {
                $out[$parts[0]] = $parts[1];
            }
        }
        $keys = $out;
    }
    return is_array($keys) ? $keys : [];
}

// The owner a key belongs to, or null. Compared in constant time.
function mlog_owner($key)
{
    $found = null;
    foreach (mlog_keys() as $k => $owner) {
        if (strlen((string)$k) >= 8 && hash_equals((string)$k, (string)$key)) {
            $found = (string)$owner;
        }
    }
    return $found;
}
