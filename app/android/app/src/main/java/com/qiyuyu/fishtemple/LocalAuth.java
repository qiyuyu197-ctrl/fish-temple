package com.qiyuyu.fishtemple;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * LocalAuth.java — 安卓版本机账号系统
 * ==================================================================
 * 和桌面版的 auth-local.mjs 是**同一套契约**：同样是
 *   POST /api/auth/local/register|login、GET /api/auth/me、
 *   Authorization: Bearer <token>，连响应字段都对齐
 * （ok / token / user{sub,email,name,role,verified} / expiresIn）。
 * 所以前端 src/plugins/auth.js 一行都不用改。
 *
 * 差别只在实现上：
 *   · PBKDF2WithHmacSHA256（Android 没有 scrypt）
 *   · 用户表是 tab 分隔的纯文本，没有 JSON 依赖
 *   · 令牌载荷是换行分隔的字段，base64url 之后再 HMAC-SHA256 签名
 *
 * 这份代码不碰 Android API，所以能在普通 JVM 上直接跑单测
 * （见 tools/verify-android-server.mjs）。
 */
final class LocalAuth {

    static final long TTL_MS = 30L * 24 * 3600 * 1000;
    private static final int ITERATIONS = 120_000;
    private static final int MIN_PASSWORD = 6;
    private static final int MAX_USERS = 50;
    private static final int MAX_FAILS = 8;
    private static final long FAIL_WINDOW_MS = 10L * 60 * 1000;

    private final File usersFile;
    private final File secretFile;
    private byte[] secret;
    private final List<User> users = new ArrayList<>();
    private final Map<String, int[]> fails = new ConcurrentHashMap<>();   // email → {n, atSecond}
    private final SecureRandom rnd = new SecureRandom();

    static final class User {
        String id;
        String email;
        String name;
        String role;
        String salt;      // base64url
        String hash;      // base64url
        String created;

        Map<String, Object> asPublic() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("sub", "local:" + id);
            m.put("email", email);
            m.put("name", name == null || name.isEmpty() ? email.split("@")[0] : name);
            m.put("picture", "");
            m.put("verified", Boolean.TRUE);
            m.put("role", "owner".equals(role) ? "owner" : "member");
            m.put("source", "local");
            return m;
        }
    }

    static final class Result {
        final int status;
        final String token;
        final User user;
        final String error;

        private Result(int status, String token, User user, String error) {
            this.status = status;
            this.token = token;
            this.user = user;
            this.error = error;
        }

        static Result ok(String token, User user) { return new Result(200, token, user, null); }
        static Result fail(int status, String error) { return new Result(status, null, null, error); }
    }

    LocalAuth(File dataDir) throws IOException {
        File authDir = new File(dataDir, "auth");
        if (!authDir.exists() && !authDir.mkdirs()) throw new IOException("建不了 auth 目录：" + authDir);
        usersFile = new File(authDir, "users.tsv");
        secretFile = new File(authDir, "secret.txt");
        load();
    }

    /* ---------------- 持久化 ---------------- */

    private void load() throws IOException {
        if (!secretFile.exists()) {
            secret = new byte[32];
            rnd.nextBytes(secret);
            Files.write(secretFile.toPath(), Base64u.encode(secret).getBytes(StandardCharsets.UTF_8));
        } else {
            secret = Base64u.decode(new String(Files.readAllBytes(secretFile.toPath()), StandardCharsets.UTF_8).trim());
        }
        users.clear();
        if (!usersFile.exists()) return;
        for (String line : Files.readAllLines(usersFile.toPath(), StandardCharsets.UTF_8)) {
            if (line.trim().isEmpty()) continue;
            String[] p = line.split("\t", -1);
            if (p.length < 7) continue;
            User u = new User();
            u.id = p[0];
            u.email = p[1];
            u.name = p[2];
            u.role = p[3];
            u.salt = p[4];
            u.hash = p[5];
            u.created = p[6];
            users.add(u);
        }
    }

    private void save() throws IOException {
        StringBuilder sb = new StringBuilder();
        for (User u : users) {
            sb.append(clean(u.id)).append('\t')
              .append(clean(u.email)).append('\t')
              .append(clean(u.name)).append('\t')
              .append(clean(u.role)).append('\t')
              .append(clean(u.salt)).append('\t')
              .append(clean(u.hash)).append('\t')
              .append(clean(u.created)).append('\n');
        }
        File tmp = new File(usersFile.getParentFile(), usersFile.getName() + ".tmp");
        Files.write(tmp.toPath(), sb.toString().getBytes(StandardCharsets.UTF_8));
        Files.deleteIfExists(usersFile.toPath());
        Files.move(tmp.toPath(), usersFile.toPath());
    }

    private static String clean(String s) {
        return s == null ? "" : s.replace("\t", " ").replace("\n", " ").replace("\r", " ");
    }

    synchronized int count() { return users.size(); }

    /* ---------------- 注册 / 登录 ---------------- */

    private static boolean emailLooksOk(String email) {
        if (email == null) return false;
        int at = email.indexOf('@');
        int dot = email.lastIndexOf('.');
        return at > 0 && dot > at + 1 && dot < email.length() - 1 && email.indexOf(' ') < 0;
    }

    private static String norm(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    synchronized Result register(String email, String password, String name) throws IOException {
        String mail = norm(email);
        if (!emailLooksOk(mail)) return Result.fail(400, "邮箱格式看起来不对");
        if (password == null || password.length() < MIN_PASSWORD) return Result.fail(400, "密码至少 " + MIN_PASSWORD + " 位");
        if (password.length() > 200) return Result.fail(400, "密码太长了");
        for (User u : users) if (u.email.equals(mail)) return Result.fail(409, "这个邮箱已经注册过了，直接登录");
        if (users.size() >= MAX_USERS) return Result.fail(429, "本机最多 " + MAX_USERS + " 个账号");

        User u = new User();
        byte[] id = new byte[8];
        rnd.nextBytes(id);
        u.id = Base64u.hex(id);
        u.email = mail;
        u.name = name == null ? "" : name.trim();
        if (u.name.length() > 40) u.name = u.name.substring(0, 40);
        if (u.name.isEmpty()) u.name = mail.split("@")[0];
        u.role = users.isEmpty() ? "owner" : "member";     // 第一个注册的就是站长
        byte[] salt = new byte[16];
        rnd.nextBytes(salt);
        u.salt = Base64u.encode(salt);
        u.hash = Base64u.encode(pbkdf2(password, salt, ITERATIONS));
        u.created = String.valueOf(System.currentTimeMillis());
        users.add(u);
        save();
        return Result.ok(issue(u), u);
    }

    synchronized Result login(String email, String password) throws IOException {
        String mail = norm(email);
        if (throttled(mail)) return Result.fail(429, "失败次数太多，稍后再试");
        User found = null;
        for (User u : users) if (u.email.equals(mail)) { found = u; break; }
        boolean ok = found != null && password != null
                && constantTimeEquals(pbkdf2(password, Base64u.decode(found.salt), ITERATIONS), Base64u.decode(found.hash));
        if (!ok) {
            noteFail(mail);
            return Result.fail(401, "邮箱或密码不对");
        }
        fails.remove(mail);
        return Result.ok(issue(found), found);
    }

    private boolean throttled(String mail) {
        int[] rec = fails.get(mail);
        if (rec == null) return false;
        if (System.currentTimeMillis() / 1000 - rec[1] > FAIL_WINDOW_MS / 1000) { fails.remove(mail); return false; }
        return rec[0] >= MAX_FAILS;
    }

    private void noteFail(String mail) {
        int[] rec = fails.get(mail);
        int now = (int) (System.currentTimeMillis() / 1000);
        if (rec == null || now - rec[1] > FAIL_WINDOW_MS / 1000) fails.put(mail, new int[]{1, now});
        else { rec[0]++; rec[1] = now; }
    }

    /* ---------------- 令牌 ---------------- */

    private String issue(User u) {
        long now = System.currentTimeMillis();
        String payload = String.join("\n",
                "local:" + u.id, u.email, clean(u.name), u.role,
                String.valueOf(now), String.valueOf(now + TTL_MS));
        String body = Base64u.encode(payload.getBytes(StandardCharsets.UTF_8));
        return body + "." + Base64u.encode(hmac(body));
    }

    /** 校验令牌；失败抛 IllegalArgumentException（调用方回 401） */
    Map<String, String> verify(String token) {
        if (token == null) throw new IllegalArgumentException("需要登录");
        int dot = token.indexOf('.');
        if (dot <= 0) throw new IllegalArgumentException("令牌格式不对");
        String body = token.substring(0, dot);
        String sig = token.substring(dot + 1);
        if (!constantTimeEquals(hmac(body), Base64u.decode(sig))) throw new IllegalArgumentException("签名校验失败");
        String raw = new String(Base64u.decode(body), StandardCharsets.UTF_8);
        String[] f = raw.split("\n", -1);
        if (f.length < 6) throw new IllegalArgumentException("令牌内容损坏");
        long exp = Long.parseLong(f[5]);
        if (exp <= System.currentTimeMillis()) throw new IllegalArgumentException("登录已过期");
        String sub = f[0];
        User u = null;
        synchronized (this) {
            for (User x : users) if (("local:" + x.id).equals(sub)) { u = x; break; }
        }
        if (u == null) throw new IllegalArgumentException("账号已不存在");
        Map<String, String> claims = new LinkedHashMap<>();
        claims.put("sub", sub);
        claims.put("email", u.email);
        claims.put("name", u.name);
        claims.put("role", u.role);
        return claims;
    }

    private byte[] hmac(String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] pbkdf2(String password, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, 256);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a == null || b == null || a.length != b.length) return false;
        int diff = 0;
        for (int i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
        return diff == 0;
    }

    /* ---------------- base64url ---------------- */

    static final class Base64u {
        private static final char[] ALPHABET =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".toCharArray();
        private static final int[] REVERSE = new int[128];

        static {
            java.util.Arrays.fill(REVERSE, -1);
            for (int i = 0; i < ALPHABET.length; i++) REVERSE[ALPHABET[i]] = i;
        }

        static String encode(byte[] data) {
            StringBuilder sb = new StringBuilder((data.length * 4 + 2) / 3);
            int i = 0;
            while (i + 2 < data.length) {
                int n = ((data[i] & 0xff) << 16) | ((data[i + 1] & 0xff) << 8) | (data[i + 2] & 0xff);
                sb.append(ALPHABET[(n >> 18) & 63]).append(ALPHABET[(n >> 12) & 63])
                  .append(ALPHABET[(n >> 6) & 63]).append(ALPHABET[n & 63]);
                i += 3;
            }
            int rest = data.length - i;
            if (rest == 1) {
                int n = (data[i] & 0xff) << 16;
                sb.append(ALPHABET[(n >> 18) & 63]).append(ALPHABET[(n >> 12) & 63]);
            } else if (rest == 2) {
                int n = ((data[i] & 0xff) << 16) | ((data[i + 1] & 0xff) << 8);
                sb.append(ALPHABET[(n >> 18) & 63]).append(ALPHABET[(n >> 12) & 63]).append(ALPHABET[(n >> 6) & 63]);
            }
            return sb.toString();
        }

        static byte[] decode(String s) {
            if (s == null) return new byte[0];
            int len = s.length();
            while (len > 0 && s.charAt(len - 1) == '=') len--;
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(len * 3 / 4 + 3);
            int buf = 0;
            int bits = 0;
            for (int i = 0; i < len; i++) {
                char c = s.charAt(i);
                int v = c < 128 ? REVERSE[c] : -1;
                if (v < 0) continue;
                buf = (buf << 6) | v;
                bits += 6;
                if (bits >= 8) {
                    bits -= 8;
                    out.write((buf >> bits) & 0xff);
                }
            }
            return out.toByteArray();
        }

        static String hex(byte[] data) {
            StringBuilder sb = new StringBuilder(data.length * 2);
            for (byte b : data) sb.append(String.format("%02x", b & 0xff));
            return sb.toString();
        }
    }
}
