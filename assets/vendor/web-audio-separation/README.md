# web-audio-separation（本地副本）

- 上游：<https://github.com/incidentist/web-audio-separation>
- 版本：0.3.1（MIT，见 [LICENSE](./LICENSE)）
- 用途：去人声页签的「AI 分轨」——把 MDX-Net ONNX 模型跑在浏览器里。

## 相对上游只改了两处

1. `import * as e from "onnxruntime-web"` → `from "../onnxruntime-web/ort.min.mjs"`；
2. `ort.env.wasm.wasmPaths` 从 jsDelivr 改成同目录的 `../onnxruntime-web/`。

这样站点不需要任何 CDN：ORT 运行时与模型都由本站自己发。

模型权重不放在这里，见 `assets/models/`。
