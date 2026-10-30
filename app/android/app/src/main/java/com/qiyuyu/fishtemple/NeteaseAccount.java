package com.qiyuyu.fishtemple;

import org.json.JSONArray;
import org.json.JSONObject;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * NeteaseAccount.java — 手机端的网易云账号链路（扫码登录 + 我的歌单）
 * ==================================================================
 * 对应桌面版的 netease-eapi.mjs + netease-login.mjs 里最要紧的那一段。
 * 安卓没有 Node，只能把加密重写一遍：
 *
 *   weapi  = AES-128-CBC(preset) → AES-128-CBC(随机 key) → base64，
 *            key 倒序补齐 128 字节后做 **RSA 无填充** 加密成 encSecKey
 *   eapi   = AES-128-ECB(key) 加密 "路径-36cd479b6b5-JSON-36cd479b6b5-MD5"，
 *            POST 到 interfacepc.music.163.com/eapi/...
 *
 * 只做「扫码登录 + 绑定 + 我的歌单」：
 *   1. POST /api/netease/login/qr           → weapi unikey，拿 key，生成二维码（ZXing）
 *   2. GET  /api/netease/login/qr/check     → eapi client/login，801/802/803/800
 *   3. 803 时把 MUSIC_U 存本地（按本站账号 sub 分开存）
 *   4. GET  /api/netease/login/playlists    → weapi user/playlist
 *   5. GET  /api/netease/login/playlist     → weapi v6/playlist/detail
 *   6. POST /api/netease/login/cookie       → 手动粘 MUSIC_U 的兜底
 *   7. POST /api/netease/login/logout
 *
 * 云盘 / 每日推荐 / 登录态音频没做：接口会回 501 并说明。
 */
final class NeteaseAccount {

    static final long QR_TTL_MS = 3 * 60 * 1000;

    private static final String EAPI_KEY = "e82ckenh8dichen8";
    private static final String EAPI_ORIGIN = "https://interfacepc.music.163.com";
    private static final String EAPI_UA = "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)";
    private static final String PREFIX = "-36cd479b6b5-";
    private static final String PRESET_KEY = "0CoJUm6Qyw8W8jud";
    private static final String WEAPI_IV = "0102030405060708";
    private static final String WEAPI_UA =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";
    private static final String WEAPI_PUBKEY =
            "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB";
    private static final String UA_PC =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    private final File dir;
    private final SecureRandom rnd = new SecureRandom();
    private String secret;
    private String deviceId;

    NeteaseAccount(File dataDir) throws IOException {
        dir = new File(dataDir, "netease");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("建不了 netease 目录");
        File secretFile = new File(dir, "secret.txt");
        if (secretFile.isFile()) {
            secret = new String(Files.readAllBytes(secretFile.toPath()), StandardCharsets.UTF_8).trim();
        } else {
            secret = hex(randomBytes(32));
            Files.write(secretFile.toPath(), secret.getBytes(StandardCharsets.UTF_8));
        }
        File devFile = new File(dir, "device.txt");
        if (devFile.isFile()) {
            deviceId = new String(Files.readAllBytes(devFile.toPath()), StandardCharsets.UTF_8).trim();
        } else {
            deviceId = hex(randomBytes(16));
            Files.write(devFile.toPath(), deviceId.getBytes(StandardCharsets.UTF_8));
        }
    }

    /* ---------------- 绑定存储 ---------------- */

    private File bindingFile(String sub) {
        return new File(dir, "bind-" + sha1(sub).substring(0, 24) + ".txt");
    }

    private Map<String, String> readBinding(String sub) {
        File f = bindingFile(sub);
        Map<String, String> out = new LinkedHashMap<>();
        if (!f.isFile()) return out;
        try {
            for (String line : Files.readAllLines(f.toPath(), StandardCharsets.UTF_8)) {
                int eq = line.indexOf('=');
                if (eq > 0) out.put(line.substring(0, eq), line.substring(eq + 1));
            }
        } catch (IOException ignored) { }
        return out;
    }

    private void writeBinding(String sub, Map<String, String> cookie, JSONObject profile) throws IOException {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : cookie.entrySet()) {
            sb.append(e.getKey()).append('=').append(String.valueOf(e.getValue()).replace("\n", " ")).append('\n');
        }
        sb.append("uid=").append(profile.optString("uid", "")).append('\n');
        sb.append("nickname=").append(profile.optString("nickname", "").replace("\n", " ")).append('\n');
        sb.append("avatar=").append(profile.optString("avatarUrl", "").replace("\n", " ")).append('\n');
        sb.append("boundAt=").append(System.currentTimeMillis()).append('\n');
        Files.write(bindingFile(sub).toPath(), sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    boolean bound(String sub) {
        return readBinding(sub).containsKey("MUSIC_U");
    }

    void unbind(String sub) throws IOException {
        Files.deleteIfExists(bindingFile(sub).toPath());
    }

    /* ---------------- 对外接口 ---------------- */

    static final class Out {
        int status = 200;
        String json;
        static Out ok(String json) { Out o = new Out(); o.json = json; return o; }
        static Out fail(int status, String msg) { Out o = new Out(); o.status = status;
            o.json = Json.obj("ok", Boolean.FALSE, "error", msg); return o; }
    }

    /** GET /api/netease/login/status */
    Out status(String sub, boolean owner) {
        boolean isBound = bound(sub);
        Map<String, String> b = readBinding(sub);
        StringBuilder reason = new StringBuilder();
        if (!isBound) reason.append("还没有绑定网易云账号");
        String boundJson = isBound ? Json.obj(
                "uid", b.getOrDefault("uid", ""),
                "nickname", b.getOrDefault("nickname", ""),
                "avatarUrl", b.getOrDefault("avatar", "")) : null;
        return Out.ok(Json.obj(
                "ok", Boolean.TRUE,
                "enabled", Boolean.TRUE,
                "mode", owner ? "owner" : "members",
                "riskNotice", "这是第三方登录：扫码后本机会保管一个网易云登录凭据。据公开反馈，第三方客户端登录有被判定异常的风险，介意的话用小号。",
                "qrTtl", QR_TTL_MS / 1000,
                "canBind", Boolean.TRUE,
                "reason", reason.toString(),
                "siteUser", Json.raw(Json.obj("sub", sub, "role", owner ? "owner" : "member")),
                "bound", boundJson == null ? null : Json.raw(boundJson)));
    }

    /** POST /api/netease/login/qr */
    Out qr(String sub) throws Exception {
        Map<String, String> cookie = new LinkedHashMap<>();
        cookie.put("os", "pc");
        cookie.put("appver", "3.1.17.204416");
        cookie.put("osver", "Microsoft-Windows-10-Professional-build-19045-64bit");
        cookie.put("channel", "netease");

        HttpResult res = weapi("/api/login/qrcode/unikey", Json.obj("type", 1), cookie);
        JSONObject body = res.body;
        int code = body.optInt("code", 0);
        String key = body.optString("unikey", "");
        if (code != 200 || key.isEmpty()) {
            return Out.fail(502, body.optString("message", "网易云没有给出扫码 key（code " + code + "）"));
        }
        if (res.cookie.containsKey("NMTID")) cookie.put("NMTID", res.cookie.get("NMTID"));

        long exp = System.currentTimeMillis() + QR_TTL_MS;
        String state = signState(sub, key, exp, cookie.getOrDefault("NMTID", ""));
        String qrUrl = "https://music.163.com/login?codekey=" + URLEncoder.encode(key, "UTF-8");
        return Out.ok(Json.obj("ok", Boolean.TRUE, "key", key, "state", state,
                "qrUrl", qrUrl, "qrSvg", QrSvg.of(qrUrl, 240), "expiresIn", QR_TTL_MS / 1000));
    }

    /** GET /api/netease/login/qr/check?key=&state= */
    Out checkQr(String sub, String key, String state) throws Exception {
        String[] parts;
        try { parts = verifyState(state); } catch (Exception e) { return Out.fail(400, e.getMessage()); }
        if (!parts[0].equals(sub)) return Out.fail(400, "这个二维码不是发给你的，请重新生成");
        if (!parts[1].equals(key)) return Out.fail(400, "二维码 key 与状态不匹配，请重新生成");
        if (Long.parseLong(parts[2]) < System.currentTimeMillis()) {
            return Out.ok(Json.obj("ok", Boolean.TRUE, "status", "expired", "code", 800, "message", "二维码已过期，请重新生成"));
        }

        Map<String, String> cookie = new LinkedHashMap<>();
        cookie.put("os", "pc");
        cookie.put("appver", "3.1.17.204416");
        cookie.put("osver", "Microsoft-Windows-10-Professional-build-19045-64bit");
        cookie.put("channel", "netease");
        if (parts.length > 3 && !parts[3].isEmpty()) cookie.put("NMTID", parts[3]);

        HttpResult res = eapi("/api/login/qrcode/client/login", Json.obj("key", key, "type", 3), cookie);
        int code = res.body.optInt("code", 0);
        if (code == 803) {
            for (Map.Entry<String, String> e : res.cookie.entrySet()) {
                if (e.getValue() != null && !e.getValue().isEmpty()) cookie.put(e.getKey(), e.getValue());
            }
            if (!cookie.containsKey("MUSIC_U")) {
                return Out.ok(Json.obj("ok", Boolean.TRUE, "status", "error", "code", code,
                        "message", "扫码确认了，但网易云没有下发登录凭据（MUSIC_U），请重试"));
            }
            JSONObject profile = fetchProfile(cookie);
            writeBinding(sub, cookie, profile);
            return Out.ok(Json.obj("ok", Boolean.TRUE, "status", "confirmed", "code", code, "message", "登录成功",
                    "profile", Json.raw(Json.obj(
                            "uid", profile.optString("uid", ""),
                            "nickname", profile.optString("nickname", ""),
                            "avatarUrl", profile.optString("avatarUrl", "")))));
        }
        String status;
        String message;
        switch (code) {
            case 800: status = "expired"; message = "二维码已过期，请重新生成"; break;
            case 801: status = "waiting"; message = "等待扫码"; break;
            case 802: status = "scanned"; message = "已扫码，请在手机上点「确认登录」"; break;
            case 8821: status = "risk"; message = "网易云判定这次登录有风险（8821），稍后再试或改用官方客户端"; break;
            default: status = "error"; message = res.body.optString("message", "网易云返回了未预期的结果（code " + code + "）");
        }
        return Out.ok(Json.obj("ok", Boolean.TRUE, "status", status, "code", code, "message", message));
    }

    /** POST /api/netease/login/cookie —— 手动粘 MUSIC_U 的兜底 */
    Out bindCookie(String sub, String raw) throws Exception {
        String musicU = null;
        for (String part : String.valueOf(raw).split("[;\\s]+")) {
            String t = part.trim().replaceAll("^[\"']|[\"']$", "");
            if (t.startsWith("MUSIC_U=")) { musicU = t.substring(8); break; }
        }
        if (musicU == null && String.valueOf(raw).matches("[A-Za-z0-9%._\\-]{20,}")) musicU = String.valueOf(raw).trim();
        if (musicU == null || musicU.length() < 20) {
            return Out.fail(400, "没找到 MUSIC_U：请复制 `MUSIC_U=…` 那一整行（或只复制等号后面的值）");
        }
        Map<String, String> cookie = new LinkedHashMap<>();
        cookie.put("MUSIC_U", musicU);
        cookie.put("os", "pc");
        cookie.put("appver", "3.1.17.204416");
        cookie.put("osver", "Microsoft-Windows-10-Professional-build-19045-64bit");
        cookie.put("channel", "netease");
        JSONObject profile = fetchProfile(cookie);
        if (profile.optString("uid", "").isEmpty()) {
            return Out.fail(401, "这个 MUSIC_U 无效或已过期（网易云没有返回账号信息），请重新复制一个");
        }
        writeBinding(sub, cookie, profile);
        return Out.ok(Json.obj("ok", Boolean.TRUE,
                "profile", Json.raw(Json.obj("uid", profile.optString("uid", ""),
                        "nickname", profile.optString("nickname", ""),
                        "avatarUrl", profile.optString("avatarUrl", "")))));
    }

    /** GET /api/netease/login/playlists */
    Out playlists(String sub) throws Exception {
        Map<String, String> b = readBinding(sub);
        if (!b.containsKey("MUSIC_U")) return Out.fail(403, "还没有绑定网易云账号");
        String uid = b.getOrDefault("uid", "");
        if (uid.isEmpty()) return Out.fail(409, "绑定时没读到账号 id，请退出后重新扫码");
        HttpResult res = weapi("/api/user/playlist", Json.obj("uid", uid, "limit", 80, "offset", 0, "includeVideo", Boolean.TRUE), b);
        JSONArray list = res.body.optJSONArray("playlist");
        JSONArray out = new JSONArray();
        if (list != null) {
            for (int i = 0; i < list.length(); i++) {
                JSONObject p = list.getJSONObject(i);
                out.put(new JSONObject()
                        .put("id", p.optString("id", ""))
                        .put("name", p.optString("name", ""))
                        .put("cover", p.optString("coverImgUrl", ""))
                        .put("trackCount", p.optInt("trackCount", 0))
                        .put("creator", p.optJSONObject("creator") == null ? "" : p.getJSONObject("creator").optString("nickname", ""))
                        .put("private", p.optBoolean("privacy", false))
                        .put("subscribed", p.optBoolean("subscribed", false)));
            }
        }
        return Out.ok(Json.obj("ok", Boolean.TRUE, "count", out.length(), "playlists", Json.raw(out.toString())));
    }

    /** GET /api/netease/login/playlist?id= */
    Out playlist(String sub, String id, int limit) throws Exception {
        Map<String, String> b = readBinding(sub);
        if (!b.containsKey("MUSIC_U")) return Out.fail(403, "还没有绑定网易云账号");
        if (!String.valueOf(id).matches("\\d+")) return Out.fail(400, "缺少合法的歌单 id");
        HttpResult res = weapi("/api/v6/playlist/detail", Json.obj("id", id, "n", limit, "s", 8), b);
        JSONObject pl = res.body.optJSONObject("playlist");
        if (pl == null) return Out.fail(404, "歌单不存在或不可访问");
        JSONArray tracks = new JSONArray();
        JSONArray raw = pl.optJSONArray("tracks");
        if (raw != null) for (int i = 0; i < raw.length(); i++) tracks.put(shape(raw.getJSONObject(i)));
        JSONArray ids = new JSONArray();
        JSONArray rawIds = pl.optJSONArray("trackIds");
        if (rawIds != null) for (int i = 0; i < rawIds.length() && i < limit; i++) ids.put(rawIds.getJSONObject(i).optString("id", ""));
        return Out.ok(Json.obj("ok", Boolean.TRUE, "playlist", Json.raw(Json.obj(
                "id", pl.optString("id", id),
                "name", pl.optString("name", ""),
                "cover", pl.optString("coverImgUrl", ""),
                "creator", pl.optJSONObject("creator") == null ? "" : pl.getJSONObject("creator").optString("nickname", ""),
                "description", pl.optString("description", ""),
                "trackCount", pl.optInt("trackCount", tracks.length()),
                "trackIds", Json.raw(ids.toString()),
                "tracks", Json.raw(tracks.toString())))));
    }

    Out logout(String sub) throws IOException {
        unbind(sub);
        return Out.ok(Json.obj("ok", Boolean.TRUE));
    }

    private static JSONObject shape(JSONObject s) throws Exception {
        JSONArray artists = s.optJSONArray("ar");
        if (artists == null) artists = s.optJSONArray("artists");
        JSONObject album = s.optJSONObject("al");
        if (album == null) album = s.optJSONObject("album");
        JSONArray names = new JSONArray();
        if (artists != null) for (int i = 0; i < artists.length(); i++) {
            String n = artists.getJSONObject(i).optString("name", "");
            if (!n.isEmpty()) names.put(n);
        }
        return new JSONObject()
                .put("id", s.optString("id", ""))
                .put("name", s.optString("name", ""))
                .put("artists", names)
                .put("album", album == null ? "" : album.optString("name", ""))
                .put("cover", album == null ? "" : album.optString("picUrl", ""))
                .put("duration", Math.round(s.optLong("dt", s.optLong("duration", 0)) / 1000.0))
                .put("fee", s.optInt("fee", 0));
    }

    /* ---------------- 身份 / 资料 ---------------- */

    private JSONObject fetchProfile(Map<String, String> cookie) throws Exception {
        try {
            HttpResult res = weapi("/api/nuser/account/get", Json.obj(), cookie);
            JSONObject profile = res.body.optJSONObject("profile");
            if (profile != null) {
                return new JSONObject()
                        .put("uid", profile.optString("userId", ""))
                        .put("nickname", profile.optString("nickname", ""))
                        .put("avatarUrl", profile.optString("avatarUrl", ""));
            }
        } catch (Exception ignored) { }
        try {
            HttpResult res = eapi("/api/nuser/account/get", Json.obj(), cookie);
            JSONObject profile = res.body.optJSONObject("profile");
            if (profile != null) {
                return new JSONObject()
                        .put("uid", profile.optString("userId", ""))
                        .put("nickname", profile.optString("nickname", ""))
                        .put("avatarUrl", profile.optString("avatarUrl", ""));
            }
        } catch (Exception ignored) { }
        return new JSONObject().put("uid", "").put("nickname", "（未读到昵称）").put("avatarUrl", "");
    }

    private JSONObject header(Map<String, String> cookie) throws Exception {
        JSONObject h = new JSONObject();
        h.put("osver", cookie.getOrDefault("osver", "Microsoft-Windows-10-Professional-build-19045-64bit"));
        h.put("deviceId", deviceId);
        h.put("os", cookie.getOrDefault("os", "pc"));
        h.put("appver", cookie.getOrDefault("appver", "3.1.17.204416"));
        h.put("versioncode", "140");
        h.put("mobilename", "");
        h.put("buildver", String.valueOf(System.currentTimeMillis() / 1000));
        h.put("resolution", "1920x1080");
        h.put("__csrf", cookie.getOrDefault("__csrf", ""));
        h.put("channel", cookie.getOrDefault("channel", "netease"));
        h.put("requestId", System.currentTimeMillis() + "_" + String.format("%04d", rnd.nextInt(1000)));
        for (String name : new String[]{"MUSIC_U", "MUSIC_A", "NMTID"}) {
            if (cookie.containsKey(name)) h.put(name, cookie.get(name));
        }
        return h;
    }

    /* ---------------- 加密 ---------------- */

    static final class HttpResult {
        int status;
        JSONObject body;
        Map<String, String> cookie = new LinkedHashMap<>();
    }

    private HttpResult weapi(String uri, String dataJson, Map<String, String> cookie) throws Exception {
        JSONObject data = new JSONObject(dataJson);
        data.put("csrf_token", cookie.getOrDefault("__csrf", ""));
        String text = data.toString();

        String secretKey = randomBase62(16);
        String inner = base64(aesCbc(text, PRESET_KEY));
        String params = base64(aesCbc(inner, secretKey));

        byte[] padded = new byte[128];
        byte[] rev = new StringBuilder(secretKey).reverse().toString().getBytes(StandardCharsets.UTF_8);
        System.arraycopy(rev, 0, padded, 128 - rev.length, rev.length);
        PublicKey key = KeyFactory.getInstance("RSA")
                .generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(WEAPI_PUBKEY)));
        Cipher rsa = Cipher.getInstance("RSA/ECB/NoPadding");
        rsa.init(Cipher.ENCRYPT_MODE, key);
        String encSecKey = hex(rsa.doFinal(padded));

        String body = "params=" + URLEncoder.encode(params, "UTF-8")
                + "&encSecKey=" + URLEncoder.encode(encSecKey, "UTF-8");
        String url = "https://music.163.com/weapi/" + uri.replaceFirst("^/api/", "")
                + "?csrf_token=" + URLEncoder.encode(cookie.getOrDefault("__csrf", ""), "UTF-8");

        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(8000);
        c.setReadTimeout(15000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        c.setRequestProperty("Referer", "https://music.163.com/");
        c.setRequestProperty("User-Agent", WEAPI_UA);
        c.setRequestProperty("Cookie", cookieString(cookie));
        c.setRequestProperty("Accept", "*/*");
        try (OutputStream out = c.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
        return readResult(c);
    }

    private HttpResult eapi(String uri, String dataJson, Map<String, String> cookie) throws Exception {
        JSONObject payload = new JSONObject(dataJson);
        payload.put("e_r", false);
        payload.put("header", header(cookie));
        String text = payload.toString();
        String digest = md5("nobody" + uri + "use" + text + "md5forencrypt");
        String plain = uri + PREFIX + text + PREFIX + digest;
        String params = hex(aesEcb(plain)).toUpperCase(Locale.ROOT);

        String url = EAPI_ORIGIN + "/eapi/" + uri.replaceFirst("^/api/", "");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(8000);
        c.setReadTimeout(15000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        c.setRequestProperty("User-Agent", EAPI_UA);
        c.setRequestProperty("Cookie", cookieString(cookie));
        c.setRequestProperty("Accept", "*/*");
        try (OutputStream out = c.getOutputStream()) {
            out.write(("params=" + URLEncoder.encode(params, "UTF-8")).getBytes(StandardCharsets.UTF_8));
        }
        return readResult(c);
    }

    private HttpResult readResult(HttpURLConnection c) throws Exception {
        int status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        String text = in == null ? "" : new String(readAll(in), StandardCharsets.UTF_8);
        HttpResult r = new HttpResult();
        r.status = status;
        try {
            r.body = new JSONObject(text);
        } catch (Exception e) {
            r.body = new JSONObject().put("code", status);
        }
        Map<String, List<String>> fields = c.getHeaderFields();
        if (fields != null) {
            for (Map.Entry<String, List<String>> e : fields.entrySet()) {
                if (e.getKey() == null || !e.getKey().equalsIgnoreCase("set-cookie")) continue;
                for (String raw : e.getValue()) parseSetCookie(raw, r.cookie);
            }
        }
        c.disconnect();
        return r;
    }

    private static void parseSetCookie(String raw, Map<String, String> out) {
        if (raw == null || raw.isEmpty()) return;
        String pair = raw.split(";", 2)[0];
        int eq = pair.indexOf('=');
        if (eq <= 0) return;
        out.put(pair.substring(0, eq).trim(), pair.substring(eq + 1).trim());
    }

    private static String cookieString(Map<String, String> cookie) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : cookie.entrySet()) {
            if (e.getValue() == null || e.getValue().isEmpty()) continue;
            if (sb.length() > 0) sb.append("; ");
            sb.append(e.getKey()).append('=').append(e.getValue());
        }
        return sb.toString();
    }

    private static byte[] aesCbc(String text, String key) throws Exception {
        Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES"),
                new IvParameterSpec(WEAPI_IV.getBytes(StandardCharsets.UTF_8)));
        return c.doFinal(text.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] aesEcb(String text) throws Exception {
        Cipher c = Cipher.getInstance("AES/ECB/PKCS5Padding");
        c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(EAPI_KEY.getBytes(StandardCharsets.UTF_8), "AES"));
        return c.doFinal(text.getBytes(StandardCharsets.UTF_8));
    }

    private String signState(String sub, String key, long exp, String nmtid) throws Exception {
        String payload = sub + "\n" + key + "\n" + exp + "\n" + (nmtid == null ? "" : nmtid);
        String body = base64url(payload.getBytes(StandardCharsets.UTF_8));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return body + "." + base64url(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    private String[] verifyState(String state) throws Exception {
        int dot = String.valueOf(state).indexOf('.');
        if (dot <= 0) throw new IllegalArgumentException("扫码状态格式不对，请重新生成二维码");
        String body = state.substring(0, dot);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String want = base64url(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        if (!MessageDigest.isEqual(want.getBytes(StandardCharsets.UTF_8), state.substring(dot + 1).getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException("扫码状态校验失败，请重新生成二维码");
        }
        return new String(Base64.getUrlDecoder().decode(body), StandardCharsets.UTF_8).split("\n", -1);
    }

    /* ---------------- 工具 ---------------- */

    private static String randomBase62(int n) {
        String alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        StringBuilder sb = new StringBuilder(n);
        SecureRandom r = new SecureRandom();
        for (int i = 0; i < n; i++) sb.append(alphabet.charAt(r.nextInt(alphabet.length())));
        return sb.toString();
    }

    private byte[] randomBytes(int n) {
        byte[] b = new byte[n];
        rnd.nextBytes(b);
        return b;
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
        return buf.toByteArray();
    }

    private static String base64(byte[] b) { return Base64.getEncoder().encodeToString(b); }
    private static String base64url(byte[] b) { return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x & 0xff));
        return sb.toString();
    }

    private static String md5(String s) throws Exception {
        MessageDigest md = MessageDigest.getInstance("MD5");
        return hex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
    }

    private static String sha1(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest(s.getBytes(StandardCharsets.UTF_8))) sb.append(String.format("%02x", b & 0xff));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
