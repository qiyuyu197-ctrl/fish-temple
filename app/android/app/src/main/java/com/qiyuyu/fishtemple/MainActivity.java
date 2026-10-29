package com.qiyuyu.fishtemple;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * MainActivity — 「鱼の灵庙」安卓版（纯本地）
 * ------------------------------------------------------------------
 * 和上一版的区别：上一版只是个壳，打开的是线上 GitHub Pages；
 * 这一版把站点打进了 APK，启动时在本机 127.0.0.1 起一个只给自己用的小服务
 * （SiteServer.java），窗口加载 http://127.0.0.1:<随机端口>/。
 *
 * 所以它现在和桌面版是一个性质：**断网也能用**，账号也是本机的
 * （LocalAuth.java，和桌面版 /api/auth/local/* 同一套契约）。
 *
 * 为什么安卓不能像桌面版那样完全不要端口：网页里的写操作都是 POST + 请求体，
 * 而 WebView 的 shouldInterceptRequest 拿不到请求体 —— 开一个本机 ServerSocket
 * 是既能复用现有前端、又不需要任何外部服务器的最短路径。
 *
 * 明确做不到的：需要外网代理的功能（网易云搜索/扫码登录、Pixiv 抽卡）。
 * 那套 eapi 加密代理在 server.mjs 里，安卓没条件跑 Node，接口会如实回 503。
 */
public class MainActivity extends Activity {

    private static final int REQ_FILE = 1001;
    private static final String ASSET_ROOT = "site";

    private WebView webView;
    private android.webkit.ValueCallback<Uri[]> fileChooserCallback;
    private SiteServer server;
    private int port = 0;
    private boolean loadFailed = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " FishTempleApp/" + BuildConfig.VERSION_NAME);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);

        webView.addJavascriptInterface(new NativeBridge(), "FTNative");
        webView.setWebViewClient(new SiteClient());
        webView.setWebChromeClient(new SiteChromeClient());
        webView.setDownloadListener(new SiteDownloadListener());

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);

        startLocalServer();
    }

    /* ---------------- 本机服务 ---------------- */

    private void startLocalServer() {
        webView.loadDataWithBaseURL(null, loadingHtml(), "text/html", "utf-8", null);
        new Thread(() -> {
            try {
                File dataDir = new File(getFilesDir(), "data");
                if (!dataDir.exists() && !dataDir.mkdirs()) throw new IOException("建不了数据目录");
                seedData(dataDir);

                AssetManager assets = getAssets();
                SiteServer.SiteSource source = path -> {
                    try (InputStream in = assets.open(ASSET_ROOT + path)) {
                        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(64 * 1024);
                        byte[] buf = new byte[16 * 1024];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        return out.toByteArray();
                    } catch (IOException e) {
                        return null;
                    }
                };

                LocalAuth auth = new LocalAuth(dataDir);
                server = new SiteServer(source, auth, dataDir);
                server.start();
                port = server.port();
                runOnUiThread(() -> webView.loadUrl("http://127.0.0.1:" + port + "/index.html#/"));
            } catch (Exception e) {
                runOnUiThread(() -> {
                    android.app.AlertDialog.Builder b = new android.app.AlertDialog.Builder(MainActivity.this);
                    b.setTitle("启动失败");
                    b.setMessage("本地服务没能起来：\n" + e.getMessage());
                    b.setPositiveButton("重试", (d, w) -> startLocalServer());
                    b.setNegativeButton("退出", (d, w) -> finish());
                    b.setCancelable(false);
                    b.show();
                });
            }
        }, "boot").start();
    }

    /** 第一次启动：把 APK 里的内容清单播种到应用私有目录 */
    private void seedData(File dataDir) {
        AssetManager assets = getAssets();
        try {
            String[] names = assets.list(ASSET_ROOT + "/data");
            if (names == null) return;
            for (String name : names) {
                if (!name.endsWith(".json")) continue;
                File dst = new File(dataDir, name);
                if (dst.exists()) continue;
                try (InputStream in = assets.open(ASSET_ROOT + "/data/" + name);
                     OutputStream out = new FileOutputStream(dst)) {
                    byte[] buf = new byte[16 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
            }
        } catch (IOException ignored) {
            // 播种失败不致命：服务端读不到就用空数据，界面照样能开
        }
    }

    private String loadingHtml() {
        return "<!doctype html><meta charset='utf-8'><title>鱼の灵庙</title>"
                + "<style>html,body{height:100%;margin:0;background:#121316;color:#EFEDE6;"
                + "font-family:system-ui,'Noto Sans SC',sans-serif;display:grid;place-items:center}"
                + "b{display:block;font-size:30px;letter-spacing:-.02em}"
                + "i{display:block;margin-top:10px;font:12px ui-monospace,monospace;color:#8d8b84;font-style:normal}"
                + "</style><div style='text-align:center'><b>鱼の灵庙</b><i>本地服务启动中…</i></div>";
    }

    /* ---------------- 页面加载 ---------------- */

    private class SiteClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return route(request.getUrl());
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return route(Uri.parse(url));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            loadFailed = false;
            view.evaluateJavascript(INJECT_DOWNLOAD_BRIDGE, null);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showOffline();
        }

        @SuppressWarnings("deprecation")
        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            if (failingUrl != null && failingUrl.equals(view.getUrl())) showOffline();
        }
    }

    /** 站内链接（本机服务）留在 WebView，站外的交系统浏览器 */
    private boolean route(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) { }
            return true;
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (host.equals("127.0.0.1") || host.equals("localhost")) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            toast("没有可以打开这个链接的 App");
        }
        return true;
    }

    /* ---------------- 上传 ---------------- */

    private class SiteChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                fileChooserCallback = null;
                toast("没有找到文件选择器");
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(result);
                fileChooserCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /* ---------------- 下载 ---------------- */

    private class SiteDownloadListener implements DownloadListener {
        @Override
        public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                    String mimetype, long contentLength) {
            if (url.startsWith("data:")) {
                toast("这种链接请长按另存");
                return;
            }
            try {
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setMimeType(mimetype);
                req.addRequestHeader("User-Agent", userAgent);
                String name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimetype);
                req.setTitle(name);
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(req);
                toast("开始下载：" + name);
            } catch (Exception e) {
                toast("下载失败，试试在浏览器里打开");
            }
        }
    }

    /* ---------------- JS 桥（blob 导出） ---------------- */

    private class NativeBridge {
        @JavascriptInterface
        public boolean saveFile(String name, String mime, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String safeName = name == null || name.isEmpty()
                        ? "fish-temple-" + System.currentTimeMillis()
                        : name.replaceAll("[\\\\/:*?\"<>|]", "_");

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                    values.put(MediaStore.Downloads.MIME_TYPE, mime == null ? "application/octet-stream" : mime);
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri item = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (item == null) return false;
                    try (OutputStream out = getContentResolver().openOutputStream(item)) {
                        if (out == null) return false;
                        out.write(data);
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(item, values, null, null);
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null || (!dir.exists() && !dir.mkdirs())) return false;
                    File out = new File(dir, safeName);
                    try (OutputStream os = new FileOutputStream(out)) {
                        os.write(data);
                    }
                    toast("已保存到 " + out.getAbsolutePath());
                }
                runOnUiThread(() -> toast("已保存到「下载」：" + safeName));
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> toast("保存失败：" + e.getMessage()));
                return false;
            }
        }

        @JavascriptInterface
        public void toast(final String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void reload() {
            runOnUiThread(() -> {
                loadFailed = false;
                if (port > 0) webView.loadUrl("http://127.0.0.1:" + port + "/index.html#/");
            });
        }

        @JavascriptInterface
        public String homeUrl() {
            return port > 0 ? "http://127.0.0.1:" + port + "/" : "";
        }
    }

    /* ---------------- 兜底页 ---------------- */

    private void showOffline() {
        if (loadFailed) return;
        loadFailed = true;
        try (InputStream in = getResources().openRawResource(R.raw.offline)) {
            byte[] buf = new byte[in.available()];
            int n = in.read(buf);
            String html = new String(buf, 0, n, "UTF-8")
                    .replace("{{URL}}", port > 0 ? "http://127.0.0.1:" + port + "/" : "本机服务");
            webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
        } catch (Exception e) {
            webView.loadDataWithBaseURL(null, loadingHtml(), "text/html", "utf-8", null);
        }
    }

    /* ---------------- 生命周期 / 返回键 ---------------- */

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (webView != null) {
            webView.setWebChromeClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void toast(final String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    /** 拦掉 <a download href="blob:...">，转成 base64 交给原生保存 */
    private static final String INJECT_DOWNLOAD_BRIDGE =
            "(function(){" +
            "  if (window.__FT_DL__) return; window.__FT_DL__ = true;" +
            "  var toB64 = function (blob) { return new Promise(function (res, rej) {" +
            "      var fr = new FileReader();" +
            "      fr.onload = function () { var s = String(fr.result || ''); res(s.slice(s.indexOf(',') + 1)); };" +
            "      fr.onerror = rej; fr.readAsDataURL(blob);" +
            "  }); };" +
            "  document.addEventListener('click', function (ev) {" +
            "    var a = ev.target && ev.target.closest ? ev.target.closest('a[download]') : null;" +
            "    if (!a) return;" +
            "    var href = a.getAttribute('href') || '';" +
            "    if (!/^blob:/i.test(href)) return;" +
            "    ev.preventDefault(); ev.stopPropagation();" +
            "    var name = a.getAttribute('download') || 'download.bin';" +
            "    fetch(href).then(function (r) { return r.blob(); }).then(toB64).then(function (b64) {" +
            "      var ok = window.FTNative ? FTNative.saveFile(name, 'application/octet-stream', b64) : false;" +
            "      if (!ok) FTNative.toast('保存失败');" +
            "    }).catch(function () { if (window.FTNative) FTNative.toast('导出失败'); });" +
            "  }, true);" +
            "})();";
}
