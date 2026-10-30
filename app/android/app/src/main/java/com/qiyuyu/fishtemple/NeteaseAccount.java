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
 *   1. POST /api/netease/login/qr           → eapi unikey(type=3)，拿 key，生成二维码（ZXing）
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
    /** 和桌面版 createIdentity() 同一套设备指纹：少了它们，扫码在网易云看来就是一台没装过 App 的裸设备 */
    private String nuid;
    private String nnid;
    private String wnmcid;

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
        loadOrCreateIdentity();
    }

    /**
     * 设备身份要跨请求、跨重启稳定。旧版只存了一个 deviceId（device.txt），
     * 这里升级成 identity.json；老用户保留原 deviceId，其余字段补生成。
     */
    private void loadOrCreateIdentity() throws IOException {
        File identityFile = new File(dir, "identity.json");
        JSONObject identity = null;
        if (identityFile.isFile()) {
            try {
                identity = new JSONObject(new String(Files.readAllBytes(identityFile.toPath()), StandardCharsets.UTF_8));
            } catch (Exception ignored) { /* 文件坏了就重建 */ }
        }
        if (identity == null) {
            identity = new JSONObject();
            File oldDev = new File(dir, "device.txt");
            String oldId = "";
            if (oldDev.isFile()) {
                oldId = new String(Files.readAllBytes(oldDev.toPath()), StandardCharsets.UTF_8).trim();
            }
            identity.put("deviceId", oldId.matches("[0-9a-fA-F]{20,64}") ? oldId : randomDeviceId());
            identity.put("_ntes_nuid", hex(randomBytes(32)));
            identity.put("_ntes_nnid", identity.getString("_ntes_nuid") + "," + System.currentTimeMillis());
            identity.put("WNMCID", randomWnmcid());
            Files.write(identityFile.toPath(), identity.toString().getBytes(StandardCharsets.UTF_8));
        }
        deviceId = identity.optString("deviceId", "");
        nuid = identity.optString("_ntes_nuid", "");
        nnid = identity.optString("_ntes_nnid", "");
        wnmcid = identity.optString("WNMCID", "");
        // 旧文件只缺字段时补齐，不要因为一个身份文件把整个本地服务拦在启动页
        boolean changed = false;
        if (deviceId.isEmpty()) { deviceId = randomDeviceId(); identity.put("deviceId", deviceId); changed = true; }
        if (nuid.isEmpty()) { nuid = hex(randomBytes(32)); identity.put("_ntes_nuid", nuid); changed = true; }
        if (nnid.isEmpty()) { nnid = nuid + "," + System.currentTimeMillis(); identity.put("_ntes_nnid", nnid); changed = true; }
        if (wnmcid.isEmpty()) { wnmcid = randomWnmcid(); identity.put("WNMCID", wnmcid); changed = true; }
        if (changed) {
            Files.write(identityFile.toPath(), identity.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    /** 官网 / 上游客户端用的设备号形状：52 位大写十六进制。 */
    private String randomDeviceId() {
        String pool = "0123456789ABCDEF";
        StringBuilder sb = new StringBuilder(52);
        for (int i = 0; i < 52; i++) sb.append(pool.charAt(rnd.nextInt(16)));
        return sb.toString();
    }

    /** WNMCID 形状：6 个小写字母 + .时间戳.01.0 */
    private String randomWnmcid() {
        String letters = "abcdefghijklmnopqrstuvwxyz";
        StringBuilder sb = new StringBuilder(6);
        for (int i = 0; i < 6; i++) sb.append(letters.charAt(rnd.nextInt(26)));
        return sb + "." + System.currentTimeMillis() + ".01.0";
    }

    /** 扫码两步（unikey / client-login）必须共用这一份身份 */
    private Map<String, String> identityCookie() {
        Map<String, String> c = new LinkedHashMap<>();
        c.put("__remember_me", "true");
        c.put("ntes_kaola_ad", "1");
        c.put("_ntes_nuid", nuid);
        c.put("_ntes_nnid", nnid);
        c.put("WNMCID", wnmcid);
        c.put("WEVNSM", "1.0.0");
        c.put("osver", "Microsoft-Windows-10-Professional-build-19045-64bit");
        c.put("deviceId", deviceId);
        c.put("os", "pc");
        c.put("channel", "netease");
        c.put("appver", "3.1.17.204416");
        return c;
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
        // 上游 / 桌面版都是用 eapi 的 unikey（type=3），和后续 client-login 同一套身份。
        // 旧版走 weapi(type=1)、只带 4 个字段，扫码确认后经常只回 803 不下发 MUSIC_U。
        Map<String, String> cookie = identityCookie();

        HttpResult res = eapi("/api/login/qrcode/unikey", Json.obj("type", 3), cookie);
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

        // 轮询必须沿用要码时那台设备：同一份 deviceId / _ntes_nuid / WNMCID + 那一轮的 NMTID
        Map<String, String> cookie = identityCookie();
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

    /* ---------------- 云盘 / 每日推荐 / 登录态音频 ---------------- */

    static final class Bin {
        int status = 200;
        String type = "audio/mpeg";
        byte[] body = new byte[0];
        String error;
    }

    /** GET /api/netease/login/cloud */
    Out cloud(String sub, int limit, int offset) throws Exception {
        Map<String, String> b = readBinding(sub);
        if (!b.containsKey("MUSIC_U")) return Out.fail(403, "还没有绑定网易云账号");
        HttpResult r = weapi("/api/v1/cloud/get", Json.obj("limit", limit, "offset", offset), b);
        JSONArray data = r.body.optJSONArray("data");
        JSONArray out = new JSONArray();
        if (data != null) {
            for (int i = 0; i < data.length(); i++) {
                JSONObject it = data.getJSONObject(i);
                String sid = it.optString("songId", it.optString("id", ""));
                if (sid.isEmpty()) continue;
                JSONObject song = new JSONObject()
                        .put("id", sid)
                        .put("name", it.optString("songName", it.optString("name", "云盘曲目")))
                        .put("artists", new JSONArray().put(it.optString("artist", "")))
                        .put("album", it.optString("album", ""))
                        .put("cover", it.optString("cover", ""))
                        .put("duration", 0)
                        .put("fee", 0)
                        .put("cloud", true)
                        .put("audio", audioUrl(sub, sid));
                out.put(song);
            }
        }
        return Out.ok(Json.obj("ok", Boolean.TRUE, "count", out.length(), "songs", Json.raw(out.toString())));
    }

    /** GET /api/netease/login/recommend */
    Out recommend(String sub, int limit) throws Exception {
        Map<String, String> b = readBinding(sub);
        if (!b.containsKey("MUSIC_U")) return Out.fail(403, "还没有绑定网易云账号");
        HttpResult r = weapi("/api/v1/discovery/recommend/songs", Json.obj("limit", limit), b);
        JSONArray out = new JSONArray();
        JSONObject data = r.body.optJSONObject("data");
        JSONArray list = data == null ? r.body.optJSONArray("recommend") : data.optJSONArray("dailySongs");
        if (list != null) {
            for (int i = 0; i < list.length() && i < limit; i++) {
                JSONObject s = shape(list.getJSONObject(i));
                s.put("audio", audioUrl(sub, s.optString("id", "")));
                out.put(s);
            }
        }
        return Out.ok(Json.obj("ok", Boolean.TRUE, "count", out.length(), "songs", Json.raw(out.toString())));
    }

    /** POST /api/netease/login/urls —— 给一批曲目换登录态地址 */
    Out urls(String sub, JSONArray ids, String level) throws Exception {
        Map<String, String> b = readBinding(sub);
        if (!b.containsKey("MUSIC_U")) return Out.fail(403, "还没有绑定网易云账号");
        JSONObject out = new JSONObject();
        for (int i = 0; i < ids.length(); i++) {
            String id = ids.optString(i, "");
            if (!id.matches("\\d+")) continue;
            String url = resolveLogged(id, b, level);
            if (url != null) out.put(id, url);
        }
        return Out.ok(Json.obj("ok", Boolean.TRUE, "urls", Json.raw(out.toString())));
    }

    /** 给 `<audio>` 用的地址：媒体元素带不了 Bearer，所以签名放进 query */
    String audioUrl(String sub, String id) throws Exception {
        long exp = System.currentTimeMillis() + 6 * 3600 * 1000;
        return "/api/netease/login/audio?id=" + URLEncoder.encode(id, "UTF-8")
                + "&t=" + signState(sub, id, exp, "");
    }

    /** GET /api/netease/login/audio?id=&t= —— 用登录态解析地址并转发音频 */
    Bin audio(String sub, String id, String token, String range) throws Exception {
        if (!String.valueOf(id).matches("\\d+")) {
            Bin bad = new Bin();
            bad.status = 400;
            bad.error = "缺少合法的曲目 id";
            return bad;
        }
        if (token != null && !token.isEmpty()) {
            String[] parts = verifyState(token);
            if (!parts[0].equals(sub) || !parts[1].equals(id)) {
                Bin bad = new Bin();
                bad.status = 403;
                bad.error = "音频签名不匹配";
                return bad;
            }
        }
        Map<String, String> b = readBinding(sub);
        if (!b.containsKey("MUSIC_U")) {
            Bin bad = new Bin();
            bad.status = 403;
            bad.error = "还没有绑定网易云账号";
            return bad;
        }
        String url = resolveLogged(id, b, "exhigh");
        if (url == null) {
            Bin bad = new Bin();
            bad.status = 404;
            bad.error = "这首拿不到登录态音频（版权/会员限制）";
            return bad;
        }
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", UA_PC);
        c.setRequestProperty("Referer", "https://music.163.com/");
        if (range != null && !range.isEmpty()) c.setRequestProperty("Range", range);
        Bin r = new Bin();
        r.status = c.getResponseCode();
        String type = c.getContentType();
        if (type != null) r.type = type;
        InputStream in = r.status >= 400 ? c.getErrorStream() : c.getInputStream();
        r.body = in == null ? new byte[0] : readAll(in);
        c.disconnect();
        return r;
    }

    /** `<audio>` 带不了 Bearer：靠签名 token 认出是谁，再走 audio() */
    Bin audioByToken(String id, String token, String range) throws Exception {
        String sub;
        try {
            String[] parts = verifyState(token);
            sub = parts[0];
            if (!parts[1].equals(id)) throw new IllegalArgumentException("曲目不匹配");
        } catch (Exception e) {
            Bin bad = new Bin();
            bad.status = 403;
            bad.error = "音频签名无效：" + e.getMessage();
            return bad;
        }
        return audio(sub, id, "", range);
    }

    private String resolveLogged(String id, Map<String, String> cookie, String level) {
        try {
            HttpResult r = eapi("/api/song/enhance/player/url/v1",
                    Json.obj("ids", "[\"" + id + "\"]", "level", level == null ? "exhigh" : level, "encodeType", "flac"), cookie);
            JSONArray d = r.body.optJSONArray("data");
            if (d != null && d.length() > 0) {
                String u = d.getJSONObject(0).optString("url", "");
                if (!u.isEmpty()) return u.replaceFirst("^http://", "https://");
            }
        } catch (Exception ignored) { }
        try {
            HttpResult r = weapi("/api/song/enhance/player/url", Json.obj("ids", "[" + id + "]", "br", 128000), cookie);
            JSONArray d = r.body.optJSONArray("data");
            if (d != null && d.length() > 0) {
                String u = d.getJSONObject(0).optString("url", "");
                if (!u.isEmpty()) return u.replaceFirst("^http://", "https://");
            }
        } catch (Exception ignored) { }
        return null;
    }
}
