package com.qiyuyu.fishtemple;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import java.util.HashMap;
import java.util.Map;

/**
 * QrSvg.java — 把一段文本变成二维码 SVG
 * ------------------------------------------------------------------
 * 客户端（plugins/netease-login.js）要的是服务端直接给 `qrSvg`（它 innerHTML 进去），
 * 桌面版用的是自己写的编码器（netease-qr.mjs）。安卓这边不重复造轮子，
 * 用 ZXing 的 core（纯 Java、无其它依赖、约 500KB，只多这一个小包）。
 *
 * 输出是**纯路径**的 SVG：不引用字体、不引用图片，直接 innerHTML 就能画。
 */
final class QrSvg {
    private QrSvg() { }

    static String of(String text, int size) {
        try {
            Map<EncodeHintType, Object> hints = new HashMap<>();
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.L);
            hints.put(EncodeHintType.MARGIN, 3);
            BitMatrix m = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints);

            int w = m.getWidth();
            int h = m.getHeight();
            StringBuilder path = new StringBuilder();
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    if (m.get(x, y)) path.append('M').append(x).append(',').append(y).append("h1v1h-1z");
                }
            }
            return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + size + "\" height=\"" + size
                    + "\" viewBox=\"0 0 " + w + " " + h + "\" shape-rendering=\"crispEdges\" role=\"img\" aria-label=\"网易云扫码登录\">"
                    + "<rect width=\"" + w + "\" height=\"" + h + "\" fill=\"#ffffff\"/>"
                    + "<path d=\"" + path + "\" fill=\"#111111\"/></svg>";
        } catch (Exception e) {
            return "";
        }
    }
}
