FROM php:8.3-apache

# Install ffmpeg, sqlite3, docker-cli, and required PHP extensions
RUN apt-get update && apt-get install -y \
    ffmpeg \
    sqlite3 \
    libsqlite3-dev \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libzip-dev \
    zip \
    unzip \
    docker.io \
    curl \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install pdo pdo_mysql pdo_sqlite gd zip \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

# Optimize PHP runtime for Hi-Fi audio streaming, video streaming, and large uploads
RUN echo "memory_limit = 1024M\nupload_max_filesize = 2048M\npost_max_size = 2048M\nmax_execution_time = 1200\n" > /usr/local/etc/php/conf.d/christos.ini

# Configure Apache permissions for TrueNAS SCALE storage (UID 568 / apps / root)
RUN groupadd -g 568 apps 2>/dev/null || true \
    && usermod -aG apps,root www-data 2>/dev/null || true \
    && sed -i 's/export APACHE_RUN_USER=www-data/export APACHE_RUN_USER=root/g' /etc/apache2/envvars \
    && sed -i 's/export APACHE_RUN_GROUP=www-data/export APACHE_RUN_GROUP=root/g' /etc/apache2/envvars

WORKDIR /var/www/html

# Create persistent data directory
RUN mkdir -p /data

COPY . /var/www/html/

EXPOSE 80

CMD ["apache2-foreground"]