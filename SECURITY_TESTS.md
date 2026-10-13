# Security & behaviour test report (ParkSmart v4)

Re-run the API suite against any deployment:  `python3 tests/security_test.py https://your-host admin <admin-password>`

## API / server suite - 42 checks over HTTP, 43 over HTTPS: all passed (adds any-country plates, exit-by-plate, auto-action audit marks)
- Auth: every protected endpoint rejects no/forged/URL-query tokens; attendant blocked from all admin endpoints; logout kills the token; tokens are unique 192-bit.
- Brute force: lock after 5 wrong passwords (also for the right password during lock); login timing does not reveal valid usernames.
- Injection: SQL injection in login, plate, ticket id, vehicle type, username; free text stored literally; weak passwords/roles rejected.
- HTTP: CSP (no unsafe-eval, no inline script), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, CORP, HSTS (HTTPS); no CORS for foreign origins; OPTIONS/TRACE/PUT/DELETE refused; CSRF-style cross-site POST refused; 13 path-traversal / secret-file probes -> 404; oversized body -> 413; no stack traces leaked.
- Abuse: stays responsive under 15 half-open connections; 10 simultaneous check-ins of one plate -> exactly one ticket; audit log has no passwords/tokens.
- TLS: TLS 1.0/1.1 refused, 1.2/1.3 accepted.

## Browser (real Chromium) checks - passed
- Stored XSS payloads (<img onerror>, <script>) in watchlist reason / audit log are shown as text, never executed.
- CSP blocks injected inline scripts and inline event handlers.
- Login, manual check-in, check-out receipt work under the strict CSP.

## Finding fixed during testing
- Half-open connections could stall the Java server (slowloris): mitigated (64 workers, 8 s request timeout). NOT eliminated: put a reverse proxy (Caddy/nginx/Cloudflare) in front when exposed to the internet.

## Not covered
- Independent penetration test, dependency CVE scan of the JDBC driver, MySQL itself (tests ran on MariaDB 10.11), 8-hour session expiry, real phone cameras.

## Motion-capture / plate reading (synthetic camera, 640x360, 1 slow CPU core)
| Blur of plate | Result |
|---|---|
| ~7 px (fast shutter) | read, type detected, parked automatically |
| ~10 px | correct plate recovered by de-blur, low confidence -> asks operator to confirm |
| ~24 px | not read |
| ~95 px | refused, no wrong entry |
| moving object, no plate | no entry |
Vehicle type: bus photo -> truck (94%). Car/motorcycle use the same COCO classes but were not tested with photos.

## Plate reading benchmark (synthetic plates rendered in the browser, 22 styles): 22 of 22 correct
White, yellow, dark (white on black), two-line, tilted+noisy, grey ink on paper, small text, light blur; India, UK (front and rear), Germany, France, Spain, USA, Brazil,
Russia, UAE, Saudi Arabia, Singapore, Australia, Turkey, Netherlands. Real photographs of plates were NOT available, so real-world accuracy is unmeasured.

## Camera tests (simulated camera, slow single-core machine)
| Test | Result |
|---|---|
| Very fast plate (about 7 px blur), bus in scene, OCR confidence 59% | auto-parked, type "truck" from the camera, logged CHECKIN_AUTO |
| About 10 px blur, plain scene | correct plate recovered, auto-parked (default type car) |
| Plate at 20% size (9% of frame) with "Very near" | refused: "Plate too far away" |
| Exit camera, vehicle parked first | read, counted down, checked out, fee 20 recorded |
| Fuzzy exit match (1 wrong char, 2-line text, noise) | matched the right parked vehicle; unrelated plate not matched |
| Vehicle type on real photos | bus -> truck (0.94); cars -> car; person -> none (default used). Motorcycle NOT tested |

## Bugs found and fixed in this round
- "Read plate now" on a still paper captured nothing (frames were only taken while moving).
- Plate repair turned a D into O and could drop a digit; all-letter text could match a template; weak 5-character reads became junk entries.
- Plate size check was silently skipped when repair changed characters (now measured from the exact words covering the plate).
- Short plates surrounded by empty space returned nothing (added a tight-crop step); two-line plates need a block-reading pass.
- With no confidence gate, the first weak de-blur match won; now the best-scoring read across all frames and blur lengths wins.
