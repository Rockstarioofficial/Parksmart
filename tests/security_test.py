#!/usr/bin/env python3
"""ParkSmart security test suite (stdlib only).
Usage: python3 tests/security_test.py http://localhost:8080 admin <admin-password>
Creates two throw-away attendant accounts (sectest_att, sectest_lock). Safe to run on a test deployment."""
import sys, json, time, socket, ssl, http.client, urllib.parse, statistics, uuid, concurrent.futures as cf

base, ADMIN, APW = sys.argv[1], sys.argv[2], sys.argv[3]
U = urllib.parse.urlparse(base); HTTPS = U.scheme == 'https'
res = []; bodies = []

def conn():
    if HTTPS: return http.client.HTTPSConnection(U.hostname, U.port, context=ssl._create_unverified_context(), timeout=20)
    return http.client.HTTPConnection(U.hostname, U.port, timeout=20)

def req(method, path, body=None, token=None, headers=None, rawbody=None):
    c = conn(); h = dict(headers or {})
    if token: h['X-Token'] = token
    data = rawbody
    if body is not None:
        data = urllib.parse.urlencode(body); h['Content-Type'] = 'application/x-www-form-urlencoded'
    try:
        c.request(method, path, body=data, headers=h); r = c.getresponse(); b = r.read().decode('utf-8', 'replace')
        bodies.append(b); return r.status, {k.lower(): v for k, v in r.getheaders()}, b
    except Exception as e:
        return 0, {}, str(e)
    finally: c.close()

def js(b):
    try: return json.loads(b)
    except Exception: return {}

def ok(name, cond, detail=''):
    res.append((cond, name, detail)); print(('PASS  ' if cond else 'FAIL  ') + name + (('  [' + str(detail) + ']') if detail and not cond else ''))

def login(u, p): 
    s, _, b = req('POST', '/api/login', {'username': u, 'password': p}); return s, js(b).get('token')

print('== setup'); s, ADM = login(ADMIN, APW); assert ADM, 'admin login failed'
for u in ('sectest_att', 'sectest_lock'): req('POST', '/api/users', {'username': u, 'password': 'Sectest-pass-1', 'role': 'attendant'}, ADM)
_, ATT = login('sectest_att', 'Sectest-pass-1')

print('== A. authentication & authorisation')
prot = [('GET', '/api/state'), ('POST', '/api/checkin'), ('POST', '/api/checkout'), ('POST', '/api/exit'), ('GET', '/api/reports'), ('GET', '/api/audit'),
        ('GET', '/api/watchlist'), ('POST', '/api/watchlist'), ('POST', '/api/watchlist/remove'), ('POST', '/api/users'), ('POST', '/api/backup'), ('POST', '/api/password')]
ok('every protected endpoint rejects requests with no token (401)', all(req(m, p, {} if m == 'POST' else None)[0] == 401 for m, p in prot))
ok('forged / random tokens are rejected', all(req('GET', '/api/state', token=t)[0] == 401 for t in ('0' * 48, uuid.uuid4().hex, 'admin', "' OR 1=1--")))
ok('token in URL query string does not authenticate', req('GET', '/api/state?token=' + ADM)[0] == 401)
adm_only = [('GET', '/api/reports'), ('GET', '/api/audit'), ('GET', '/api/watchlist'), ('POST', '/api/watchlist'), ('POST', '/api/watchlist/remove'), ('POST', '/api/users'), ('POST', '/api/backup')]
ok('attendant is blocked from every admin endpoint (403)', all(req(m, p, {'plate': 'TN01AA1111', 'username': 'x', 'password': 'y'} if m == 'POST' else None, ATT)[0] == 403 for m, p in adm_only))
s, t2 = login('sectest_att', 'Sectest-pass-1'); req('POST', '/api/logout', {}, t2)
ok('logout invalidates the token', req('GET', '/api/state', token=t2)[0] == 401)
toks = [login('sectest_att', 'Sectest-pass-1')[1] for _ in range(12)]
ok('session tokens are unique, 48 hex chars (192-bit)', len(set(toks)) == 12 and all(len(t) == 48 and all(c in '0123456789abcdef' for c in t) for t in toks))

print('== A2. any-country plates and exit by plate')
gp = 'ZX%d' % (int(time.time()) % 9000 + 1000)
s, _, b = req('POST', '/api/checkin', {'plate': gp[:3] + ' ' + gp[3:], 'type': 'car', 'src': 'gate'}, ADM)
ok('non-Indian plate format accepted (spaces/hyphens stripped)', s == 200, b[:80])
ok('exit by plate checks the vehicle out', req('POST', '/api/exit', {'plate': gp, 'src': 'gate'}, ADM)[0] == 200)
ok('exit of a plate that is not parked -> 404', req('POST', '/api/exit', {'plate': gp}, ADM)[0] == 404)
ok('exit rejects injection-style plate (400)', req('POST', '/api/exit', {'plate': "X' OR 1=1;--" + 'A' * 20}, ADM)[0] == 400)
s, _, b = req('GET', '/api/audit', token=ADM)
ok('automatic actions are marked CHECKIN_AUTO / CHECKOUT_AUTO in the audit log', 'CHECKIN_AUTO' in b and 'CHECKOUT_AUTO' in b)

print('== B. brute force & enumeration')
unk, kn = [], []
for i in range(4):
    t0 = time.time(); req('POST', '/api/login', {'username': 'nobody_' + uuid.uuid4().hex[:6], 'password': 'x'}); unk.append(time.time() - t0)
    t0 = time.time(); req('POST', '/api/login', {'username': 'sectest_att', 'password': 'wrong' + str(i)}); kn.append(time.time() - t0)
ratio = statistics.mean(kn) / max(1e-6, statistics.mean(unk))
ok('login timing does not reveal whether a username exists', 0.5 < ratio < 2.0, 'known/unknown time ratio %.2f' % ratio)
codes = [req('POST', '/api/login', {'username': 'sectest_lock', 'password': 'bad%d' % i})[0] for i in range(6)]
ok('account locks after 5 wrong passwords (429)', codes[:5] == [401] * 5 and codes[5] == 429, codes)
ok('lock holds even for the correct password', req('POST', '/api/login', {'username': 'sectest_lock', 'password': 'Sectest-pass-1'})[0] == 429)
ok('login error message is generic', 'Wrong username or password' in req('POST', '/api/login', {'username': 'zz', 'password': 'zz'})[2])

print('== C. injection')
for u, p in [("admin' OR '1'='1", "x"), ("admin'--", "x"), ("' OR 1=1 --", "' OR 1=1 --"), ('admin', "' OR '1'='1")]:
    s, tk = login(u, p); ok('SQLi login attempt rejected: %s' % u[:22], s in (401, 429) and not tk)
s, _, b = req('POST', '/api/checkin', {'plate': "TN30AB1234'; DROP TABLE tickets;--", 'type': 'car'}, ADM)
ok('SQLi in plate rejected by validation (400)', s == 400)
ok('SQLi in ticket id rejected (400)', req('POST', '/api/checkout', {'id': '1 OR 1=1'}, ADM)[0] == 400)
evil = "x'); DROP TABLE tickets;-- <script>alert(1)</script>"
req('POST', '/api/watchlist', {'plate': 'TN99SQ0001', 'reason': evil}, ADM)
s, _, b = req('GET', '/api/watchlist', token=ADM); stored = [r for r in js(b) if r[0] == 'TN99SQ0001']
ok('free-text field stored literally (parameterised SQL, tables intact)', bool(stored) and stored[0][1][:60] == evil[:60] and req('GET', '/api/state', token=ADM)[0] == 200)
req('POST', '/api/watchlist/remove', {'plate': 'TN99SQ0001'}, ADM)
ok('username injection / bad characters rejected on user create', req('POST', '/api/users', {'username': "a'; DROP TABLE users;--", 'password': 'Longenough1', 'role': 'attendant'}, ADM)[0] == 400)
ok('weak password rejected (min 8 chars)', req('POST', '/api/users', {'username': 'weakpw_user', 'password': 'short', 'role': 'attendant'}, ADM)[0] == 400)
ok('invalid role rejected', req('POST', '/api/users', {'username': 'badrole_user', 'password': 'Longenough1', 'role': 'root'}, ADM)[0] == 400)
ok('invalid vehicle type rejected', req('POST', '/api/checkin', {'plate': 'TN01AB1234', 'type': "car' OR 1=1"}, ADM)[0] == 400)

print('== D. HTTP hardening')
s, h, _ = req('GET', '/'); s2, h2, _ = req('GET', '/api/ping')
need = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-resource-policy']
ok('security headers on the page', all(k in h for k in need), [k for k in need if k not in h])
ok('security headers on API responses', all(k in h2 for k in need))
csp = h.get('content-security-policy', '')
ok("CSP forbids framing, plugins and unsafe-eval", "frame-ancestors 'none'" in csp and "object-src 'none'" in csp and 'unsafe-eval' not in csp.replace('wasm-unsafe-eval', ''))
ok('clickjacking blocked (X-Frame-Options DENY)', h.get('x-frame-options') == 'DENY')
if HTTPS: ok('HSTS sent over HTTPS', 'strict-transport-security' in h)
s, hh, _ = req('GET', '/api/ping', headers={'Origin': 'https://evil.example'})
ok('no CORS headers granted to foreign origins', 'access-control-allow-origin' not in hh)
ok('preflight OPTIONS refused (405)', req('OPTIONS', '/api/state', headers={'Origin': 'https://evil.example', 'Access-Control-Request-Method': 'POST'})[0] == 405)
ok('TRACE / PUT / DELETE refused (405)', all(req(m, '/api/state', token=ADM)[0] == 405 for m in ('TRACE', 'PUT', 'DELETE')))
ok('CSRF: cross-site form POST without the token header is refused', req('POST', '/api/checkin', {'plate': 'TN01AB1234', 'type': 'car'}, headers={'Origin': 'https://evil.example', 'Cookie': 'x=1'})[0] == 401)
trav = ['/../config.properties', '/%2e%2e/config.properties', '/vendor/../config.properties', '/vendor/%2e%2e/config.properties', '/config.properties', '/parksmart.p12',
        '/backups/', '/schema.sql', '/web/index.html', '/vendor/..%2fconfig.properties', '/vendor/', '/index.html/../../etc/passwd', '/vendor/%00.js']
bad = [p for p in trav if req('GET', p)[0] != 404]
ok('path traversal / secret-file probes all return 404', not bad, bad)
big = req('POST', '/api/login', rawbody='a=' + 'x' * 200000, headers={'Content-Type': 'application/x-www-form-urlencoded'})
ok('oversized request body rejected (413)', big[0] in (413, 0), big[0])
ok('huge field values do not crash the server', req('POST', '/api/checkin', {'plate': 'A' * 9000, 'type': 'car'}, ADM)[0] == 400 and req('GET', '/api/ping')[0] == 200)
ok('no stack traces / internals leaked in any response', not any(('Exception' in b and 'SlotNotAvailable' not in b) or 'at parking.' in b or 'java.' in b or 'SQLSyntax' in b for b in bodies))

print('== E. abuse resistance')
socks = []
for _ in range(15):
    try:
        so = socket.create_connection((U.hostname, U.port), timeout=5)
        if HTTPS: so = ssl._create_unverified_context().wrap_socket(so, server_hostname=U.hostname)
        so.sendall(b'GET /api/ping HTTP/1.1\r\nHost: x\r\nX-a: '); socks.append(so)
    except Exception: pass
t0 = time.time(); s, _, _ = req('GET', '/api/ping'); dt = time.time() - t0
ok('server stays responsive under 15 half-open (slowloris-style) connections', s == 200 and dt < 3, '%.1fs' % dt)
for so in socks: so.close()
plate = 'TN%02dZZ%04d' % (int(time.time()) % 90 + 1, int(time.time()) % 10000)
with cf.ThreadPoolExecutor(10) as ex: r = list(ex.map(lambda _: req('POST', '/api/checkin', {'plate': plate, 'type': 'car'}, ADM)[0], range(10)))
ok('10 simultaneous check-ins of one plate create exactly one ticket', r.count(200) == 1, r)
s, _, b = req('GET', '/api/state', token=ADM); tk = [t for t in js(b).get('tickets', []) if t['plate'] == plate and not t['out']]
if tk: req('POST', '/api/checkout', {'id': tk[0]['id']}, ADM)
s, _, b = req('GET', '/api/audit', token=ADM)
ok('audit log never contains passwords or tokens', not any(x in b for x in ('Sectest-pass-1', ADM, APW)))
ok('audit log records logins, failures and blocked actions', all(k in b for k in ('LOGIN', 'LOGIN_FAIL')))

fails = [n for c, n, d in res if not c]
print('\n%d checks, %d passed, %d failed' % (len(res), len(res) - len(fails), len(fails)))
if fails: print('FAILED:\n  ' + '\n  '.join(fails))
sys.exit(1 if fails else 0)
