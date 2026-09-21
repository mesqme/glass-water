# Deploy to mesq.me/globe-tsl-blocks

The supplied server report shows Ubuntu 22.04 and Nginx terminating HTTPS for `mesq.me` in `/etc/nginx/sites-available/default`. This project needs static hosting only. Its files go in `/var/www/globe-tsl-blocks/`, with a location added to that existing HTTPS server block.

## 1. Build and upload from the Mac

```sh
cd /Users/mikhail/Desktop/ThreeJS/glass-water
npm ci
npm test
npm run package:site
```

Upload `artifacts/globe-tsl-blocks.tar.gz` to `/tmp/globe-tsl-blocks.tar.gz` on the server using your existing SSH connection or file-transfer app. For example, replace `YOUR_SSH_TARGET` with the username/host or SSH alias you normally use:

```sh
scp artifacts/globe-tsl-blocks.tar.gz YOUR_SSH_TARGET:/tmp/globe-tsl-blocks.tar.gz
```

The archive contains the built site and dependency notices. It excludes local certificates, source maps, source code and development tools. Node.js is needed on the build machine only.

## 2. Install the files on the server

```sh
sudo install -d -m 755 /var/www/globe-tsl-blocks
sudo tar --no-same-owner --no-same-permissions -xzf /tmp/globe-tsl-blocks.tar.gz -C /var/www/globe-tsl-blocks
sudo chmod -R u=rwX,go=rX /var/www/globe-tsl-blocks
```

For later updates, back up this directory before extracting the new archive. Keeping old hashed assets during an update lets already-open tabs finish loading their debug chunks.

## 3. Add the Nginx route once

Back up the current configuration:

```sh
sudo cp -a /etc/nginx/sites-available/default "/etc/nginx/sites-available/default.before-globe-$(date +%Y%m%d-%H%M%S)"
sudo nano /etc/nginx/sites-available/default
```

Paste these two locations **inside the existing `server` block with `listen 443 ssl http2` and `server_name mesq.me;`**, alongside the other project locations:

```nginx
location = /globe-tsl-blocks {
    return 301 /globe-tsl-blocks/$is_args$args;
}

location ^~ /globe-tsl-blocks/ {
    root /var/www;
    index index.html;
    try_files $uri $uri/ =404;
}
```

The snippet is also in [deploy/nginx-location.conf](../deploy/nginx-location.conf). Keep the existing certificates, other routes and port-80 redirect. No new port, proxy, service or Docker container is required. Missing assets return 404; the view selector and `#debug` do not need SPA routing.

Validate before reloading:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

## 4. Verify

```sh
curl -I https://mesq.me/globe-tsl-blocks
curl -I https://mesq.me/globe-tsl-blocks/
curl -I https://mesq.me/globe-tsl-blocks/favicon.svg
```

Expect a redirect to the trailing slash, then successful HTML and SVG responses. Open:

- [Globe](https://mesq.me/globe-tsl-blocks/)
- [Controls](https://mesq.me/globe-tsl-blocks/#debug)

Check all five views, glass and particles, then test tilt/shake on the phone using this HTTPS URL. A phone may request motion permission on the first touch. Existing projects should still load.

Vite rewrites asset paths using [`base`](https://vite.dev/guide/build.html#public-base-path). Nginx [`root`](https://nginx.org/en/docs/http/ngx_http_core_module.html#root) appends the request URI, so `/globe-tsl-blocks/assets/...` resolves under `/var/www/globe-tsl-blocks/assets/...`.
