# ONNX Runtime Web（本地副本）

- 上游：<https://github.com/microsoft/onnxruntime>
- 版本：1.29.0（MIT）
- 用途：去人声页签的「AI 分轨」——在浏览器里跑 MDX-Net ONNX 模型。

只保留了需要的几个文件，避免把 144MB 的完整包塞进仓库：

| 文件 | 作用 |
| --- | --- |
| `ort.min.mjs` | ESM 入口（外部 wasm 构建） |
| `ort-wasm-simd-threaded.mjs` / `.wasm` | CPU（WASM）EP |
| `ort-wasm-simd-threaded.jsep.mjs` / `.wasm` | WebGPU EP（支持时优先） |

上游还有 asyncify / jspi 等变体，这里用不到。
