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

## 安装节点

把仓库克隆到 ComfyUI 的 `custom_nodes` 目录：

```powershell
cd ComfyUI\custom_nodes
git clone https://github.com/lishuihan123/ComfyUI-Xinbao-Node-Group.git
```

重启 ComfyUI 后，`心宝❤图片标准化` 和 `心宝❤构图` 即可使用。`requirements.txt` 不要求额外 Python 包；Pillow、NumPy 和 PyTorch 由常规 ComfyUI 环境提供。

`心宝❤推理（极速版）` 已拆分为独立项目：[`ComfyUI-Xinbao-Inference-Fast`](https://github.com/lishuihan123/ComfyUI-Xinbao-Inference-Fast)。需要提示词扩写、图片/视频反推时请单独安装该仓库。

## 更新计划

这是长期维护的通用节点组。后续心宝自用的实用功能会继续加入本仓库。大型推理功能不再放入本仓库，欢迎通过 Issues 反馈问题。
