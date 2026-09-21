import base64
import io
import json
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import torch
from PIL import Image, ImageFilter, ImageOps

import folder_paths


DEFAULT_TRANSFORM = {
    "x": 0.5,
    "y": 0.5,
    "scale": 0.35,
    "rotation": 0.0,
}


def _tensor_first(image: torch.Tensor) -> torch.Tensor:
    if not isinstance(image, torch.Tensor):
        raise TypeError("图像输入必须是 IMAGE。")
    if image.ndim == 4:
        if image.shape[0] < 1:
            raise ValueError("图像 batch 为空。")
        return image[0]
    if image.ndim == 3:
        return image
    raise ValueError("不支持的图像张量维度。")


def _tensor_to_rgba(image: torch.Tensor) -> Image.Image:
    arr = _tensor_first(image).detach().cpu().numpy()
    arr = np.clip(arr, 0.0, 1.0)
    if arr.ndim != 3:
        raise ValueError("不支持的图像张量格式。")
    if arr.shape[-1] == 1:
        arr = np.repeat(arr, 3, axis=-1)
    if arr.shape[-1] >= 4:
        arr = arr[..., :4]
    if arr.shape[-1] == 3:
        rgba = np.concatenate([arr, np.ones((*arr.shape[:2], 1), dtype=arr.dtype)], axis=-1)
    else:
        rgba = arr
    return Image.fromarray((rgba * 255.0 + 0.5).astype(np.uint8), mode="RGBA")


def _pil_to_image_tensor(image: Image.Image) -> torch.Tensor:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    return torch.from_numpy(rgb).unsqueeze(0)


def _pil_to_mask_tensor(mask: Image.Image) -> torch.Tensor:
    arr = np.asarray(mask.convert("L"), dtype=np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def _load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        return im.convert("RGBA")


def _base_dir_from_type(dir_type: str) -> Path:
    if dir_type == "input":
        return Path(folder_paths.get_input_directory()).resolve()
    if dir_type == "output":
        return Path(folder_paths.get_output_directory()).resolve()
    if dir_type == "temp":
        return Path(folder_paths.get_temp_directory()).resolve()
    raise ValueError(f"不支持的图片类型：{dir_type}")


def _resolve_ref_path(raw_ref: str) -> Optional[Path]:
    if not raw_ref or not isinstance(raw_ref, str):
        return None
    try:
        ref = json.loads(raw_ref)
    except Exception:
        return None
    if not isinstance(ref, dict):
        return None

    filename = str(ref.get("filename") or "").replace("\\", "/").lstrip("/")
    subfolder = str(ref.get("subfolder") or "").replace("\\", "/").strip("/")
    dir_type = str(ref.get("type") or "input")
    if not filename:
        return None

    base = _base_dir_from_type(dir_type)
    rel = f"{subfolder}/{filename}" if subfolder else filename
    candidate = (base / rel).resolve()
    try:
        candidate.relative_to(base)
    except ValueError as exc:
        raise ValueError("图片路径不合法。") from exc
    if not candidate.is_file():
        raise FileNotFoundError(f"找不到图片文件：{rel}")
    return candidate


def _image_from_tensor_or_ref(image: torch.Tensor, raw_ref: str) -> Image.Image:
    path = _resolve_ref_path(raw_ref)
    if path is not None:
        return _load_rgba(path)
    return _tensor_to_rgba(image)


def _parse_transform(raw: str) -> Dict[str, float]:
    data = dict(DEFAULT_TRANSFORM)
    try:
        parsed = json.loads(raw) if raw else {}
        if isinstance(parsed, dict):
            data.update(parsed)
    except Exception:
        pass

    def number(name: str, default: float) -> float:
        try:
            value = float(data.get(name, default))
            if not np.isfinite(value):
                return default
            return value
        except Exception:
            return default

    return {
        "x": number("x", 0.5),
        "y": number("y", 0.5),
        "scale": max(0.001, number("scale", 0.35)),
        "rotation": number("rotation", 0.0) % 360.0,
    }


def _max_scale_to_fit(bg_w: int, bg_h: int, ov_w: int, ov_h: int, rotation_deg: float) -> float:
    c = abs(np.cos(np.deg2rad(rotation_deg)))
    s = abs(np.sin(np.deg2rad(rotation_deg)))
    ratio = ov_h / max(1.0, ov_w)
    limit_x = 1.0 / max(1e-8, c + ratio * s)
    limit_y = (bg_h / max(1.0, bg_w)) / max(1e-8, s + ratio * c)
    return max(0.001, min(limit_x, limit_y))


def _clamp_transform(bg_w: int, bg_h: int, ov_w: int, ov_h: int, transform: Dict[str, float]) -> Dict[str, float]:
    rotation = transform["rotation"] % 360.0
    scale = max(0.001, float(transform["scale"]))

    w = bg_w * scale
    h = w * ov_h / max(1.0, ov_w)
    c = abs(np.cos(np.deg2rad(rotation)))
    s = abs(np.sin(np.deg2rad(rotation)))
    bbox_w = w * c + h * s
    bbox_h = w * s + h * c

    # Allow up to 80% of the product to extend outside the frame.
    # That means at least 20% remains inside, so the center may move
    # outward by 30% of the rotated bounding-box size beyond each edge.
    margin_x = 0.3 * (bbox_w / max(1.0, bg_w))
    margin_y = 0.3 * (bbox_h / max(1.0, bg_h))
    x = min(1.0 + margin_x, max(-margin_x, float(transform["x"])))
    y = min(1.0 + margin_y, max(-margin_y, float(transform["y"])))
    return {"x": x, "y": y, "scale": scale, "rotation": rotation}




def _decode_data_url_image(raw: str) -> Optional[Image.Image]:
    if not raw or not isinstance(raw, str):
        return None
    if not raw.startswith("data:image/") or "," not in raw:
        return None
    try:
        _, payload = raw.split(",", 1)
        binary = base64.b64decode(payload)
        with Image.open(io.BytesIO(binary)) as im:
            return im.convert("RGBA")
    except Exception:
        return None
def _opacity_fraction(opacity_pct: int) -> float:
    """将 0-100 转为更符合视觉感受的透明度。低数值不会突然显得很实。"""
    value = max(0.0, min(100.0, float(opacity_pct))) / 100.0
    return value ** 2.2


def _make_outline_rgba(alpha: Image.Image, size_px: int, opacity_pct: int) -> Tuple[Optional[Image.Image], int, int]:
    size_px = int(max(0, min(100, size_px)))
    opacity_pct = int(max(0, min(100, opacity_pct)))
    if size_px <= 0 or opacity_pct <= 0:
        return None, 0, 0

    w, h = alpha.size
    pad = max(2, size_px + 2)
    padded = Image.new("L", (w + pad * 2, h + pad * 2), 0)
    padded.paste(alpha, (pad, pad))

    # MaxFilter requires an odd kernel size.
    kernel = max(3, size_px * 2 + 1)
    dilated = padded.filter(ImageFilter.MaxFilter(kernel))

    alpha_arr = np.asarray(padded, dtype=np.uint8)
    dilated_arr = np.asarray(dilated, dtype=np.uint8)
    outer = np.where(alpha_arr > 0, 0, dilated_arr)
    if not np.any(outer):
        return None, 0, 0

    outer_alpha = np.clip(np.round(outer.astype(np.float32) * _opacity_fraction(opacity_pct)), 0, 255).astype(np.uint8)
    rgba = np.zeros((outer.shape[0], outer.shape[1], 4), dtype=np.uint8)
    rgba[..., :3] = 255  # 白色外描边
    rgba[..., 3] = outer_alpha
    return Image.fromarray(rgba, mode="RGBA"), -pad, -pad



class XinbaoPintu:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "background": ("IMAGE", {"tooltip": "背景图。最终输出尺寸完全跟随这张图。"}),
                "product": ("IMAGE", {"tooltip": "产品图。会始终叠放在背景图上方。"}),
                "outline_size": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 100,
                        "step": 1,
                        "display": "slider",
                        "tooltip": "产品外描边粗细，单位像素。仅影响最终拼合图，不影响遮罩。",
                    },
                ),
                "outline_opacity": (
                    "INT",
                    {
                        "default": 50,
                        "min": 0,
                        "max": 100,
                        "step": 1,
                        "display": "slider",
                        "tooltip": "描边与手动画笔图层的统一透明度：0 为完全透明，100 为完全不透明。仅影响拼合图，不影响遮罩。",
                    },
                ),
                "transform_json": (
                    "STRING",
                    {
                        "default": json.dumps(DEFAULT_TRANSFORM, ensure_ascii=False),
                        "multiline": False,
                        "tooltip": "前端画布自动保存的位置、缩放和旋转数据。",
                    },
                ),
                "locked": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "锁定后前端不能继续编辑；执行时仍按当前保存状态输出。",
                    },
                ),
                "background_ref": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": "前端自动记录背景图来源，用于精确读取原图。",
                    },
                ),
                "product_ref": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": "前端自动记录产品图来源；若为 PNG，会保留透明通道。",
                    },
                ),
                "paint_layer": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": "前端自动保存的手动画笔图层，仅影响最终拼合图，不影响遮罩。",
                    },
                ),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("拼合图", "产品遮罩")
    FUNCTION = "compose"
    CATEGORY = "心宝❤节点组"
    DESCRIPTION = (
        "输入背景图与产品图，在节点画布中拖动、缩放、旋转并锁定。"
        "背景图尺寸就是最终输出尺寸；产品不能超出背景范围。"
        "可选白色外描边；遮罩始终只输出产品本体遮罩，不包含描边。"
    )

    def compose(
        self,
        background: torch.Tensor,
        product: torch.Tensor,
        outline_size: int,
        outline_opacity: int,
        transform_json: str,
        locked: bool,
        background_ref: str,
        product_ref: str,
        paint_layer: str,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        del locked

        background_rgba = _image_from_tensor_or_ref(background, background_ref)
        product_rgba = _image_from_tensor_or_ref(product, product_ref)
        transform = _parse_transform(transform_json)

        bg_w, bg_h = background_rgba.size
        ov_w, ov_h = product_rgba.size
        if bg_w < 1 or bg_h < 1 or ov_w < 1 or ov_h < 1:
            raise ValueError("图片尺寸无效。")

        transform = _clamp_transform(bg_w, bg_h, ov_w, ov_h, transform)

        target_w = max(1, int(round(bg_w * transform["scale"])))
        target_h = max(1, int(round(target_w * ov_h / ov_w)))
        resized = product_rgba.resize((target_w, target_h), Image.Resampling.LANCZOS)

        rotated = resized.rotate(
            -transform["rotation"],
            resample=Image.Resampling.BICUBIC,
            expand=True,
        )
        alpha = rotated.getchannel("A")

        center_x = int(round(bg_w * transform["x"]))
        center_y = int(round(bg_h * transform["y"]))
        left = center_x - rotated.width // 2
        top = center_y - rotated.height // 2
        # Keep output behavior consistent with the editor preview:
        # the product center may move anywhere inside the frame, so up to
        # half of the product can extend outside the canvas.

        composite = background_rgba.copy()

        paint_rgba = _decode_data_url_image(paint_layer)
        if paint_rgba is not None:
            if paint_rgba.size != (bg_w, bg_h):
                paint_rgba = paint_rgba.resize((bg_w, bg_h), Image.Resampling.BILINEAR)
            if outline_opacity < 100:
                arr = np.asarray(paint_rgba, dtype=np.uint8).copy()
                arr[..., 3] = np.clip(np.round(arr[..., 3].astype(np.float32) * _opacity_fraction(outline_opacity)), 0, 255).astype(np.uint8)
                paint_rgba = Image.fromarray(arr, mode="RGBA")
            composite.alpha_composite(paint_rgba, dest=(0, 0))

        outline_layer, outline_dx, outline_dy = _make_outline_rgba(alpha, outline_size, outline_opacity)
        if outline_layer is not None:
            composite.alpha_composite(outline_layer, dest=(left + outline_dx, top + outline_dy))
        composite.alpha_composite(rotated, dest=(left, top))

        binary_alpha = alpha.point(lambda p: 255 if p >= 8 else 0, mode="L")
        mask = Image.new("L", (bg_w, bg_h), 0)
        mask.paste(binary_alpha, (left, top))

        return _pil_to_image_tensor(composite), _pil_to_mask_tensor(mask)

    @classmethod
    def IS_CHANGED(
        cls,
        background: torch.Tensor,
        product: torch.Tensor,
        outline_size: int,
        outline_opacity: int,
        transform_json: str,
        locked: bool,
        background_ref: str,
        product_ref: str,
        paint_layer: str,
    ):
        parts = [
            str(tuple(background.shape)) if isinstance(background, torch.Tensor) else "background_missing",
            str(tuple(product.shape)) if isinstance(product, torch.Tensor) else "product_missing",
            str(int(outline_size)),
            str(int(outline_opacity)),
            transform_json,
            str(bool(locked)),
            background_ref or "",
            product_ref or "",
            str(hash(paint_layer or "")),
        ]
        return "|".join(parts)


NODE_CLASS_MAPPINGS = {
    "XinbaoPintu": XinbaoPintu,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XinbaoPintu": "心宝❤构图",
}
