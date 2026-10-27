# Wrap the built page (site/index.html from build.py) into the full document served from the repo root.
import sys
s = open(sys.argv[1]).read()
i = s.index('<section class="home"')
beacon = '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "6bfc9cd078034a8e8210ba1709db59c8"}\'></script>'
open(sys.argv[2], 'w').write('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
                             + s[:i] + beacon + '</head><body>' + s[i:] + '</body></html>')
