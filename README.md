# ComfyUI Xinbao Node Group

`ComfyUI-Xinbao-Node-Group` 是心宝自用并长期维护的实用 ComfyUI 节点集合。以后新增的通用自定义节点会继续放进这个仓库，ComfyUI 中的分类统一为 `心宝❤节点组`。

## 当前包含的功能

### 心宝❤图片标准化

为了满足 Qwen-Image 2.1 及众多图像模型的标准尺寸要求，对输入图进行自动标准化处理，减少尺寸和比例不规范造成的画面、构图偏移问题。

### 心宝❤构图

- 在节点画布内交互式移动、缩放和旋转产品图；
- 支持外描边、透明度、画笔和橡皮；
- 最终画布尺寸跟随背景图；
- 同时输出合成图片与产品遮罩。

### 心宝❤深度调节

用于视频复刻流程：调节深度视频的阈值、灰度层级和细节强度，让深度控制视频更适合下游视频生成模型，以获得更好的复刻效果。节点对整批视频帧使用同一组参数，不会因后处理参数逐帧变化而破坏连贯性。

- `low_threshold` / `high_threshold`：选择有效深度范围，低阈值必须小于高阈值；
- `gamma`：调节中间深度，`1.0` 为原样；
- `depth_levels`：`256` 最精细，数值越小越粗糙，`2` 为两层剪影；
- `smoothing`：去除细碎深度，数值越大越平滑；
- `invert`：反转远近的黑白方向。

推荐预设：

- 精细：`0.02 / 0.98 / 1.0 / 256 / 0`
- 标准：`0.05 / 0.95 / 1.0 / 64 / 0.5`
- 粗糙：`0.10 / 0.90 / 1.0 / 12 / 2.0`
- 两层剪影：`0.45 / 0.55 / 1.0 / 2 / 1.0`

### 心宝❤打光搭档

搭配心宝全能打光 LoRA 使用，选择光效更加方便。支持同时选择多个光效，并将完整提示词合并为一个文本输出。

## 安装节点

把仓库克隆到 ComfyUI 的 `custom_nodes` 目录：

```powershell
cd ComfyUI\custom_nodes
git clone https://github.com/lishuihan123/ComfyUI-Xinbao-Node-Group.git
```

重启 ComfyUI 后，`心宝❤图片标准化`、`心宝❤构图`、`心宝❤深度调节` 和 `心宝❤打光搭档` 即可使用。`requirements.txt` 不要求额外 Python 包；Pillow、NumPy 和 PyTorch 由常规 ComfyUI 环境提供。

`心宝❤推理（极速版）` 已拆分为独立项目：[`ComfyUI-Xinbao-Inference-Fast`](https://github.com/lishuihan123/ComfyUI-Xinbao-Inference-Fast)。需要提示词扩写、图片/视频反推时请单独安装该仓库。

## 更新计划

这是长期维护的通用节点组。后续心宝自用的实用功能会继续加入本仓库。大型推理功能不再放入本仓库，欢迎通过 Issues 反馈问题。
