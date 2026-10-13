package parking;

import com.sun.net.httpserver.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.net.ssl.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;

/** Web + API server (JDK built-in HTTP server) backed by MySQL. Run: mvn compile exec:java -Dexec.mainClass=parking.ParkSmartServer */
public class ParkSmartServer {
    static final SecureRandom RNG = new SecureRandom();
    record Sess(String user, String role, long exp) {}
    final Map<String, Sess> sessions = new ConcurrentHashMap<>();
    final Map<String, long[]> fails = new ConcurrentHashMap<>();
    static final String DUMMY_HASH = hash("dummy-password-for-timing");
    static final String ALPHA = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    static boolean TLS = false;
    final Db db;
    boolean trustProxy = false;
    ParkSmartServer(Db db) { this.db = db; }

    static String randomPassword() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 14; i++) b.append(ALPHA.charAt(RNG.nextInt(ALPHA.length())));
        return b.toString();
    }
    String clientIp(HttpExchange x) {
        if (trustProxy) { String f = x.getRequestHeaders().getFirst("X-Forwarded-For"); if (f != null && !f.isBlank()) return f.split(",")[0].trim(); }
        return x.getRemoteAddress().getAddress().getHostAddress();
    }

    public static void main(String[] args) throws Exception {
        System.setProperty("sun.net.httpserver.maxReqTime", "8");
        System.setProperty("sun.net.httpserver.maxRspTime", "60");
        System.setProperty("sun.net.httpserver.idleInterval", "30");
        Properties p = new Properties();
        Path cf = Paths.get("config.properties");
        if (Files.exists(cf)) try (InputStream in = Files.newInputStream(cf)) { p.load(in); }
        else System.out.println("config.properties not found - using defaults");
        String[][] env = {{"DB_URL", "db.url"}, {"DB_USER", "db.user"}, {"DB_PASSWORD", "db.password"}, {"ADMIN_PASSWORD", "admin.password"},
                {"PORT", "port"}, {"TLS", "tls"}, {"TRUST_PROXY", "trust.proxy"}};
        for (String[] e : env) if (System.getenv(e[0]) != null && !System.getenv(e[0]).isEmpty()) p.setProperty(e[1], System.getenv(e[0]));
        Db db = new Db(p);
        String ap = p.getProperty("admin.password", "").trim();
        if (ap.isEmpty()) ap = randomPassword();
        try { db.init(ap, ParkSmartServer::hash); }
        catch (Exception e) { System.out.println("Cannot reach the database: " + e.getMessage() + "\nCheck db.url / db.user / db.password in config.properties."); return; }
        ParkSmartServer s = new ParkSmartServer(db);
        s.trustProxy = Boolean.parseBoolean(p.getProperty("trust.proxy", "false"));
        int port = Integer.parseInt(p.getProperty("port", "8443"));
        boolean tls = Boolean.parseBoolean(p.getProperty("tls", "true"));
        TLS = tls;
        HttpServer srv;
        if (tls) { srv = HttpsServer.create(new InetSocketAddress(port), 0); ((HttpsServer) srv).setHttpsConfigurator(new HttpsConfigurator(sslContext())); }
        else srv = HttpServer.create(new InetSocketAddress(port), 0);
        srv.createContext("/", s::handle);
        srv.setExecutor(Executors.newFixedThreadPool(64));
        srv.start();
        String sch = tls ? "https" : "http";
        System.out.println("ParkSmart running:  " + sch + "://localhost:" + port);
        for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces()))
            for (InetAddress ia : Collections.list(ni.getInetAddresses()))
                if (ia instanceof Inet4Address && ia.isSiteLocalAddress()) System.out.println("Open on your phone: " + sch + "://" + ia.getHostAddress() + ":" + port);
    }

    static SSLContext sslContext() throws Exception {
        Path ks = Paths.get("parksmart.p12"); char[] pw = "changeit".toCharArray();
        if (!Files.exists(ks)) {
            StringBuilder san = new StringBuilder("dns:localhost,ip:127.0.0.1");
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces()))
                for (InetAddress ia : Collections.list(ni.getInetAddresses()))
                    if (ia instanceof Inet4Address && ia.isSiteLocalAddress()) san.append(",ip:").append(ia.getHostAddress());
            String kt = Paths.get(System.getProperty("java.home"), "bin", "keytool").toString();
            Process pr = new ProcessBuilder(kt, "-genkeypair", "-alias", "parksmart", "-keyalg", "RSA", "-keysize", "2048", "-validity", "825",
                    "-storetype", "PKCS12", "-keystore", "parksmart.p12", "-storepass", "changeit", "-dname", "CN=ParkSmart", "-ext", "SAN=" + san).inheritIO().start();
            if (pr.waitFor() != 0) throw new IllegalStateException("keytool failed");
        }
        KeyStore k = KeyStore.getInstance("PKCS12");
        try (InputStream in = Files.newInputStream(ks)) { k.load(in, pw); }
        KeyManagerFactory kmf = KeyManagerFactory.getInstance("SunX509"); kmf.init(k, pw);
        SSLContext c = SSLContext.getInstance("TLS"); c.init(kmf.getKeyManagers(), null, null); return c;
    }

    // ---- passwords: PBKDF2-HMAC-SHA256, random salt ----
    static byte[] pbkdf2(String pw, byte[] salt) {
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(new PBEKeySpec(pw.toCharArray(), salt, 120000, 256)).getEncoded(); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    static String hash(String pw) {
        byte[] salt = new byte[16]; RNG.nextBytes(salt);
        return Base64.getEncoder().encodeToString(salt) + ":" + Base64.getEncoder().encodeToString(pbkdf2(pw, salt));
    }
    static boolean verify(String pw, String stored) {
        String[] s = stored.split(":");
        return MessageDigest.isEqual(pbkdf2(pw, Base64.getDecoder().decode(s[0])), Base64.getDecoder().decode(s[1]));
    }

    // ---- http helpers ----
    static void parse(String s, Map<String, String> m) {
        if (s == null || s.isEmpty()) return;
        for (String kv : s.split("&")) {
            int i = kv.indexOf('=');
            m.put(URLDecoder.decode(i < 0 ? kv : kv.substring(0, i), StandardCharsets.UTF_8), i < 0 ? "" : URLDecoder.decode(kv.substring(i + 1), StandardCharsets.UTF_8));
        }
    }
    static Map<String, String> params(HttpExchange x) throws Exception {
        Map<String, String> m = new HashMap<>();
        String cl = x.getRequestHeaders().getFirst("Content-Length");
        if (cl != null && cl.matches("\\d{1,12}") && Long.parseLong(cl) > 10000) throw new ApiEx(413, "Request too large.");
        parse(x.getRequestURI().getRawQuery(), m);
        if (x.getRequestMethod().equals("POST")) parse(new String(x.getRequestBody().readNBytes(10000), StandardCharsets.UTF_8), m);
        return m;
    }
    static final String CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            + "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self' data: blob:; "
            + "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
    static void send(HttpExchange x, int code, String type, byte[] body) throws IOException { send(x, code, type, body, "no-store"); }
    static void send(HttpExchange x, int code, String type, byte[] body, String cache) throws IOException {
        Headers h = x.getResponseHeaders();
        h.set("Content-Type", type);
        h.set("Cache-Control", cache);
        h.set("X-Content-Type-Options", "nosniff");
        h.set("X-Frame-Options", "DENY");
        h.set("Referrer-Policy", "no-referrer");
        h.set("Content-Security-Policy", CSP);
        h.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
        h.set("Cross-Origin-Resource-Policy", "same-origin");
        if (TLS) h.set("Strict-Transport-Security", "max-age=31536000");
        x.sendResponseHeaders(code, body.length);
        try (OutputStream o = x.getResponseBody()) { o.write(body); }
    }
    static void json(HttpExchange x, int code, String j) throws IOException { send(x, code, "application/json; charset=utf-8", j.getBytes(StandardCharsets.UTF_8)); }

    Sess session(HttpExchange x) {
        String t = x.getRequestHeaders().getFirst("X-Token");
        if (sessions.size() > 500) sessions.values().removeIf(v -> v.exp() < System.currentTimeMillis());
        Sess s = t == null ? null : sessions.get(t);
        if (s != null && s.exp() < System.currentTimeMillis()) { sessions.remove(t); return null; }
        return s;
    }

    void login(HttpExchange x, Map<String, String> p) throws Exception {
        String u = p.getOrDefault("username", "").trim(), pw = p.getOrDefault("password", "");
        String ip = clientIp(x);
        if (fails.size() > 5000) fails.clear();
        long[] f = fails.computeIfAbsent(ip + "|" + u.toLowerCase(), k -> new long[2]);
        if (f[1] > System.currentTimeMillis()) throw new ApiEx(429, "Too many attempts. Try again in a minute.");
        String[] rec = u.length() > 40 ? null : db.user(u);
        boolean good = verify(pw, rec != null ? rec[0] : DUMMY_HASH) && rec != null;
        if (!good) {
            if (++f[0] >= 5) { f[0] = 0; f[1] = System.currentTimeMillis() + 60000; }
            db.audit("-", "LOGIN_FAIL", (u.length() > 20 ? u.substring(0, 20) : u) + " from " + ip);
            throw new ApiEx(401, "Wrong username or password.");
        }
        f[0] = 0;
        byte[] b = new byte[24]; RNG.nextBytes(b);
        String t = HexFormat.of().formatHex(b);
        sessions.put(t, new Sess(u, rec[1], System.currentTimeMillis() + 8 * 3600_000L));
        db.audit(u, "LOGIN", "");
        json(x, 200, "{\"token\":" + Db.q(t) + "}");
    }

    static String mime(String f) {
        if (f.endsWith(".html")) return "text/html; charset=utf-8";
        if (f.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (f.endsWith(".json")) return "application/json";
        if (f.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }
    /** Serves only web/index.html and files under web/vendor/. Anything else is 404 (no path traversal). */
    void serveStatic(HttpExchange x, String m, String path) throws IOException {
        Path root = Paths.get("web").toAbsolutePath().normalize();
        String rel = path.equals("/") ? "index.html" : path.substring(1);
        boolean allowed = m.equals("GET") && (rel.equals("index.html") || rel.equals("app.js") || rel.startsWith("vendor/")) && rel.matches("[A-Za-z0-9._/-]+") && !rel.contains("..");
        Path f = allowed ? root.resolve(rel).normalize() : null;
        if (f == null || !f.startsWith(root) || !Files.isRegularFile(f)) { send(x, 404, "text/plain", "Not found".getBytes()); return; }
        send(x, 200, mime(rel), Files.readAllBytes(f), rel.startsWith("vendor/") ? "public, max-age=86400" : "no-store");
    }

    void handle(HttpExchange x) throws IOException {
        try {
            String path = x.getRequestURI().getPath(), m = x.getRequestMethod();
            if (!m.equals("GET") && !m.equals("POST")) { send(x, 405, "text/plain", "Method not allowed".getBytes()); return; }
            if (!path.startsWith("/api/")) { serveStatic(x, m, path); return; }
            Map<String, String> p = params(x);
            if (m.equals("GET") && path.equals("/api/ping")) { json(x, 200, "{\"ok\":true}"); return; }
            if (m.equals("POST") && path.equals("/api/login")) { login(x, p); return; }
            Sess s = session(x);
            if (s == null) throw new ApiEx(401, "Please sign in.");
            String key = m + " " + path;
            switch (key) {
                case "GET /api/state": json(x, 200, db.stateJson(s.user(), s.role())); return;
                case "POST /api/checkin": {
                    String plate = ParkingLot.normalize(p.getOrDefault("plate", "")), type = p.getOrDefault("type", "");
                    if (!ParkingLot.validPlate(plate)) throw new ApiEx(400, "Invalid plate format.");
                    if (!Set.of("car", "bike", "truck").contains(type)) throw new ApiEx(400, "Invalid vehicle type.");
                    json(x, 200, db.checkIn(plate, type, s.user(), p.getOrDefault("src", "")).json()); return;
                }
                case "POST /api/checkout": {
                    int id; try { id = Integer.parseInt(p.getOrDefault("id", "")); } catch (NumberFormatException e) { throw new ApiEx(400, "Bad ticket id."); }
                    json(x, 200, db.checkOut(id, s.user()).json()); return;
                }
                case "POST /api/logout": sessions.remove(x.getRequestHeaders().getFirst("X-Token")); json(x, 200, "{\"ok\":true}"); return;
                case "POST /api/exit": {
                    String plate = ParkingLot.normalize(p.getOrDefault("plate", ""));
                    if (!ParkingLot.validPlate(plate)) throw new ApiEx(400, "Invalid plate.");
                    json(x, 200, db.checkOutPlate(plate, s.user(), p.getOrDefault("src", "")).json()); return;
                }
                case "POST /api/password": {
                    String[] rec = db.user(s.user()); String np = p.getOrDefault("new", "");
                    if (!verify(p.getOrDefault("old", ""), rec[0])) throw new ApiEx(403, "Current password is wrong.");
                    if (np.length() < 8) throw new ApiEx(400, "New password must be at least 8 characters.");
                    db.setPassword(s.user(), hash(np)); json(x, 200, "{\"ok\":true}"); return;
                }
            }
            if (!s.role().equals("admin")) throw new ApiEx(403, "Admin only.");
            switch (key) {
                case "GET /api/reports": json(x, 200, db.reportsJson()); return;
                case "GET /api/audit": json(x, 200, db.auditJson()); return;
                case "GET /api/watchlist": json(x, 200, db.watchlistJson()); return;
                case "POST /api/watchlist": {
                    String plate = ParkingLot.normalize(p.getOrDefault("plate", ""));
                    if (!ParkingLot.validPlate(plate)) throw new ApiEx(400, "Invalid plate format.");
                    db.wlAdd(plate, p.getOrDefault("reason", "").trim(), s.user()); json(x, 200, "{\"ok\":true}"); return;
                }
                case "POST /api/watchlist/remove": db.wlRemove(ParkingLot.normalize(p.getOrDefault("plate", "")), s.user()); json(x, 200, "{\"ok\":true}"); return;
                case "POST /api/users": {
                    String u = p.getOrDefault("username", "").trim(), pw = p.getOrDefault("password", ""), role = p.getOrDefault("role", "attendant");
                    if (!u.matches("[A-Za-z0-9_.-]{3,30}")) throw new ApiEx(400, "Username: 3-30 letters, digits, . _ -");
                    if (pw.length() < 8) throw new ApiEx(400, "Password must be at least 8 characters.");
                    if (!Set.of("admin", "attendant").contains(role)) throw new ApiEx(400, "Bad role.");
                    db.addUser(u, hash(pw), role, s.user()); json(x, 200, "{\"ok\":true}"); return;
                }
                case "POST /api/backup": json(x, 200, db.backup(s.user())); return;
                default: throw new ApiEx(404, "Unknown endpoint.");
            }
        } catch (ApiEx e) {
            json(x, e.status, "{\"error\":" + Db.q(e.getMessage()) + "}");
        } catch (IOException e) {
            // client disconnected mid-response: nothing to do
        } catch (Exception e) {
            e.printStackTrace();
            json(x, 500, "{\"error\":\"Server error. Check the server console.\"}");
        }
    }
}
