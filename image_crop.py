import json
import math
import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor

import folder_paths
from .image_standardizer import STANDARD_IMAGE_SIZES


DEFAULT_CROP = {
    "ratio": "1:1", "custom_width": 1, "custom_height": 1, "multiple": 32,
    "edge": "long", "pixels": 1024,
    "zoom": 1.0, "x": 0.0, "y": 0.0,
    "background": "#000000", "locked": False,
}


def crop_settings(raw):
    state = {**DEFAULT_CROP, **json.loads(raw or "{}")}
    if state["multiple"] not in (8, 16, 32):
        raise ValueError("尺寸倍数必须为 8、16 或 32。")
    if state["edge"] not in ("width", "height", "long", "short"):
        raise ValueError("像素基准必须为宽、高、长边或短边。")
    for key in ("pixels", "zoom", "x", "y"):
        state[key] = float(state[key])
        if not math.isfinite(state[key]):
            raise ValueError(f"{key} 必须为有限数值。")
    if state["pixels"] <= 0 or state["zoom"] <= 0:
        raise ValueError("像素和缩放必须大于零。")
    ImageColor.getrgb(state["background"])
    return state


def crop_size(state):
    if state["ratio"] == "custom":
        parts = [float(state[key]) for key in ("custom_width", "custom_height")]
        if not all(math.isfinite(v) and v > 0 for v in parts):
            raise ValueError("自定义比例的宽、高必须为大于零的有限数值。")
        ratio = parts[0] / parts[1]
        if not math.isfinite(ratio) or ratio <= 0:
            raise ValueError("自定义比例过大或过小，请调整比例。")
    else:
        preset = next((s for s in STANDARD_IMAGE_SIZES["1K"] if s[0] == state["ratio"]), None)
        if preset is None:
            raise ValueError("请选择有效的预设比例或自定义比例。")
        ratio = preset[1]
    edge = state["edge"]
    use_width = edge == "width" or (edge == "long" and ratio >= 1) or (edge == "short" and ratio < 1)
    width, height = (state["pixels"], state["pixels"] / ratio) if use_width else (state["pixels"] * ratio, state["pixels"])
    multiple = state["multiple"]
    if not all(math.isfinite(v) for v in (width, height)):
        raise ValueError("裁切输出尺寸过大，请调整比例或像素值。")
    width, height = (max(multiple, math.floor(v / multiple + 0.5) * multiple) for v in (width, height))
    if max(width, height) > 16384:
        raise ValueError("裁切输出单边不能超过 16384 像素，请减小像素值。")
    return width, height


def crop_frame(frame, state, size):
    array = np.clip(frame.detach().float().cpu().numpy(), 0, 1)
    source = Image.fromarray((array * 255 + 0.5).astype(np.uint8)).convert("RGBA")
    width, height = size
    scale = max(width / source.width, height / source.height) * state["zoom"]
    left = (width - source.width * scale) / 2 + state["x"] * width
    top = (height - source.height * scale) / 2 + state["y"] * height
    transformed = source.transform(
        size, Image.Transform.AFFINE,
        (1 / scale, 0, -left / scale, 0, 1 / scale, -top / scale),
        resample=Image.Resampling.BICUBIC, fillcolor=(0, 0, 0, 0),
    )
    background = Image.new("RGBA", size, ImageColor.getrgb(state["background"])[:3] + (255,))
    background.alpha_composite(transformed)
    return np.asarray(background.convert("RGB"), dtype=np.float32) / 255


class XinbaoImageCrop:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "crop_state": ("STRING", {
                "default": json.dumps(DEFAULT_CROP, ensure_ascii=False), "multiline": True,
                "xinbao_crop_ratios": [entry[0] for entry in STANDARD_IMAGE_SIZES["1K"]],
            }),
        }}

    RETURN_TYPES = ("IMAGE", "INT", "INT", "INT", "INT")
    RETURN_NAMES = ("裁切图片", "宽", "高", "长边", "短边")
    FUNCTION = "crop"
    CATEGORY = "心宝♥节点组"
    DESCRIPTION = "选择标准比例与像素，拖动/缩放图片调整居中裁切框内的画面；空白补色，锁定后防止误改。"

    def crop(self, image, crop_state):
        state = crop_settings(crop_state)
        width, height = crop_size(state)
        output = np.stack([crop_frame(frame, state, (width, height)) for frame in image])
        # Preview the actual input for arbitrary upstream IMAGE nodes, not the cropped result.
        source = np.clip(image[0].detach().float().cpu().numpy(), 0, 1)
        preview = Image.fromarray((source * 255 + 0.5).astype(np.uint8))
        preview.thumbnail((1536, 1536), Image.Resampling.LANCZOS)
        filename = f"xinbao_crop_source_{uuid.uuid4().hex}.png"
        preview.save(Path(folder_paths.get_temp_directory()) / filename)
        return {
            "ui": {"crop_source": [{"filename": filename, "subfolder": "", "type": "temp",
                                     "width": int(image.shape[2]), "height": int(image.shape[1])}],
                   "crop_size": [width, height]},
            "result": (image.new_tensor(output), width, height, max(width, height), min(width, height)),
        }


NODE_CLASS_MAPPINGS = {"XinbaoImageCrop": XinbaoImageCrop}
NODE_DISPLAY_NAME_MAPPINGS = {"XinbaoImageCrop": "心宝♥图像裁切"}
