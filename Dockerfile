# Local stack for trying the API (see compose.yaml): Apache with PHP and mysqli, serving the whole app.
FROM php:8.4-apache
RUN docker-php-ext-install mysqli
