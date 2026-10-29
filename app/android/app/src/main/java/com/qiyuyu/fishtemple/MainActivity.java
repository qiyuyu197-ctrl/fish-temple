package com.qiyuyu.fishtemple;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
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
import java.io.InputStream;
import java.io.OutputStream;

/**
 * MainActivity — 「鱼の灵庙」的安卓外壳
 * ------------------------------------------------------------------
 * 这一层刻意做得很薄，只补浏览器里没有、而装成 App 之后必须有的东西：
 *
 *   · 站外链接交给系统浏览器（不要在一个没有地址栏的窗口里迷路）
 *   · 文件下载：http(s) 交给系统 DownloadManager，blob: 走 JS 桥自己存
 *     （工具台导出 zip / tierlist 存图 / AI 分离导出音频都是 blob:）
 *   · <input type="file"> 能真的选图（论坛发图要用）
 *   · 返回键先退站点历史，再退出 App
 *   · 打不开首页时给一个能重试的本地兜底页，而不是白屏
 *
 * 站内的一切仍然是网页本身，所以更新站点不需要重新发 APK。
 * 首页地址在 app/android/app/build.gradle 的 appUrl 里，构建时可覆盖。
 */
public class MainActivity extends Activity {

    private static final int REQ_FILE = 1001;

    private WebView webView;
    private android.webkit.ValueCallback<Uri[]> fileChooserCallback;
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
        s.setMediaPlaybackRequiresUserGesture(false);   // 站内音乐要能自动接播
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " FishTempleApp/" + BuildConfig.VERSION_NAME);

        // 网易云官方播放器是跨域 iframe，需要第三方 cookie 才能沿用浏览器里的登录态
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cm.setAcceptThirdPartyCookies(webView, true);
        }

        webView.addJavascriptInterface(new NativeBridge(), "FTNative");
        webView.setWebViewClient(new SiteClient());
        webView.setWebChromeClient(new SiteChromeClient());
        webView.setDownloadListener(new SiteDownloadListener());

        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);

        webView.loadUrl(BuildConfig.APP_URL);
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

    /** 决定一个链接是「站内继续」还是「甩给浏览器」 */
    private boolean route(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!scheme.equals("http") && !scheme.equals("https")) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) { }
            return true;
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        // 站内 + 网易云播放器（iframe 里的二次跳转）留在 WebView
        if (host.equals(Uri.parse(BuildConfig.APP_URL).getHost())
                || host.endsWith("music.163.com")
                || host.endsWith("music.126.net")) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            toast("没有可以打开这个链接的 App");
        }
        return true;
    }

    /* ---------------- 上传（论坛发图） ---------------- */

    private class SiteChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view,
                                         android.webkit.ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(null);
            }
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
                // 站内下载要带 cookie，否则登录态资源会 401
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) req.addRequestHeader("Cookie", cookie);
                String name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimetype);
                req.setTitle(name);
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(req);
                toast("开始下载：" + name);
            } catch (Exception e) {
                // 有些 CDN 不允许 DownloadManager 直接取（需要 referer 等），退回浏览器
                toast("下载失败，试试在浏览器里打开");
            }
        }
    }

    /* ---------------- JS 桥（给 blob: 导出用） ---------------- */

    private class NativeBridge {
        /** 把 base64 存进「下载」目录；返回是否成功 */
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
                webView.loadUrl(BuildConfig.APP_URL);
            });
        }

        @JavascriptInterface
        public String homeUrl() {
            return BuildConfig.APP_URL;
        }
    }

    /* ---------------- 兜底页 ---------------- */

    private void showOffline() {
        if (loadFailed) return;
        loadFailed = true;
        String html = readRawAsset();
        if (html == null) return;
        html = html.replace("{{URL}}", BuildConfig.APP_URL);
        webView.loadDataWithBaseURL(BuildConfig.APP_URL, html, "text/html", "utf-8", null);
    }

    private String readRawAsset() {
        try (InputStream in = getResources().openRawResource(R.raw.offline)) {
            byte[] buf = new byte[in.available()];
            int n = in.read(buf);
            return n > 0 ? new String(buf, 0, n, "UTF-8") : null;
        } catch (Exception e) {
            return null;
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

    /**
     * 页内注入：拦掉 <a download href="blob:..."> 的点击，转成 base64 交给原生保存。
     * 浏览器里这行<a download>由浏览器自己处理；WebView 不实现它，点了会静默没反应，
     * 而站内的导出（zip / tierlist 图 / 分离出的音频）全是这条路。
     */
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
