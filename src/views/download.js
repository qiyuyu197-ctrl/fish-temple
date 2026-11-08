/**
 * views/download.js — 站内下载页
 * ------------------------------------------------------------------
 * 原来的 download.html 是独立静态页；这里把它收进 SPA 路由 #/download，
 * 保留同样的版本信息，但使用本站顶栏 / 主题 / 页脚。
 */

import { viewhead } from '../ui/bits.js';
import { ICON } from '../util/dom.js';

const APK = 'https://github.com/qiyuyu197-ctrl/fish-temple/releases/download/app-v2.4.4/fish-temple-android-full-2.4.4.apk';
const ZIP = 'https://github.com/qiyuyu197-ctrl/fish-temple/releases/download/desktop-v1.5.4/fish-temple-desktop-1.5.4-win-x64.zip';
const RELEASES = 'https://github.com/qiyuyu197-ctrl/fish-temple/releases';

export default {
  id: 'download',
  title: '下载 App',

  render() {
    return `
    <div class="dl-page">
    ${viewhead({
      title: 'DOWNLOADS',
      idx: 'RELEASES / 2026.11',
      meta: [
        { label: 'ANDROID', value: '2.4.4' },
        { label: 'WINDOWS', value: '1.5.4' },
        { label: 'WEB', value: 'LATEST' },
      ],
      actions: `<a class="btn btn--sm" href="${RELEASES}" target="_blank" rel="noopener noreferrer">全部版本 ${ICON.ext}</a>
                <a class="btn btn--sm btn--ghost" href="#/" data-nav>回到首页</a>`,
    })}

    <section class="dl-grid" aria-label="下载">
      <article class="dl-card">
        <div class="dl-card__head"><b>01 / ANDROID</b><span>MOBILE</span></div>
        <div class="dl-card__body">
          <h2>移动版</h2>
          <p class="dl-sub">离线随身版 · 相册 / 音乐 / 扫雷 / 工具台</p>
          <dl class="dl-meta">
            <div><dt>Version</dt><dd>2.4.4</dd></div>
            <div><dt>Size</dt><dd>≈ 263 MB</dd></div>
            <div><dt>Requires</dt><dd>Android 7.0+</dd></div>
          </dl>
          <ul class="dl-features">
            <li>内置文章 / 公告与网页版同步</li>
            <li>2026 秋新番档案 + Bangumi 站内搜索</li>
            <li>账号 / 播放列表 / 主题跨重启保留</li>
          </ul>
          <div class="dl-actions">
            <a class="btn btn--signal" href="${APK}" target="_blank" rel="noopener noreferrer">下载 APK <span class="arrow">↓</span></a>
            <a class="btn btn--ghost" href="${RELEASES}/tag/app-v2.4.4" target="_blank" rel="noopener noreferrer">版本说明 ${ICON.ext}</a>
          </div>
        </div>
        <span class="dl-card__glyph" aria-hidden="true">APK</span>
      </article>

      <article class="dl-card">
        <div class="dl-card__head"><b>02 / WINDOWS</b><span>DESKTOP</span></div>
        <div class="dl-card__body">
          <h2>桌面版</h2>
          <p class="dl-sub">绿色便携 · 断网可用 · 可当扫雷局域网主机</p>
          <dl class="dl-meta">
            <div><dt>Version</dt><dd>1.5.4</dd></div>
            <div><dt>Size</dt><dd>≈ 359 MB</dd></div>
            <div><dt>Requires</dt><dd>Win 10/11 x64</dd></div>
          </dl>
          <ul class="dl-features">
            <li>内置文章 / 公告与网页版同步</li>
            <li>首次启动自动创建桌面快捷方式</li>
            <li>文件 → 局域网联机，手机用房间号加入扫雷</li>
          </ul>
          <div class="dl-actions">
            <a class="btn btn--signal" href="${ZIP}" target="_blank" rel="noopener noreferrer">下载 ZIP <span class="arrow">↓</span></a>
            <a class="btn btn--ghost" href="${RELEASES}/tag/desktop-v1.5.4" target="_blank" rel="noopener noreferrer">版本说明 ${ICON.ext}</a>
          </div>
        </div>
        <span class="dl-card__glyph" aria-hidden="true">ZIP</span>
      </article>
    </section>

    <section class="dl-notes">
      <div>
        <h3>01 / Android 安装</h3>
        <ol>
          <li>下载 <b>.apk</b> 到手机（微信 / QQ 传过去也可以）。</li>
          <li>点开文件，允许「安装未知来源应用」。</li>
          <li>覆盖安装 2.4.4；如果签名不一致，先卸载旧版（会丢 App 内数据）。</li>
        </ol>
        <p class="dl-fine">需要 Android 7.0（API 24）及以上；安装包约 263 MB，相册图都打进去了。</p>
      </div>
      <div>
        <h3>02 / Windows 使用</h3>
        <ol>
          <li>下载 <b>.zip</b>，解压到任意目录（别放 <b>C:\Program Files</b>）。</li>
          <li>双击 <b>FishTemple.exe</b>；首次启动会自动创建桌面快捷方式。</li>
          <li>数据在 <b>%APPDATA%\FishTemple\data</b>，不碰安装目录。</li>
        </ol>
        <p class="dl-fine">站点、相册、文章、工具台都随安装包自带；Bangumi 搜索 / 网易云 / Pixiv 需要联网。</p>
      </div>
    </section>

    <p class="dl-foot">
      站点本体是网页；App 只是把同一套内容装进桌面外壳。
      <a href="${RELEASES}" target="_blank" rel="noopener noreferrer">GitHub Releases</a> ·
      <a href="https://github.com/qiyuyu197-ctrl/fish-temple" target="_blank" rel="noopener noreferrer">源码</a>
    </p>
    </div>`;
  },
};
