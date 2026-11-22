<?php
// Copy to settings.php on the server (or let .github/workflows/api.yml write it from secrets).
// settings.php is ignored by git: it holds the database password and the access keys.
class Settings
{
    const MYSQL_HOST = 'localhost';
    const MYSQL_USER = '';
    const MYSQL_PASSWORD = '';
    const MYSQL_DATABASE = '';

    // Access keys, each opening its own log: 'key' => 'owner name'. At least 8 characters; make one with
    //   openssl rand -hex 24
    const KEYS = ['paste-a-long-random-key-here' => 'me'];

    // The web origin allowed to call the API, e.g. 'https://juhyxx.github.io', or '*' for any.
    const ORIGIN = '*';
}
