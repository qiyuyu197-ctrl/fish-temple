package com.qiyuyu.fishtemple;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

/**
 * TestHarness.java — 在普通 JVM 上跑安卓那套本地服务
 * ------------------------------------------------------------------
 * 这不是 App 的一部分（不参与 APK 打包），只给 tools/verify-android-server.mjs 用：
 * 把 SiteServer + LocalAuth 当成一个小服务器跑起来，指向仓库里的站点目录，
 * 然后用真浏览器去访问 —— 这样安卓端「本地服务 + 账号」的行为在电脑上就能验，
 * 不用等模拟器。
 */
public final class TestHarness {
    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("用法: TestHarness <站点目录> <数据目录>");
            System.exit(2);
        }
        final File root = new File(args[0]).getCanonicalFile();
        File data = new File(args[1]);
        if (!data.exists() && !data.mkdirs()) throw new IOException("建不了数据目录: " + data);

        LocalAuth auth = new LocalAuth(data);
        SiteServer server = new SiteServer(path -> {
            String rel = path.startsWith("/") ? path.substring(1) : path;
            File f = new File(root, rel);
            try {
                if (!f.getCanonicalPath().startsWith(root.getPath())) return null;
                if (!f.isFile()) return null;
                return Files.readAllBytes(f.toPath());
            } catch (IOException e) {
                return null;
            }
        }, auth, data);

        server.start();
        System.out.println("PORT=" + server.port());
        System.out.flush();
        Thread.sleep(Long.MAX_VALUE);
    }
}
