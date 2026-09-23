# ComfyUI Xinbao Node Group

`ComfyUI-Xinbao-Node-Group` 是心宝自用并长期维护的 ComfyUI 节点集合。以后新增的自定义节点会继续放进这个仓库，ComfyUI 中的分类统一为 `心宝❤节点组`。

## 当前包含的功能

### 心宝❤推理（极速版）

本地调用 **Ternary Bonsai 2 27B**，将简单想法、参考图片或视频扩写/反推为可用于图像生成的提示词。

- 可以完全不输入图片，只根据“角色定位”和“用户指令”扩写提示词；
- 支持 1–10 张独立参考图片；
- 支持输入视频帧批次，并按设定数量均匀抽帧；
- 用户指令优先于角色定位，发生冲突时以用户指令为准；
- 支持中文或英文输出；
- 可控制最大图片边长、最大输出 token、温度、top_p、种子和上下文大小；
- 可选择推理后释放模型，或保持模型常驻以便连续运行。

### 心宝❤图片标准化

为了满足 Qwen-Image 2.1 及众多图像模型的标准尺寸要求，对输入图进行自动标准化处理，减少尺寸和比例不规范造成的画面、构图偏移问题。

### 心宝❤构图

- 在节点画布内交互式移动、缩放和旋转产品图；
- 支持外描边、透明度、画笔和橡皮；
- 最终画布尺寸跟随背景图；
- 同时输出合成图片与产品遮罩。

### 释放 Bonsai 2 模型

主动关闭本地推理服务，释放 Bonsai 推理占用的显存和内存。

## 安装节点

把仓库克隆到 ComfyUI 的 `custom_nodes` 目录：

```powershell
cd ComfyUI\custom_nodes
git clone https://github.com/lishuihan123/ComfyUI-Xinbao-Node-Group.git
```

重启 ComfyUI 后，不依赖 Bonsai 的 `心宝❤图片标准化` 和 `心宝❤构图` 可以直接使用。`requirements.txt` 不要求额外 Python 包；Pillow、NumPy、PyTorch 和 psutil 由常规 ComfyUI 环境提供。

## 安装推理模型与运行库

只有使用 `心宝❤推理（极速版）` 时才需要以下文件。请在仓库右侧的 **Releases** 中打开 `v0.2.0`，下载全部模型分卷和视觉投影模型。安装脚本还会从 Prism ML 官方 Release 下载与模型匹配的 Windows CUDA 12.4 运行库。

推荐在仓库目录中执行一键安装脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_bonsai_windows.ps1
```

脚本会下载、合并并校验文件，然后安装到当前 ComfyUI。也可以手动安装：

1. 下载主模型的 `Ternary-Bonsai-2-27B-PTQ1_0.gguf.part001` 至 `part089`，以及视觉模型的 `Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf.part001` 至 `part010`。
2. 在这些分卷所在目录打开 CMD，分别执行：

   ```bat
   copy /b Ternary-Bonsai-2-27B-PTQ1_0.gguf.part* Ternary-Bonsai-2-27B-PTQ1_0.gguf
   copy /b Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf.part* Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf
   ```

3. 从 Prism ML 的 [`prism-b10709-9a9394a`](https://github.com/PrismML-Eng/llama.cpp/releases/tag/prism-b10709-9a9394a) Release 下载以下两个压缩包，并把两者都解压到 `runtime` 目录：
   - `llama-prism-b10709-9a9394a-bin-win-cuda-12.4-x64.zip`
   - `cudart-llama-bin-win-cuda-12.4-x64.zip`
4. 按下面的目录放置：

```text
ComfyUI/
├─ custom_nodes/
│  └─ ComfyUI-Xinbao-Node-Group/
└─ models/
   └─ LLM/
      └─ Bonsai2-27B/
         ├─ Ternary-Bonsai-2-27B-PTQ1_0.gguf
         ├─ Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf
         └─ runtime/
            ├─ llama-server.exe
            └─ 其余 DLL 与运行文件
```

模型和运行库不放在 `custom_nodes` 目录，因此节点源码本身只有几百 KB。节点会依次查找：

1. 环境变量 `XINBAO_BONSAI_RUNTIME` 指向的运行库目录；
2. `ComfyUI/models/LLM/Bonsai2-27B/runtime/`；
3. 旧版本使用的节点目录内 `runtime/`。

## 模型来源与授权

- Bonsai 2 27B GGUF：[`prism-ml/Ternary-Bonsai-2-27B-gguf`](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf)，Apache-2.0；
- 本项目重新分发的模型文件未作修改，模型版权归原作者 Prism ML；
- Windows 推理运行库来自 Prism ML 官方 llama.cpp fork Release，MIT License。

完整第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 更新计划

这是长期维护的统一节点组。后续心宝自用节点会继续加入本仓库，并通过 GitHub Releases 发布需要的大型模型或运行资源。欢迎通过 Issues 反馈问题。
