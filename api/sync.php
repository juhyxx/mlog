<?php
// Mlog sync endpoint. One POST does both directions (see src/sync.js):
//
//   request  {"key": "...", "cursor": 120, "changes": [{"kind", "id", "updatedAt", "deleted", "data"}, ...]}
//   response {"cursor": 135, "more": false, "records": [{"kind", "id", "updatedAt", "deleted", "data"}, ...]}
//
// Each change is stored unless the server already has a newer version of that record (newest wins).
// The response lists every record changed after the client's cursor, in revision order, plus the
// server's copy of any change it refused. Records are kept per owner: each access key opens its own log.
//
// The body arrives as text/plain (a "simple" CORS request, so browsers send no preflight) and is
// parsed as JSON. GET answers {"app": "mlog"} as a health check. Needs PHP 7.1+ with mysqli.

require __DIR__ . '/config.php';

const MLOG_MAX_BODY = 4 * 1024 * 1024;
const MLOG_MAX_RECORD = 64 * 1024;
const MLOG_PAGE = 500;
// entry: one practice. session and item are the first version's day sessions and checklist items, still kept.
const MLOG_KINDS = ['instrument', 'entry', 'session', 'item'];

header('Access-Control-Allow-Origin: ' . (mlog_setting('ORIGIN') ?: '*'));
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function reply($status, $body)
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method === 'GET') {
    reply(200, ['app' => 'mlog', 'api' => 1]);
}
if ($method !== 'POST') {
    reply(405, ['error' => 'method']);
}

$raw = file_get_contents('php://input', false, null, 0, MLOG_MAX_BODY + 1);
if ($raw === false || strlen($raw) > MLOG_MAX_BODY) {
    reply(413, ['error' => 'too-large']);
}
// Decoded as objects, not arrays, so an empty {} stays {} when it's stored and sent back.
$req = json_decode($raw);
if (!is_object($req)) {
    reply(400, ['error' => 'bad-json']);
}
if (!mlog_keys() || !mlog_setting('MYSQL_DATABASE')) {
    reply(500, ['error' => 'config']);
}
$owner = mlog_owner(isset($req->key) && is_string($req->key) ? $req->key : '');
if ($owner === null) {
    usleep(300000); // slows down guessing
    reply(401, ['error' => 'bad-key']);
}
$cursor = isset($req->cursor) && is_numeric($req->cursor) ? max(0, (int)$req->cursor) : 0;
$changes = isset($req->changes) && is_array($req->changes) ? $req->changes : [];

// Only well-formed records are stored; anything else is skipped, not fatal.
function valid_change($c)
{
    return is_object($c)
        && isset($c->kind, $c->id, $c->updatedAt)
        && in_array($c->kind, MLOG_KINDS, true)
        && is_string($c->id) && preg_match('/^[A-Za-z0-9_.-]{1,64}$/', $c->id)
        && is_numeric($c->updatedAt) && $c->updatedAt > 0;
}

function row_to_record($kind, $id, $data, $updatedAt, $deleted)
{
    $decoded = json_decode($data);
    return [
        'kind' => $kind,
        'id' => $id,
        'updatedAt' => (int)$updatedAt,
        'deleted' => (bool)$deleted,
        'data' => is_object($decoded) ? $decoded : new stdClass(),
    ];
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
try {
    $db = new mysqli(
        mlog_setting('MYSQL_HOST', 'localhost'),
        mlog_setting('MYSQL_USER', ''),
        mlog_setting('MYSQL_PASSWORD', ''),
        mlog_setting('MYSQL_DATABASE', '')
    );
    $db->set_charset('utf8mb4');

    // The one table, made on first use. rev changes on every write (REPLACE inserts a new row),
    // so "rev > cursor" is everything a client hasn't seen yet.
    $db->query('CREATE TABLE IF NOT EXISTS mlog_records (
        rev BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        owner VARCHAR(64) NOT NULL,
        kind VARCHAR(16) NOT NULL,
        id VARCHAR(64) NOT NULL,
        data MEDIUMTEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        deleted TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (rev),
        UNIQUE KEY record (owner, kind, id),
        KEY owner_rev (owner, rev)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

    $refused = [];
    if ($changes) {
        // One writer per owner at a time, so revisions are committed in order and a client that
        // reads up to revision N never misses a lower one committed later.
        $lock = $db->prepare('SELECT GET_LOCK(?, 10)');
        $lockName = 'mlog:' . $owner;
        $lock->bind_param('s', $lockName);
        $lock->execute();
        $lock->close();

        $db->begin_transaction();
        $get = $db->prepare('SELECT updated_at FROM mlog_records WHERE owner = ? AND kind = ? AND id = ? FOR UPDATE');
        $put = $db->prepare('REPLACE INTO mlog_records (owner, kind, id, data, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($changes as $c) {
            if (!valid_change($c)) {
                continue;
            }
            $kind = $c->kind;
            $id = $c->id;
            $updatedAt = (int)$c->updatedAt;
            $deleted = empty($c->deleted) ? 0 : 1;
            $data = $deleted || !isset($c->data) || !is_object($c->data) ? '{}' : json_encode($c->data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($data === false || strlen($data) > MLOG_MAX_RECORD) {
                continue;
            }
            $get->bind_param('sss', $owner, $kind, $id);
            $get->execute();
            $existing = null;
            $get->bind_result($existing);
            $found = $get->fetch();
            $get->free_result();
            if ($found && (int)$existing > $updatedAt) {
                $refused[] = [$kind, $id]; // ours is newer: the client gets it back below
                continue;
            }
            $put->bind_param('ssssii', $owner, $kind, $id, $data, $updatedAt, $deleted);
            $put->execute();
        }
        $db->commit();
        $release = $db->prepare('SELECT RELEASE_LOCK(?)');
        $release->bind_param('s', $lockName);
        $release->execute();
        $release->close();
    }

    // Everything after the client's cursor, a page at a time.
    $records = [];
    $seen = [];
    $next = $cursor;
    $limit = MLOG_PAGE;
    $list = $db->prepare('SELECT rev, kind, id, data, updated_at, deleted FROM mlog_records WHERE owner = ? AND rev > ? ORDER BY rev LIMIT ?');
    $list->bind_param('sii', $owner, $cursor, $limit);
    $list->execute();
    $list->bind_result($rev, $kind, $id, $data, $updatedAt, $deleted);
    while ($list->fetch()) {
        $records[] = row_to_record($kind, $id, $data, $updatedAt, $deleted);
        $seen[$kind . '/' . $id] = true;
        $next = max($next, (int)$rev);
    }
    $list->close();
    $more = count($records) >= MLOG_PAGE;

    // The server's copy of refused changes, unless it's already in the list.
    if ($refused) {
        $one = $db->prepare('SELECT data, updated_at, deleted FROM mlog_records WHERE owner = ? AND kind = ? AND id = ?');
        foreach ($refused as $r) {
            if (isset($seen[$r[0] . '/' . $r[1]])) {
                continue;
            }
            $one->bind_param('sss', $owner, $r[0], $r[1]);
            $one->execute();
            $one->bind_result($data, $updatedAt, $deleted);
            if ($one->fetch()) {
                $records[] = row_to_record($r[0], $r[1], $data, $updatedAt, $deleted);
            }
            $one->free_result();
        }
        $one->close();
    }

    $db->close();
    reply(200, ['cursor' => $next, 'more' => $more, 'records' => $records]);
} catch (mysqli_sql_exception $e) {
    error_log('mlog: ' . $e->getMessage());
    reply(500, ['error' => 'db']);
}
