# runtime 目录

请把与当前系统和显卡环境匹配的 Windows CUDA 版 llama.cpp 运行文件放在这里。

节点至少需要：

- `llama-server.exe`
- `llama-server-impl.dll`
- `llama-common.dll`
- `llama.dll`
- `ggml.dll`
- `ggml-base.dll`
- `ggml-cpu.dll`
- 对应 CUDA 版本的 `ggml-cuda.dll`、`cudart64_12.dll`、`cublas64_12.dll`、`cublasLt64_12.dll`

这些文件必须来自同一套 llama.cpp 构建，不能混用不同版本。完整心宝整合包已经包含可用运行库。
