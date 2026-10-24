# AI 分轨模型

模型**不在仓库里**（每份约 64MB），发布在 GitHub Release：

- Release：<https://github.com/qiyuyu197-ctrl/fish-temple/releases/tag/model-v1>

| 文件 | 用途 | 大小 |
| --- | --- | --- |
| `UVR-MDX-NET-Inst_HQ_3.onnx` | 伴奏专精（「伴奏优先」/「双模型」的伴奏轨） | 66,759,214 字节 |
| `Kim_Vocal_2.onnx` | 人声专精（「人声优先」/「双模型」的人声轨） | 66,759,214 字节 |

直链：

- <https://github.com/qiyuyu197-ctrl/fish-temple/releases/download/model-v1/UVR-MDX-NET-Inst_HQ_3.onnx>
- <https://github.com/qiyuyu197-ctrl/fish-temple/releases/download/model-v1/Kim_Vocal_2.onnx>

为什么是两份：伴奏模型「剩下」的人声会带一点音乐；要干净人声就用人声模型，
「双模型」模式让伴奏和人声各走自己的专精模型（慢一倍）。

## 本地 / 自托管怎么拿到文件

```bash
node tools/fetch-model.mjs              # 默认两份都下
node tools/fetch-model.mjs --model inst # 只下伴奏模型
```

会下载到本目录；`.gitignore` 已经忽略 `*.onnx`。
本地 `server.mjs` 的 `/model/…` 会优先发这个文件；没有就代理到 Release → 镜像。

## 浏览器怎么加载

页面请求同源 `/model/<文件名>`：

- 本地 / 自托管：`server.mjs` 直接发本地文件，或代理到 Release；
- Netlify：`netlify.toml` 的 `[[redirects]]` 代理到 Release；
- 都不行时，前端会再试 Release 直链与 aifasthub / hf-mirror（国内镜像）。

全程在浏览器里跑，音频不上传。

## 来源与授权

- 模型来源：UVR 社区公开模型，镜像自
  <https://huggingface.co/Blane187/all_public_uvr_models>。
- 许可：模型权重由 UVR 社区训练/发布，站点不声称拥有版权；个人使用为主，
  商用或再分发请自行确认原模型的授权。代码部分（web-audio-separation / ORT）是 MIT。

## 换模型

页面里支持「选择本地模型」，格式要求：

- MDX-Net 架构的 `.onnx`
- 输入名 `input`、输出名 `output`
- 形状 `[1, 4, dimF, dimT]`，例如本模型的 `dimF=3072`、`dimT=256`

替换站内默认模型时，更新 Release 资产或改 `src/plugins/tools/ai-separator.js` 里的
`MODEL_SOURCES`；浏览器缓存按 `/model/…` 这个同源 URL 存，换权重后记得改文件名或清站点数据。
