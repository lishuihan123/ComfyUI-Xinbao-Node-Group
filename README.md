# ComfyUI Xinbao Node Group

`ComfyUI-Xinbao-Node-Group` 是心宝自用并长期维护的 ComfyUI 节点组，界面分类统一为 `心宝❤节点组`。

## 节点

- `心宝❤推理（极速版）`：使用 Ternary Bonsai 2 27B，根据角色定位和用户指令扩写提示词；支持不输入图片、1–10 张图片或视频帧批次，并可输出中文或英文。
- `心宝❤图片标准化`：根据输入图比例自动选择最接近的 1K/2K 标准尺寸，等比缩放并居中裁切，同时输出 1024 或 2048 的基准值。
- `心宝❤构图`：交互式图片合成，支持移动、缩放、旋转、描边、画笔、橡皮及遮罩输出。
- `释放 Bonsai 2 模型`：主动关闭本地推理服务并释放相关显存/内存。

## 安装

1. 将本仓库克隆到 `ComfyUI/custom_nodes/ComfyUI-Xinbao-Node-Group`。
2. 准备 Windows CUDA 版 llama.cpp 运行库，将 `llama-server.exe` 及它依赖的 DLL 放入本节点的 `runtime` 目录。详见 [runtime/README.md](runtime/README.md)。
3. 将以下模型放到 `ComfyUI/models/LLM/Bonsai2-27B/`：
   - `Ternary-Bonsai-2-27B-PTQ1_0.gguf`
   - `Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf`
4. 重启 ComfyUI。

`requirements.txt` 不要求额外 Python 依赖；Pillow、NumPy 与 PyTorch 由 ComfyUI 环境提供。

## 说明

GitHub 源码仓库不提交本地推理运行库和模型。运行库约 1.2 GB，其中多个 CUDA DLL 超过 GitHub 的普通 Git 单文件限制；完整离线文件保留在心宝整合包中。

