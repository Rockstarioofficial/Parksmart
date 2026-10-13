package parking;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/** All database access. Every query uses PreparedStatement (no SQL injection). */
public class Db {
    private final String url, user, pass;

    public Db(Properties p) {
        url = p.getProperty("db.url");
        user = p.getProperty("db.user");
        pass = p.getProperty("db.password");
    }

    Connection conn() throws SQLException { return DriverManager.getConnection(url, user, pass); }

    public static String q(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default: if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    record Rec(int id, String plate, String type, String slot, long in, Long out, double fee) {
        String json() {
            return "{\"id\":" + id + ",\"plate\":" + q(plate) + ",\"type\":" + q(type) + ",\"slot\":" + q(slot)
                    + ",\"in\":" + in + ",\"out\":" + (out == null ? "null" : out) + ",\"fee\":" + fee + "}";
        }
    }

    public void init(String adminHashOrPw, java.util.function.Function<String, String> hasher) throws Exception {
        try (Connection c = conn(); Statement st = c.createStatement()) {
            String sql = new String(Db.class.getResourceAsStream("/schema.sql").readAllBytes(), StandardCharsets.UTF_8);
            for (String s : sql.split(";\\s*\\n")) if (!s.isBlank()) st.execute(s);
            String[][] zones = {{"A", "bike", "8"}, {"B", "car", "12"}, {"C", "truck", "4"}};
            int seq = 0;
            try (PreparedStatement ps = c.prepareStatement("INSERT IGNORE INTO slots(id,type,seq) VALUES(?,?,?)")) {
                for (String[] z : zones)
                    for (int i = 1; i <= Integer.parseInt(z[2]); i++) {
                        ps.setString(1, z[0] + i); ps.setString(2, z[1]); ps.setInt(3, ++seq); ps.executeUpdate();
                    }
            }
            if (one(c, "SELECT COUNT(*) FROM users").equals("0")) {
                try (PreparedStatement ps = c.prepareStatement("INSERT INTO users(username,pass_hash,role) VALUES('admin',?,'admin')")) {
                    ps.setString(1, hasher.apply(adminHashOrPw)); ps.executeUpdate();
                }
                System.out.println("Created first admin login: admin / " + adminHashOrPw + "  (change it!)");
            }
        }
    }

    private static String one(Connection c, String sql, Object... a) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < a.length; i++) ps.setObject(i + 1, a[i]);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? rs.getString(1) : null; }
        }
    }

    /** Runs a query and returns [[v,v,..],..] as JSON (numbers raw, everything else quoted). */
    String table(Connection c, String sql, Object... a) throws SQLException {
        StringBuilder b = new StringBuilder("[");
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < a.length; i++) ps.setObject(i + 1, a[i]);
            try (ResultSet rs = ps.executeQuery()) {
                int n = rs.getMetaData().getColumnCount(); boolean first = true;
                while (rs.next()) {
                    b.append(first ? "[" : ",["); first = false;
                    for (int i = 1; i <= n; i++) {
                        Object o = rs.getObject(i);
                        b.append(i > 1 ? "," : "").append(o instanceof Number ? o.toString() : q(rs.getString(i)));
                    }
                    b.append("]");
                }
            }
        }
        return b.append("]").toString();
    }

    void audit(Connection c, String who, String action, String detail) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO audit_log(username,action,detail) VALUES(?,?,?)")) {
            ps.setString(1, cut(who, 40)); ps.setString(2, cut(action, 30)); ps.setString(3, cut(detail, 200)); ps.executeUpdate();
        }
    }
    public void audit(String who, String action, String detail) throws SQLException {
        try (Connection c = conn()) { audit(c, who, action, detail); }
    }
    private static String cut(String s, int n) { return s == null ? "" : s.length() > n ? s.substring(0, n) : s; }

    private static final String SEL = "SELECT id,plate,type,slot_id,CAST(UNIX_TIMESTAMP(in_time)*1000 AS UNSIGNED),"
            + "IF(out_time IS NULL,NULL,CAST(UNIX_TIMESTAMP(out_time)*1000 AS UNSIGNED)),fee FROM tickets ";

    private Rec rec(ResultSet rs) throws SQLException {
        long o = rs.getLong(6); Long out = rs.wasNull() ? null : o;
        return new Rec(rs.getInt(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getLong(5), out, rs.getDouble(7));
    }
    private Rec get(Connection c, int id) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(SEL + "WHERE id=?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) { rs.next(); return rec(rs); }
        }
    }

    public String stateJson(String who, String role) throws SQLException {
        StringBuilder b = new StringBuilder("{\"now\":" + System.currentTimeMillis() + ",\"user\":" + q(who) + ",\"role\":" + q(role) + ",\"tickets\":[");
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement(SEL
                + "WHERE out_time IS NULL OR out_time>=CURDATE() OR id IN (SELECT id FROM (SELECT id FROM tickets "
                + "WHERE out_time IS NOT NULL ORDER BY out_time DESC LIMIT 8) x) ORDER BY id");
             ResultSet rs = ps.executeQuery()) {
            boolean first = true;
            while (rs.next()) { b.append(first ? "" : ",").append(rec(rs).json()); first = false; }
        }
        return b.append("]}").toString();
    }

    public Rec checkIn(String plate, String type, String by, String src) throws Exception {
        try (Connection c = conn()) {
            String reason = one(c, "SELECT reason FROM watchlist WHERE plate=?", plate);
            if (reason != null) {
                audit(c, by, "BLOCKED", plate + " is on watchlist: " + reason);
                throw new ApiEx(403, "WATCHLIST ALERT: " + plate + " (" + reason + "). Do not admit - inform security.");
            }
            if (!"1".equals(one(c, "SELECT GET_LOCK('parksmart_alloc',10)"))) throw new ApiEx(503, "System busy, please retry.");
            c.setAutoCommit(false);
            try {
                if (one(c, "SELECT id FROM tickets WHERE active_plate=? FOR UPDATE", plate) != null)
                    throw new ApiEx(409, plate + " is already parked.");
                String slot = one(c, "SELECT s.id FROM slots s LEFT JOIN tickets t ON t.active_slot=s.id "
                        + "WHERE s.type=? AND t.id IS NULL ORDER BY s.seq LIMIT 1 FOR UPDATE", type);
                if (slot == null) throw new ApiEx(409, "SlotNotAvailable: no free " + type + " slots.");
                int id;
                try (PreparedStatement ps = c.prepareStatement("INSERT INTO tickets(plate,type,slot_id,in_time,active_plate,active_slot,checked_in_by) "
                        + "VALUES(?,?,?,NOW(3),?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, plate); ps.setString(2, type); ps.setString(3, slot);
                    ps.setString(4, plate); ps.setString(5, slot); ps.setString(6, by);
                    ps.executeUpdate();
                    try (ResultSet k = ps.getGeneratedKeys()) { k.next(); id = k.getInt(1); }
                }
                audit(c, by, "gate".equals(src) ? "CHECKIN_AUTO" : "CHECKIN", plate + " -> slot " + slot + " (#" + id + ")");
                c.commit();
                return get(c, id);
            } catch (SQLIntegrityConstraintViolationException e) {
                c.rollback();
                throw new ApiEx(409, "That slot or vehicle was just taken by another device. Try again.");
            } catch (Exception e) { c.rollback(); throw e; }
            finally { try { one(c, "SELECT RELEASE_LOCK('parksmart_alloc')"); } catch (SQLException ignored) { } }
        }
    }

    public Rec checkOutPlate(String plate, String by, String src) throws Exception {
        String id;
        try (Connection c = conn()) { id = one(c, "SELECT id FROM tickets WHERE active_plate=?", plate); }
        if (id == null) throw new ApiEx(404, plate + " is not parked.");
        return checkOut(Integer.parseInt(id), by, src);
    }

    public Rec checkOut(int id, String by) throws Exception { return checkOut(id, by, ""); }

    public Rec checkOut(int id, String by, String src) throws Exception {
        try (Connection c = conn()) {
            c.setAutoCommit(false);
            try {
                String plate, type; long secs;
                try (PreparedStatement ps = c.prepareStatement("SELECT plate,type,TIMESTAMPDIFF(SECOND,in_time,NOW(3)) FROM tickets WHERE id=? AND out_time IS NULL FOR UPDATE")) {
                    ps.setInt(1, id);
                    try (ResultSet rs = ps.executeQuery()) {
                        if (!rs.next()) throw new ApiEx(404, "Ticket not found or already checked out.");
                        plate = rs.getString(1); type = rs.getString(2); secs = rs.getLong(3);
                    }
                }
                double fee = new FeeCalculator().calculateFee((secs + 59) / 60, Vehicle.of(type, plate));
                try (PreparedStatement ps = c.prepareStatement("UPDATE tickets SET out_time=NOW(3),fee=?,active_plate=NULL,active_slot=NULL,checked_out_by=? WHERE id=?")) {
                    ps.setDouble(1, fee); ps.setString(2, by); ps.setInt(3, id); ps.executeUpdate();
                }
                audit(c, by, "gate".equals(src) ? "CHECKOUT_AUTO" : "CHECKOUT", plate + " paid Rs." + (long) fee + " (#" + id + ")");
                c.commit();
                return get(c, id);
            } catch (Exception e) { c.rollback(); throw e; }
        }
    }

    public String reportsJson() throws SQLException {
        try (Connection c = conn()) {
            return "{\"daily\":" + table(c, "SELECT DATE(out_time),COUNT(*),COALESCE(SUM(fee),0) FROM tickets WHERE out_time>=CURDATE()-INTERVAL 6 DAY GROUP BY DATE(out_time) ORDER BY 1")
                    + ",\"hours\":" + table(c, "SELECT HOUR(in_time),COUNT(*) FROM tickets GROUP BY HOUR(in_time) ORDER BY 1")
                    + ",\"types\":" + table(c, "SELECT type,COUNT(*),COALESCE(SUM(fee),0) FROM tickets GROUP BY type ORDER BY 1")
                    + ",\"top\":" + table(c, "SELECT plate,COUNT(*) FROM tickets GROUP BY plate ORDER BY 2 DESC,1 LIMIT 5") + "}";
        }
    }
    public String auditJson() throws SQLException {
        try (Connection c = conn()) {
            return table(c, "SELECT DATE_FORMAT(at,'%d %b %H:%i:%s'),username,action,detail FROM audit_log ORDER BY id DESC LIMIT 60");
        }
    }
    public String watchlistJson() throws SQLException {
        try (Connection c = conn()) { return table(c, "SELECT plate,reason,added_by FROM watchlist ORDER BY added_at DESC"); }
    }
    public void wlAdd(String plate, String reason, String by) throws SQLException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement("INSERT INTO watchlist(plate,reason,added_by) VALUES(?,?,?) ON DUPLICATE KEY UPDATE reason=VALUES(reason)")) {
            ps.setString(1, plate); ps.setString(2, cut(reason, 120)); ps.setString(3, by); ps.executeUpdate();
            audit(c, by, "WATCHLIST_ADD", plate + " " + reason);
        }
    }
    public void wlRemove(String plate, String by) throws SQLException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement("DELETE FROM watchlist WHERE plate=?")) {
            ps.setString(1, plate); ps.executeUpdate(); audit(c, by, "WATCHLIST_REMOVE", plate);
        }
    }
    public String[] user(String name) throws SQLException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement("SELECT pass_hash,role FROM users WHERE username=?")) {
            ps.setString(1, name);
            try (ResultSet rs = ps.executeQuery()) { return rs.next() ? new String[]{rs.getString(1), rs.getString(2)} : null; }
        }
    }
    public void addUser(String name, String hash, String role, String by) throws Exception {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement("INSERT INTO users(username,pass_hash,role) VALUES(?,?,?)")) {
            ps.setString(1, name); ps.setString(2, hash); ps.setString(3, role); ps.executeUpdate();
            audit(c, by, "USER_ADD", name + " (" + role + ")");
        } catch (SQLIntegrityConstraintViolationException e) { throw new ApiEx(409, "Username already exists."); }
    }
    public void setPassword(String name, String hash) throws SQLException {
        try (Connection c = conn(); PreparedStatement ps = c.prepareStatement("UPDATE users SET pass_hash=? WHERE username=?")) {
            ps.setString(1, hash); ps.setString(2, name); ps.executeUpdate(); audit(c, name, "PASSWORD_CHANGE", "");
        }
    }

    /** Writes CSV copies of the main tables to backups/<timestamp>/ . */
    public String backup(String by) throws Exception {
        Path dir = Paths.get("backups", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")));
        Files.createDirectories(dir);
        String[][] jobs = {{"tickets", "SELECT * FROM tickets"}, {"audit_log", "SELECT * FROM audit_log"},
                {"watchlist", "SELECT * FROM watchlist"}, {"users", "SELECT id,username,role,created_at FROM users"}};
        StringBuilder res = new StringBuilder();
        try (Connection c = conn()) {
            for (String[] j : jobs) {
                int rows = 0;
                try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(j[1]);
                     BufferedWriter w = Files.newBufferedWriter(dir.resolve(j[0] + ".csv"))) {
                    int n = rs.getMetaData().getColumnCount();
                    for (int i = 1; i <= n; i++) w.write((i > 1 ? "," : "") + rs.getMetaData().getColumnLabel(i));
                    w.newLine();
                    while (rs.next()) {
                        for (int i = 1; i <= n; i++) { String v = rs.getString(i); w.write((i > 1 ? "," : "") + "\"" + (v == null ? "" : v.replace("\"", "\"\"")) + "\""); }
                        w.newLine(); rows++;
                    }
                }
                res.append(res.length() > 0 ? "," : "").append(q(j[0])).append(":").append(rows);
            }
            audit(c, by, "BACKUP", dir.toString());
        }
        return "{\"folder\":" + q(dir.toString()) + ",\"rows\":{" + res + "}}";
    }
}
