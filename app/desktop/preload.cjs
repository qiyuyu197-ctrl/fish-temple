'use strict';

/**
 * preload.cjs — 只暴露「窗口按钮」这一件事
 * ------------------------------------------------------------------
 * 窗口是无边框的（frame: false），标题栏换成了站点自己的顶栏，
 * 那三个按钮（最小化 / 最大化 / 关闭）在页面里画，点击必须回到主进程执行。
 * contextIsolation + sandbox 都开着，所以只通过 contextBridge 暴露三个函数，
 * 页面拿不到 ipcRenderer 本体。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopWindow', {
  min: () => ipcRenderer.send('win:min'),
  toggleMax: () => ipcRenderer.send('win:toggle-max'),
  close: () => ipcRenderer.send('win:close'),
  /** 主进程通知「最大化状态变了」，用来换按钮图标（最大化 ⇄ 还原） */
  onState: (fn) => {
    ipcRenderer.on('win:state', (_e, maximized) => {
      try { fn(!!maximized); } catch { /* 页面换了就忽略 */ }
    });
  },
});
