package com.qiyuyu.fishtemple;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * SiteServer.java — 手机里的那个「本地站」
 * ==================================================================
 * 为什么桌面版能去掉端口，而安卓还要起一个 127.0.0.1 的小服务：
 *   网页里所有写操作（登录、发帖）都是 POST + JSON 请求体，
 *   而 WebView 的 shouldInterceptRequest **拿不到请求体**。
 *   与其在 JS 里重写 fetch 再走桥，不如老老实实开一个只监听本机的
 *   ServerSocket —— 它不出这个 App，也不需要任何外部服务器。
 *
 * 它只做两件事：
 *   ① 把 APK 里 assets/site 的静态文件发给 WebView；
 *   ② /api/* 里实现「不需要外网」的那部分：health、auth、content（只读空覆盖层）。
 *   其余接口一律 503，前端会自己显示 PROXY OFFLINE / 需要服务端之类的提示。
 *
 * 同样不碰 Android API（SiteSource 是接口，Android 侧用 AssetManager 实现，
 * 单测里用文件系统实现），所以这段代码能在 JVM 上跑真测试。
 */
final class SiteServer {

    /** 静态文件来源：Android 用 AssetManager，测试用磁盘目录 */
    interface SiteSource {
        /** @param path 以 / 开头，例如 /index.html；不存在返回 null */
        byte[] read(String path);
    }

    private final SiteSource source;
    private final LocalAuth auth;
    private final File dataDir;
    private final ServerSocket socket;
    private final AtomicBoolean running = new AtomicBoolean(false);

    SiteServer(SiteSource source, LocalAuth auth, File dataDir) throws IOException {
        this.source = source;
        this.auth = auth;
        this.dataDir = dataDir;
        this.socket = new ServerSocket();
        this.socket.setReuseAddress(true);
        this.socket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
    }

    int port() { return socket.getLocalPort(); }

    void start() {
        running.set(true);
        Thread t = new Thread(() -> {
            while (running.get()) {
                try {
                    Socket client = socket.accept();
                    Thread worker = new Thread(() -> handle(client));
                    worker.setDaemon(true);
                    worker.start();
                } catch (IOException e) {
                    if (running.get()) e.printStackTrace();
                }
            }
        }, "site-server");
        t.setDaemon(true);
        t.start();
    }

    void stop() {
        running.set(false);
        try { socket.close(); } catch (IOException ignored) { }
    }

    /* ---------------- 一次请求 ---------------- */

    private void handle(Socket client) {
        try (Socket c = client) {
            c.setSoTimeout(15000);
            InputStream in = c.getInputStream();
            OutputStream out = c.getOutputStream();

            byte[] head = readHead(in);
            if (head == null) return;
            String text = new String(head, StandardCharsets.ISO_8859_1);
            String[] lines = text.split("\r\n");
            if (lines.length == 0) return;
            String[] first = lines[0].split(" ");
            if (first.length < 2) return;
            String method = first[0].toUpperCase(Locale.ROOT);
            String target = first[1];

            Map<String, String> headers = new LinkedHashMap<>();
            for (int i = 1; i < lines.length; i++) {
                int colon = lines[i].indexOf(':');
                if (colon > 0) headers.put(lines[i].substring(0, colon).trim().toLowerCase(Locale.ROOT),
                        lines[i].substring(colon + 1).trim());
            }

            int length = 0;
            try { length = Integer.parseInt(headers.getOrDefault("content-length", "0")); } catch (NumberFormatException ignored) { }
            byte[] body = new byte[Math.min(length, 4 * 1024 * 1024)];
            int read = 0;
            while (read < body.length) {
                int n = in.read(body, read, body.length - read);
                if (n < 0) break;
                read += n;
            }
            if (read < body.length) {
                byte[] trimmed = new byte[read];
                System.arraycopy(body, 0, trimmed, 0, read);
                body = trimmed;
            }

            int q = target.indexOf('?');
            String path = q >= 0 ? target.substring(0, q) : target;
            String query = q >= 0 ? target.substring(q + 1) : "";
            path = urlDecode(path);

            if (path.startsWith("/api/")) {
                handleApi(method, path, headers, body, out);
            } else {
                handleStatic(path, out);
            }
        } catch (IOException e) {
            // 客户端提前断开是常事（切板块、关窗口），不刷屏
        }
    }

    private static byte[] readHead(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int last4 = 0;
        while (buf.size() <= 64 * 1024) {
            int b = in.read();
            if (b < 0) return buf.size() == 0 ? null : buf.toByteArray();
            buf.write(b);
            last4 = ((last4 << 8) | (b & 0xff)) & 0xffffffff;
            if (last4 == 0x0d0a0d0a) return buf.toByteArray();   // \r\n\r\n
        }
        return buf.toByteArray();
    }

    /* ---------------- 静态文件 ---------------- */

    private void handleStatic(String path, OutputStream out) throws IOException {
        String p = path;
        if (p.isEmpty() || p.equals("/")) p = "/index.html";
        if (p.contains("..")) { send(out, 400, "text/plain; charset=utf-8", "Bad Request".getBytes(StandardCharsets.UTF_8)); return; }
        byte[] data = source.read(p);
        if (data == null && !p.contains(".")) {
            data = source.read("/index.html");     // hash 路由：未知路径回首页
        }
        if (data == null) {
            byte[] fallback = source.read("/offline.html");
            send(out, 404, "text/html; charset=utf-8", fallback != null ? fallback
                    : "Not Found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        send(out, 200, mimeOf(p), data);
    }

    private static String mimeOf(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        switch (ext) {
            case "html": return "text/html; charset=utf-8";
            case "js":
            case "mjs": return "text/javascript; charset=utf-8";
            case "css": return "text/css; charset=utf-8";
            case "json": return "application/json; charset=utf-8";
            case "webmanifest": return "application/manifest+json; charset=utf-8";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg":
            case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "ico": return "image/x-icon";
            case "ttf": return "font/ttf";
            case "woff2": return "font/woff2";
            case "mp3": return "audio/mpeg";
            case "mp4": return "video/mp4";
            case "wasm": return "application/wasm";
            default: return "application/octet-stream";
        }
    }

    /* ---------------- /api/* ---------------- */

    private void handleApi(String method, String path, Map<String, String> headers, byte[] body, OutputStream out)
            throws IOException {
        String bearer = headers.getOrDefault("authorization", "");
        if (bearer.toLowerCase(Locale.ROOT).startsWith("bearer ")) bearer = bearer.substring(7).trim();

        try {
            if (path.equals("/api/health")) {
                json(out, 200, Json.obj(
                        "ok", Boolean.TRUE,
                        "server", "fish-temple-android",
                        "deploy", "android-local",
                        "readonly", Boolean.FALSE,
                        "writable", Boolean.TRUE,
                        "storage", "app",
                        "dataDir", dataDir.getAbsolutePath(),
                        "auth", Json.raw(Json.obj("enabled", Boolean.TRUE, "mode", "local", "accounts", auth.count())),
                        "features", Json.raw(Json.obj("netease", Boolean.FALSE, "pixiv", Boolean.FALSE,
                                "note", "移动端是纯本地版：需要外网代理的功能不可用"))));
                return;
            }

            if (path.equals("/api/auth/config")) {
                json(out, 200, Json.obj(
                        "ok", Boolean.TRUE,
                        "enabled", Boolean.TRUE,
                        "mode", "local",
                        "local", Boolean.TRUE,
                        "domain", null,
                        "clientId", null,
                        "audience", null,
                        "ownerConfigured", Boolean.FALSE,
                        "accounts", auth.count()));
                return;
            }

            if (path.equals("/api/auth/me")) {
                if (bearer.isEmpty()) { json(out, 401, Json.obj("ok", Boolean.FALSE, "error", "需要登录")); return; }
                Map<String, String> claims;
                try {
                    claims = auth.verify(bearer);
                } catch (RuntimeException e) {
                    json(out, 401, Json.obj("ok", Boolean.FALSE, "error", "登录状态无效：" + e.getMessage()));
                    return;
                }
                json(out, 200, Json.obj("ok", Boolean.TRUE, "user", Json.raw(Json.obj(
                        "sub", claims.get("sub"),
                        "email", claims.get("email"),
                        "name", claims.get("name"),
                        "picture", "",
                        "verified", Boolean.TRUE,
                        "role", claims.get("role"),
                        "source", "local"))));
                return;
            }

            if (path.equals("/api/auth/local/logout")) {
                json(out, 200, Json.obj("ok", Boolean.TRUE));
                return;
            }

            if (path.equals("/api/auth/local/register") || path.equals("/api/auth/local/login")) {
                if (!method.equals("POST")) { json(out, 405, Json.obj("ok", Boolean.FALSE, "error", "只支持 POST")); return; }
                Map<String, String> in = Json.parseFlat(new String(body, StandardCharsets.UTF_8));
                LocalAuth.Result r;
                if (path.endsWith("/register")) {
                    r = auth.register(in.get("email"), in.get("password"), in.get("name"));
                } else {
                    r = auth.login(in.get("email"), in.get("password"));
                }
                if (r.token == null) {
                    json(out, r.status, Json.obj("ok", Boolean.FALSE, "error", r.error));
                } else {
                    json(out, 200, Json.obj("ok", Boolean.TRUE, "token", r.token,
                            "expiresIn", LocalAuth.TTL_MS / 1000, "user", Json.raw(toJson(r.user))));
                }
                return;
            }

            // 内容覆盖层：本地版不做发布（写文件 + 冲突合并是桌面版的活），
            // 回一个空覆盖层，前端就会用打包进来的 data/*.json。
            if (path.startsWith("/api/content/")) {
                if (method.equals("GET")) {
                    json(out, 200, Json.obj("ok", Boolean.TRUE, "items", Json.emptyArray(), "deleted", Json.emptyArray(),
                            "overlayOnly", Boolean.TRUE, "storage", "readonly"));
                } else {
                    json(out, 501, Json.obj("ok", Boolean.FALSE,
                            "error", "移动版是纯本地：暂不支持在手机上发布内容（桌面版可以）"));
                }
                return;
            }

            json(out, 503, Json.obj("ok", Boolean.FALSE,
                    "error", "这个功能需要外网代理（" + path + "）；移动版是纯本地，桌面版/VPS 才有"));
        } catch (RuntimeException e) {
            json(out, 500, Json.obj("ok", Boolean.FALSE, "error", String.valueOf(e.getMessage())));
        }
    }

    private static void json(OutputStream out, int status, String body) throws IOException {
        send(out, status, "application/json; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    /** LocalAuth.User 的公开字段 → JSON 对象文本 */
    private static String toJson(LocalAuth.User u) {
        Map<String, Object> m = u.asPublic();
        Object[] kv = new Object[m.size() * 2];
        int i = 0;
        for (Map.Entry<String, Object> e : m.entrySet()) {
            kv[i++] = e.getKey();
            kv[i++] = e.getValue();
        }
        return Json.obj(kv);
    }

    private static void send(OutputStream out, int status, String contentType, byte[] body) throws IOException {
        String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
                + "Content-Type: " + contentType + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(body);
        out.flush();
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 409: return "Conflict";
            case 429: return "Too Many Requests";
            case 500: return "Internal Server Error";
            case 501: return "Not Implemented";
            case 503: return "Service Unavailable";
            default: return "OK";
        }
    }

    private static String urlDecode(String s) {
        try {
            return java.net.URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }
}
