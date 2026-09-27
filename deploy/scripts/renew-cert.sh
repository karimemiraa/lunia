#!/usr/bin/env bash
# Daily cert renewal, run from /etc/cron.d/lunia-certbot (0 3 * * * root ...).
cd /home/ubuntu/lunia
/usr/bin/docker run --rm -v /home/ubuntu/lunia/deploy/certbot/conf:/etc/letsencrypt -v /home/ubuntu/lunia/deploy/certbot/www:/var/www/certbot certbot/certbot renew --webroot -w /var/www/certbot --quiet
/usr/bin/docker compose -f /home/ubuntu/lunia/docker-compose.prod.yml restart nginx
