package com.qiyuyu.fishtemple;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * RemoteApi.java — 移动端的「外网代理」
 * ==================================================================
 * 桌面版靠 server.mjs 代理这些接口；安卓跑不了 Node，所以在 Java 里重做一遍
 * **匿名可用**的那部分：
 *
 *   /api/netease/search     搜索（三个公开入口依次回退，和 server.mjs 一样）
 *   /api/netease/song       曲目详情
 *   /api/netease/lyric      歌词（行级 LRC + 译文；逐字 yrc 需要加密接口，这里留空）
 *   /api/netease/audio      音频流转发（跟随 302 到 CDN，支持 Range / HEAD）
 *   /api/netease/playlist   公开歌单（v6，含 trackIds）
 *   /api/pixiv/random       随机插画（api.lolicon.app）
 *   /api/pixiv/image        图片代理 + 磁盘缓存（pixiv.re）
 *   /api/pixiv/illust       按 id 出图
 *
 * **没有做**：网易云扫码登录（/api/netease/login/*）。那需要 eapi 加密
 * （AES+RSA-noPadding）、扫码状态机和一个二维码编码器 —— 见 README 的说明，
 * 这一块会明确回 501，不会假装能用。
 *
 * 不碰 Android API，所以同样能在桌面的 JVM 上跑真测试。
 */
final class RemoteApi {

    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    private static final String NETEASE_ORIGIN = "https://music.163.com";
    private static final String NETEASE_COOKIE = "os=pc; appver=2.9.7; osver=Microsoft-Windows-10-Professional-build-19045-64bit; channel=netease";
    private static final String PIXIV_MIRROR = "https://pixiv.re";
    private static final String PIXIV_ORIGIN = "https://www.pixiv.net";
    private static final String PIXIV_API = "https://api.lolicon.app/setu/v2";
    private static final int MAX_BYTES = 24 * 1024 * 1024;

    static final class Result {
        int status = 200;
        String type = "application/json; charset=utf-8";
        byte[] body = new byte[0];
        Map<String, String> headers = new LinkedHashMap<>();

        static Result json(String text) { return json(200, text); }

        static Result json(int status, String text) {
            Result r = new Result();
            r.status = status;
            r.body = text.getBytes(StandardCharsets.UTF_8);
            return r;
        }

        static Result fail(int status, String message) {
            return json(status, Json.obj("ok", Boolean.FALSE, "error", message));
        }
    }

    private final File cacheDir;
    private final Map<String, long[]> cacheMeta = new ConcurrentHashMap<>();
    private final Map<String, byte[]> cache = new ConcurrentHashMap<>();

    RemoteApi(File cacheDir) {
        this.cacheDir = cacheDir;
        if (!cacheDir.exists()) cacheDir.mkdirs();
    }

    boolean handles(String path) {
        return path.startsWith("/api/netease/") || path.startsWith("/api/pixiv/");
    }

    Result handle(String method, String path, String rawQuery) {
        Map<String, String> q = parseQuery(rawQuery);
        try {
            if (path.startsWith("/api/netease/login/")) {
                return Result.fail(501,
                        "移动版暂不支持网易云账号登录：扫码要 eapi 加密和二维码编码，安卓端还没实现。公开搜索/试听可用。");
            }
            switch (path) {
                case "/api/netease/search": return neteaseSearch(q);
                case "/api/netease/song": return neteaseSongs(q);
                case "/api/netease/lyric": return neteaseLyric(q);
                case "/api/netease/playable": return neteasePlayable(q);
                case "/api/netease/audio": return neteaseAudio(method, q);
                case "/api/netease/playlist": return neteasePlaylist(q);
                case "/api/netease/resolve":
                    return Result.fail(501, "移动版暂不支持展开 163cn.tv 短链，请直接粘贴歌单 id 或完整链接");
                case "/api/pixiv/random": return pixivRandom(q);
                case "/api/pixiv/image": return pixivImage(q);
                case "/api/pixiv/illust": return pixivIllust(q);
                case "/api/pixiv/status":
                    return Result.json(Json.obj("ok", Boolean.TRUE, "api", PIXIV_API, "mirror", PIXIV_MIRROR,
                            "size", "small", "note", "移动端 Java 代理：随机 + 图片缓存；无抽卡池/预取"));
                default: return Result.fail(404, "未知接口：" + path);
            }
        } catch (Exception e) {
            return Result.fail(502, "上游请求失败：" + e.getMessage());
        }
    }

    /* ---------------- 网易云 ---------------- */

    private Result neteaseSearch(Map<String, String> q) throws Exception {
        String kw = q.getOrDefault("keywords", "").trim();
        if (kw.isEmpty()) return Result.fail(400, "缺少 keywords");
        int limit = clampInt(q.get("limit"), 30, 1, 100);
        int offset = clampInt(q.get("offset"), 0, 0, 10000);

        String cacheKey = "search|" + kw + "|" + limit + "|" + offset;
        Result hit = fromCache(cacheKey, 5 * 60 * 1000);
        if (hit != null) return hit;

        String enc = URLEncoder.encode(kw, "UTF-8");
        JSONArray songs = new JSONArray();
        int total = 0;
        String via = null;

        // ① GET /api/search/get/web
        try {
            JSONObject data = getJson(NETEASE_ORIGIN + "/api/search/get/web?csrf_token=&s=" + enc
                    + "&type=1&offset=" + offset + "&limit=" + limit, NETEASE_HEADERS);
            songs = songsOf(data);
            total = data.optJSONObject("result") != null ? data.optJSONObject("result").optInt("songCount", songs.length()) : songs.length();
            if (songs.length() > 0) via = "search/get/web·GET";
        } catch (Exception ignored) { }

        // ② POST /api/cloudsearch/pc
        if (songs.length() == 0) {
            try {
                JSONObject data = postForm(NETEASE_ORIGIN + "/api/cloudsearch/pc",
                        "s=" + enc + "&type=1&offset=" + offset + "&limit=" + limit + "&total=true", NETEASE_HEADERS);
                JSONArray got = songsOf(data);
                if (got.length() > 0) { songs = got; via = "cloudsearch/pc·POST"; total = got.length(); }
            } catch (Exception ignored) { }
        }

        // ③ GET /api/search/suggest/web
        if (songs.length() == 0) {
            try {
                JSONObject data = getJson(NETEASE_ORIGIN + "/api/search/suggest/web?csrf_token=&s=" + enc
                        + "&limit=" + limit, NETEASE_HEADERS);
                JSONArray got = songsOf(data);
                if (got.length() > 0) { songs = got; via = "search/suggest/web·GET"; total = got.length(); }
            } catch (Exception ignored) { }
        }

        if (songs.length() == 0) return Result.fail(503, "网易云搜索暂时没有结果（可能被限流，稍后再试）");
        String body = Json.obj("ok", Boolean.TRUE, "songs", Json.raw(songs.toString()),
                "total", total, "via", via);
        return store(cacheKey, body);
    }

    private Result neteaseSongs(Map<String, String> q) throws Exception {
        String id = q.getOrDefault("id", "").trim();
        if (!id.matches("\\d{4,12}")) return Result.fail(400, "缺少合法的曲目 id");
        String cacheKey = "song|" + id;
        Result hit = fromCache(cacheKey, 30 * 60 * 1000);
        if (hit != null) return hit;

        JSONObject data = getJson(NETEASE_ORIGIN + "/api/song/detail?ids=%5B" + id + "%5D", NETEASE_HEADERS);
        JSONArray songs = new JSONArray();
        JSONArray raw = data.optJSONArray("songs");
        if (raw != null) for (int i = 0; i < raw.length(); i++) songs.put(shapeSong(raw.getJSONObject(i)));
        if (songs.length() == 0) return Result.fail(404, "曲目不存在");
        return store(cacheKey, Json.obj("ok", Boolean.TRUE, "songs", Json.raw(songs.toString())));
    }

    private Result neteaseLyric(Map<String, String> q) throws Exception {
        String id = q.getOrDefault("id", "").trim();
        if (!id.matches("\\d{4,12}")) return Result.fail(400, "缺少合法的曲目 id");
        String cacheKey = "lyric|" + id;
        Result hit = fromCache(cacheKey, 6 * 60 * 60 * 1000);
        if (hit != null) return hit;

        JSONObject data = getJson(NETEASE_ORIGIN + "/api/song/lyric?id=" + id + "&lv=-1&kv=-1&tv=-1", NETEASE_HEADERS);
        String lrc = optText(data, "lrc");
        String tlyric = optText(data, "tlyric");
        boolean noLyric = lrc.trim().length() < 2;
        return store(cacheKey, Json.obj("ok", Boolean.TRUE, "id", id, "lrc", lrc, "yrc", "",
                "tlyric", tlyric, "nolyric", noLyric ? Boolean.TRUE : Boolean.FALSE));
    }

    private Result neteasePlayable(Map<String, String> q) throws Exception {
        String id = q.getOrDefault("id", "").trim();
        if (!id.matches("\\d{4,12}")) return Result.fail(400, "缺少合法的曲目 id");
        boolean ok = false;
        long bytes = 0;
        String audio = null;
        try {
            audio = resolveAudio(id);
            if (audio != null) {
                HttpURLConnection c = open(audio, "HEAD", NETEASE_HEADERS, 8000);
                ok = c.getResponseCode() >= 200 && c.getResponseCode() < 400;
                bytes = Math.max(0, c.getContentLengthLong());
                c.disconnect();
            }
        } catch (Exception ignored) { }
        return Result.json(Json.obj("ok", Boolean.TRUE,
                "playable", Json.raw(Json.obj(id, Json.raw(Json.obj("playable", ok, "bytes", bytes)))),
                "audio", audio == null ? null : "/api/netease/audio?id=" + id));
    }

    private Result neteaseAudio(String method, Map<String, String> q) throws Exception {
        String id = q.getOrDefault("id", "").trim();
        if (!id.matches("\\d{4,12}")) return Result.fail(400, "缺少合法的曲目 id");
        try {
            String audio = resolveAudio(id);
            if (audio == null) return Result.fail(404, "这首没有匿名可用的音频（会员 / 版权受限）");
            HttpURLConnection c = open(audio, "HEAD".equals(method) ? "HEAD" : "GET", NETEASE_HEADERS, 15000);
            int status = c.getResponseCode();
            if (status == 404 || status >= 500) { c.disconnect(); return Result.fail(404, "音频上游返回 " + status); }
            Result r = new Result();
            r.status = 200;
            String type = c.getContentType();
            r.type = type == null ? "audio/mpeg" : type;
            if ("HEAD".equals(method)) { c.disconnect(); return r; }
            try (InputStream in = c.getInputStream()) {
                r.body = readAll(in);
            }
            r.headers.put("Accept-Ranges", "none");
            return r;
        } catch (Exception e) {
            return Result.fail(502, "音频转发失败：" + e.getMessage());
        }
    }

    /** 解析一个匿名可播的音频地址：官方外链 → enhance 接口（都不需要加密） */
    private String resolveAudio(String id) throws IOException {
        String cacheKey = "audio|" + id;
        Result hit = fromCache(cacheKey, 10 * 60 * 1000);
        if (hit != null) return new String(hit.body, StandardCharsets.UTF_8);

        String outer = NETEASE_ORIGIN + "/song/media/outer/url?id=" + id + ".mp3";
        HttpURLConnection c = open(outer, "GET", NETEASE_HEADERS, 10000);
        c.setInstanceFollowRedirects(false);
        int status = c.getResponseCode();
        String location = c.getHeaderField("Location");
        c.disconnect();
        String found = null;
        if (status >= 300 && status < 400 && location != null && !location.contains("/404")) {
            found = location.startsWith("http") ? location : NETEASE_ORIGIN + location;
        } else if (status == 200) {
            found = outer;
        }
        if (found == null) {
            try {
                JSONObject data = getJson(NETEASE_ORIGIN + "/api/song/enhance/player/url?ids=%5B" + id + "%5D&br=128000", NETEASE_HEADERS);
                JSONArray arr = data.optJSONArray("data");
                if (arr != null && arr.length() > 0) {
                    String u = arr.getJSONObject(0).optString("url", "");
                    if (!u.isEmpty()) found = u;
                }
            } catch (Exception ignored) { }
        }
        // 网易云的 CDN 地址常是 http:// —— 本 App 全局禁明文（usesCleartextTraffic=false），
        // HttpURLConnection 也会被拦，所以统一升级成 https（CDN 两边都支持）。
        if (found != null) found = found.replaceFirst("^http://", "https://");
        if (found != null) store(cacheKey, found);
        return found;
    }

    private Result neteasePlaylist(Map<String, String> q) throws Exception {
        String id = q.getOrDefault("id", "").trim();
        if (!id.matches("\\d+")) return Result.fail(400, "缺少合法的歌单 id");
        int limit = clampInt(q.get("limit"), 300, 1, 1000);
        JSONObject data = getJson(NETEASE_ORIGIN + "/api/v6/playlist/detail?id=" + id + "&n=" + limit + "&s=8", NETEASE_HEADERS);
        JSONObject pl = data.optJSONObject("playlist");
        if (pl == null) return Result.fail(404, "歌单不存在或不可访问（私密歌单需要登录）");

        JSONArray trackIds = new JSONArray();
        JSONArray rawIds = pl.optJSONArray("trackIds");
        if (rawIds != null) {
            for (int i = 0; i < rawIds.length() && i < limit; i++) {
                trackIds.put(String.valueOf(rawIds.getJSONObject(i).optLong("id")));
            }
        }
        JSONArray tracks = new JSONArray();
        JSONArray rawTracks = pl.optJSONArray("tracks");
        if (rawTracks != null) for (int i = 0; i < rawTracks.length(); i++) tracks.put(shapeSong(rawTracks.getJSONObject(i)));

        String body = Json.obj("ok", Boolean.TRUE, "playlist", Json.raw(Json.obj(
                "id", pl.optString("id", id),
                "name", pl.optString("name", "未命名歌单"),
                "cover", pl.optString("coverImgUrl", ""),
                "creator", pl.optJSONObject("creator") == null ? "" : pl.getJSONObject("creator").optString("nickname", ""),
                "description", pl.optString("description", ""),
                "trackCount", pl.optInt("trackCount", trackIds.length()),
                "trackIds", Json.raw(trackIds.toString()),
                "tracks", Json.raw(tracks.toString()))));
        return Result.json(body);
    }

    private static JSONArray songsOf(JSONObject data) throws Exception {
        JSONArray out = new JSONArray();
        if (data == null) return out;
        JSONObject result = data.optJSONObject("result");
        JSONArray arr = result != null ? result.optJSONArray("songs") : data.optJSONArray("songs");
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) out.put(shapeSong(arr.getJSONObject(i)));
        return out;
    }

    /** 和 server.mjs 的 shapeSong 对齐：前端认 id/name/artists/album/cover/duration/fee */
    private static JSONObject shapeSong(JSONObject s) throws Exception {
        JSONArray artists = s.optJSONArray("artists");
        if (artists == null) artists = s.optJSONArray("ar");
        JSONObject album = s.optJSONObject("album");
        if (album == null) album = s.optJSONObject("al");
        JSONArray names = new JSONArray();
        if (artists != null) {
            for (int i = 0; i < artists.length(); i++) {
                String n = artists.getJSONObject(i).optString("name", null);
                if (n != null) names.put(n);
            }
        }
        long dur = s.optLong("duration", s.optLong("dt", 0));
        JSONObject o = new JSONObject();
        o.put("id", s.optString("id", ""));
        o.put("name", s.optString("name", ""));
        o.put("artists", names);
        o.put("album", album == null ? "" : album.optString("name", ""));
        o.put("cover", album == null ? "" : album.optString("picUrl", ""));
        o.put("duration", Math.round(dur / 1000.0));
        o.put("fee", s.optInt("fee", 0));
        return o;
    }

    private static String optText(JSONObject data, String key) {
        JSONObject o = data.optJSONObject(key);
        return o == null ? "" : o.optString("lyric", "");
    }

    /* ---------------- Pixiv ---------------- */

    private Result pixivRandom(Map<String, String> q) throws Exception {
        int num = clampInt(q.get("num"), 12, 1, 20);
        JSONArray items = new JSONArray();
        String url = PIXIV_API + "?r18=0&num=" + num + "&size=small&proxy=i.pixiv.re";
        String extra = q.get("exclude");
        if (extra != null && !extra.trim().isEmpty()) {
            StringBuilder ex = new StringBuilder();
            for (String s : extra.split(",")) {
                String t = s.trim();
                if (!t.matches("\\d+")) continue;
                if (ex.length() > 0) ex.append(',');
                ex.append('"').append(t).append('"');
            }
            if (ex.length() > 0) url += "&exclude=" + URLEncoder.encode("[" + ex + "]", "UTF-8");
        }
        JSONObject data = getJson(url, PIXIV_API_HEADERS);
        JSONArray arr = data.optJSONArray("data");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.getJSONObject(i);
                String pid = it.optString("pid", "");
                if (pid.isEmpty()) continue;
                JSONObject urls = it.optJSONObject("urls");
                String src = urls == null ? "" : urls.optString("small", "");
                JSONArray tags = new JSONArray();
                JSONArray rawTags = it.optJSONArray("tags");
                if (rawTags != null) for (int t = 0; t < rawTags.length(); t++) tags.put(rawTags.getString(t));
                items.put(new JSONObject()
                        .put("pid", pid)
                        .put("uid", it.optString("uid", ""))
                        .put("title", it.optString("title", "Pixiv " + pid))
                        .put("author", it.optString("author", ""))
                        .put("tags", tags)
                        .put("width", it.optInt("width", 0))
                        .put("height", it.optInt("height", 0))
                        .put("r18", false)
                        .put("url", proxied(src))
                        .put("full", "")
                        .put("sourceUrl", src)
                        .put("pageUrl", PIXIV_ORIGIN + "/artworks/" + pid));
            }
        }
        if (items.length() == 0) return Result.fail(503, "Pixiv 上游暂时没有结果（可能被限流），稍后再试");
        return Result.json(Json.obj("ok", Boolean.TRUE, "mirror", PIXIV_MIRROR,
                "count", items.length(), "items", Json.raw(items.toString())));
    }

    private Result pixivIllust(Map<String, String> q) throws Exception {
        String id = q.getOrDefault("id", "").trim();
        if (!id.matches("\\d{4,12}")) return Result.fail(400, "缺少合法的作品 id");
        int p = clampInt(q.get("p"), 0, 0, 50);
        String raw = p > 0 ? PIXIV_MIRROR + "/" + id + "-" + p + ".jpg" : PIXIV_MIRROR + "/" + id + ".jpg";
        JSONObject item = new JSONObject();
        item.put("pid", id).put("p", p).put("uid", "").put("title", "Pixiv " + id).put("author", "PIXIV");
        item.put("tags", new JSONArray()).put("width", 0).put("height", 0).put("r18", false);
        item.put("url", proxied(raw)).put("full", "").put("sourceUrl", raw);
        item.put("pageUrl", PIXIV_ORIGIN + "/artworks/" + id);
        return Result.json(Json.obj("ok", Boolean.TRUE, "item", Json.raw(item.toString())));
    }

    private Result pixivImage(Map<String, String> q) throws Exception {
        String raw = q.getOrDefault("url", "");
        if (raw.isEmpty()) return Result.fail(400, "缺少 url");
        String host;
        try { host = new URL(raw).getHost().toLowerCase(Locale.ROOT); }
        catch (Exception e) { return Result.fail(400, "url 不合法"); }
        if (!(host.equals("pixiv.re") || host.equals("i.pixiv.re") || host.equals("i.pximg.net"))) {
            return Result.fail(400, "只代理 Pixiv 镜像域名");
        }
        try {
            File cached = new File(cacheDir, "pixiv-" + sha1(raw) + ".img");
            if (cached.isFile() && cached.length() > 1024) {
                Result r = new Result();
                r.type = guessImageType(raw);
                r.body = java.nio.file.Files.readAllBytes(cached.toPath());
                return r;
            }
            HttpURLConnection c = open(raw, "GET", PIXIV_IMG_HEADERS, 20000);
            int status = c.getResponseCode();
            if (status != 200) { c.disconnect(); return Result.fail(502, "图片上游返回 " + status); }
            byte[] data;
            try (InputStream in = c.getInputStream()) { data = readAll(in); }
            if (data.length > 4096) {
                try { java.nio.file.Files.write(cached.toPath(), data); } catch (IOException ignored) { }
            }
            Result r = new Result();
            r.type = c.getContentType() == null ? guessImageType(raw) : c.getContentType();
            r.body = data;
            return r;
        } catch (Exception e) {
            return Result.fail(502, "图片代理失败：" + e.getMessage());
        }
    }

    private static String proxied(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        return "/api/pixiv/image?url=" + URLEncoder.encode(raw);
    }

    private static String guessImageType(String raw) {
        String s = raw.toLowerCase(Locale.ROOT);
        if (s.endsWith(".png")) return "image/png";
        if (s.endsWith(".webp")) return "image/webp";
        if (s.endsWith(".gif")) return "image/gif";
        return "image/jpeg";
    }

    /* ---------------- HTTP / JSON ---------------- */

    static final Map<String, String> NETEASE_HEADERS = new LinkedHashMap<>();
    static final Map<String, String> PIXIV_HEADERS = new LinkedHashMap<>();
    /** lolicon 的接口会拒绝带 pixiv Referer 的请求（403），所以 API 用干净的头 */
    static final Map<String, String> PIXIV_API_HEADERS = new LinkedHashMap<>();
    static final Map<String, String> PIXIV_IMG_HEADERS = new LinkedHashMap<>();

    static {
        NETEASE_HEADERS.put("User-Agent", UA);
        NETEASE_HEADERS.put("Referer", NETEASE_ORIGIN + "/");
        NETEASE_HEADERS.put("Cookie", NETEASE_COOKIE);
        NETEASE_HEADERS.put("Accept", "*/*");

        PIXIV_HEADERS.put("User-Agent", UA);
        PIXIV_HEADERS.put("Referer", PIXIV_ORIGIN + "/");
        PIXIV_HEADERS.put("Accept", "application/json");

        PIXIV_API_HEADERS.put("User-Agent", UA);
        PIXIV_API_HEADERS.put("Accept", "application/json");

        PIXIV_IMG_HEADERS.put("User-Agent", UA);
        PIXIV_IMG_HEADERS.put("Referer", PIXIV_ORIGIN + "/");
        PIXIV_IMG_HEADERS.put("Accept", "image/avif,image/webp,image/*,*/*;q=0.8");
    }

    private static HttpURLConnection open(String url, String method, Map<String, String> headers, int timeoutMs)
            throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(8000);
        c.setReadTimeout(timeoutMs);
        c.setInstanceFollowRedirects(true);
        for (Map.Entry<String, String> e : headers.entrySet()) c.setRequestProperty(e.getKey(), e.getValue());
        return c;
    }

    private static JSONObject getJson(String url, Map<String, String> headers) throws Exception {
        HttpURLConnection c = open(url, "GET", headers, 15000);
        int status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        String text = in == null ? "" : new String(readAll(in), StandardCharsets.UTF_8);
        c.disconnect();
        if (status >= 400) throw new IOException("HTTP " + status);
        return new JSONObject(text);
    }

    private static JSONObject postForm(String url, String form, Map<String, String> headers) throws Exception {
        HttpURLConnection c = open(url, "POST", headers, 15000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        try (OutputStream out = c.getOutputStream()) {
            out.write(form.getBytes(StandardCharsets.UTF_8));
        }
        int status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        String text = in == null ? "" : new String(readAll(in), StandardCharsets.UTF_8);
        c.disconnect();
        if (status >= 400) throw new IOException("HTTP " + status);
        return new JSONObject(text);
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream(64 * 1024);
        byte[] chunk = new byte[16 * 1024];
        int n;
        int total = 0;
        while ((n = in.read(chunk)) > 0) {
            total += n;
            if (total > MAX_BYTES) break;
            buf.write(chunk, 0, n);
        }
        return buf.toByteArray();
    }

    /* ---------------- 小工具 ---------------- */

    private static Map<String, String> parseQuery(String raw) {
        Map<String, String> out = new LinkedHashMap<>();
        if (raw == null || raw.isEmpty()) return out;
        for (String pair : raw.split("&")) {
            int eq = pair.indexOf('=');
            try {
                String k = eq < 0 ? pair : pair.substring(0, eq);
                String v = eq < 0 ? "" : pair.substring(eq + 1);
                out.put(java.net.URLDecoder.decode(k, "UTF-8"), java.net.URLDecoder.decode(v, "UTF-8"));
            } catch (Exception ignored) { }
        }
        return out;
    }

    private static int clampInt(String raw, int fallback, int min, int max) {
        try {
            int v = Integer.parseInt(String.valueOf(raw).trim());
            return Math.max(min, Math.min(max, v));
        } catch (Exception e) {
            return fallback;
        }
    }

    private static String sha1(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b & 0xff));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }

    private Result fromCache(String key, long ttlMs) {
        long[] meta = cacheMeta.get(key);
        byte[] body = cache.get(key);
        if (meta == null || body == null) return null;
        if (System.currentTimeMillis() - meta[0] > ttlMs) { cache.remove(key); cacheMeta.remove(key); return null; }
        Result r = new Result();
        r.body = body;
        r.headers.put("X-Cache", "hit");
        return r;
    }

    private Result store(String key, String json) {
        cache.put(key, json.getBytes(StandardCharsets.UTF_8));
        cacheMeta.put(key, new long[]{System.currentTimeMillis()});
        if (cache.size() > 200) {
            String first = cache.keySet().iterator().next();
            cache.remove(first);
            cacheMeta.remove(first);
        }
        return Result.json(json);
    }
}
