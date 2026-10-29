package com.qiyuyu.fishtemple;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Json.java — 极小的 JSON 工具（不引依赖）
 * ------------------------------------------------------------------
 * 只做三件事：转义、拼对象、解析**扁平的**字符串对象。
 * 本站的本地接口只会收发这种形状（{@code {"email":"a","password":"b"}}），
 * 所以不需要一个完整的 JSON 解析器 —— 引 org.json 反而会让这段逻辑没法在
 * 普通 JVM 上单测（Android 自带的那套不在 JDK 里）。
 */
final class Json {
    private Json() {}

    static String esc(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }

    static String obj(Object... kv) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i + 1 < kv.length; i += 2) {
            if (sb.length() > 1) sb.append(',');
            sb.append('"').append(esc(String.valueOf(kv[i]))).append("\":");
            Object v = kv[i + 1];
            if (v == null) sb.append("null");
            else if (v instanceof Raw) sb.append(((Raw) v).json);
            else if (v instanceof Number || v instanceof Boolean) sb.append(v);
            else sb.append('"').append(esc(String.valueOf(v))).append('"');
        }
        return sb.append('}').toString();
    }

    /** 已经拼好的 JSON 片段（对象 / 数组 / true），拼进去时不要再加引号 */
    static final class Raw {
        final String json;
        Raw(String json) { this.json = json; }
    }

    static Raw raw(String json) { return new Raw(json); }
    static Raw emptyArray() { return new Raw("[]"); }

    /** 把 [{"a":1},...] 这种也拼出来（只支持 Map 列表） */
    static String array(List<Map<String, Object>> items) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(',');
            Map<String, Object> m = items.get(i);
            List<Object> flat = new ArrayList<>();
            for (Map.Entry<String, Object> e : m.entrySet()) {
                flat.add(e.getKey());
                flat.add(e.getValue());
            }
            sb.append(obj(flat.toArray()));
        }
        return sb.append(']').toString();
    }

    /**
     * 解析扁平对象：只认 {@code "key": "value"} / 数字 / true / false / null。
     * 值里可以有转义引号；嵌套对象会被跳过（本地接口用不到）。
     */
    static Map<String, String> parseFlat(String raw) {
        Map<String, String> out = new LinkedHashMap<>();
        if (raw == null) return out;
        int i = 0;
        int n = raw.length();
        while (i < n) {
            while (i < n && raw.charAt(i) != '"') i++;
            if (i >= n) break;
            StringBuilder key = new StringBuilder();
            i = readString(raw, i + 1, key);
            if (i < 0) break;
            while (i < n && (Character.isWhitespace(raw.charAt(i)) || raw.charAt(i) == ':')) i++;
            if (i >= n) break;
            char c = raw.charAt(i);
            if (c == '"') {
                StringBuilder val = new StringBuilder();
                i = readString(raw, i + 1, val);
                if (i < 0) break;
                out.put(key.toString(), val.toString());
            } else if (c == '{' || c == '[') {
                i = skipNested(raw, i);
                out.put(key.toString(), "");
            } else {
                int start = i;
                while (i < n && ",}".indexOf(raw.charAt(i)) < 0) i++;
                out.put(key.toString(), raw.substring(start, i).trim());
            }
            while (i < n && ",}".indexOf(raw.charAt(i)) < 0) i++;
            if (i < n) i++;
        }
        return out;
    }

    private static int readString(String raw, int i, StringBuilder out) {
        int n = raw.length();
        while (i < n) {
            char c = raw.charAt(i++);
            if (c == '"') return i;
            if (c != '\\') { out.append(c); continue; }
            if (i >= n) return -1;
            char e = raw.charAt(i++);
            switch (e) {
                case 'n': out.append('\n'); break;
                case 'r': out.append('\r'); break;
                case 't': out.append('\t'); break;
                case 'b': out.append('\b'); break;
                case 'f': out.append('\f'); break;
                case 'u':
                    if (i + 4 > n) return -1;
                    try { out.append((char) Integer.parseInt(raw.substring(i, i + 4), 16)); }
                    catch (NumberFormatException ex) { return -1; }
                    i += 4;
                    break;
                default: out.append(e);
            }
        }
        return -1;
    }

    private static int skipNested(String raw, int i) {
        int depth = 0;
        int n = raw.length();
        while (i < n) {
            char c = raw.charAt(i);
            if (c == '"') {
                StringBuilder ignored = new StringBuilder();
                i = readString(raw, i + 1, ignored);
                if (i < 0) return n;
                continue;
            }
            if (c == '{' || c == '[') depth++;
            else if (c == '}' || c == ']') {
                depth--;
                if (depth == 0) return i + 1;
            }
            i++;
        }
        return n;
    }
}
