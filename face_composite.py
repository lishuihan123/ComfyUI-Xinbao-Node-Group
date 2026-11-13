"""Align a masked pose-converted face layer to the base photograph."""
import json
import math
from pathlib import Path

import cv2
import numpy as np
import torch

import folder_paths
DETECTOR_FILE = "yolox_m_8xb8-300e_humanart-c2c7a14a.onnx"
POSE_FILE = "rtmw-x_simcc-cocktail14_pt-ucoco_270e-384x288-f840f204_20231122.onnx"
from .face_contour import detect_contour, fit_contour, contour_difference, contour_preview


class XinbaoFaceContourCompositeV2:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "base_image": ("IMAGE", {"tooltip": "拼接前底图，提供脸部轮廓大小和位置。"}),
            "head_image": ("IMAGE", {"tooltip": "姿态转换后的完整图片，提供要拼入的脸。"}),
            "head_mask": ("MASK", {"tooltip": "与姿态图同尺寸的原有抠脸遮罩；白色区域被拼入。"}),
            "scale_adjust": ("FLOAT", {"default": 1.0, "min": .1, "max": 3.0, "step": .01,
                                       "tooltip": "自动等比缩放后额外乘数，默认 1 即全自动。"}),
            "offset_x": ("INT", {"default": 0, "min": -8192, "max": 8192,
                                  "tooltip": "自动对齐后横向微调，默认 0。"}),
            "offset_y": ("INT", {"default": 0, "min": -8192, "max": 8192,
                                  "tooltip": "自动对齐后纵向微调，默认 0。"}),
            "align_tilt": ("BOOLEAN", {"default": False,
                                       "tooltip": "仅用脸颊、下颌、下巴外轮廓拟合平面旋转，不使用五官；不能修正三维朝向。"}),
            "preview_opacity": ("FLOAT", {"default": .5, "min": 0.0, "max": 1.0, "step": .05}),
        }, "optional": {
            "face_scale_percent": ("FLOAT", {"default": 0.0, "min": -20.0, "max": 20.0, "step": 1.0,
                                             "tooltip": "自动对齐后，以脸部轮廓中心等比缩放。-20 为缩小 20%，0 不额外缩放，20 为放大 20%。脸部与遮罩同步，底图不变。"}),
        }}

    RETURN_TYPES = ("IMAGE", "MASK", "IMAGE", "STRING")
    RETURN_NAMES = ("对齐后拼合图", "对齐后遮罩", "脸部轮廓叠加对比", "对齐报告")
    FUNCTION = "composite"
    CATEGORY = "心宝♥节点组"
    DESCRIPTION = "只用两侧脸颊、下颌至下巴的17个外轮廓点，最小二乘拟合等比缩放和位移。五官、头发、遮罩边界不参与对齐，底图固定。"

    def composite(self, base_image, head_image, head_mask, scale_adjust=1.0,
                  offset_x=0, offset_y=0, align_tilt=False, preview_opacity=.5,
                  face_scale_percent=0.0):
        try:
            from rtmlib import Wholebody
        except ImportError as exc:
            raise ImportError("外轮廓拼脸需要 rtmlib 和 onnxruntime，请用 ComfyUI 的 Python 安装本插件 requirements.txt。") from exc
        if head_mask.ndim == 2:
            head_mask = head_mask.unsqueeze(0)
        if tuple(head_image.shape[1:3]) != tuple(head_mask.shape[1:3]):
            raise ValueError("抠脸遮罩必须与姿态转换图同尺寸、同画布，不能传入独立裁切的小图遮罩。")
        count = max(len(base_image), len(head_image), len(head_mask))
        if any(len(value) not in (1, count) for value in (base_image, head_image, head_mask)):
            raise ValueError("三项输入批次数量须相同，或为 1 张供整批共用。")
        models = Path(folder_paths.models_dir) / "pose"
        for filename in (DETECTOR_FILE, POSE_FILE):
            if not (models / filename).is_file():
                raise FileNotFoundError(f"缺少本地检测模型：{models / filename}。节点不会自动下载模型。")
        detector = Wholebody(det=str(models / DETECTOR_FILE), pose=str(models / POSE_FILE),
                             to_openpose=False, backend="onnxruntime", device="cpu")
        outputs, masks, previews, reports = [], [], [], []
        for index in range(count):
            base = base_image[index if len(base_image) > 1 else 0, :, :, :3].detach().cpu().float().numpy()
            head = head_image[index if len(head_image) > 1 else 0, :, :, :3].detach().cpu().float().numpy()
            mask = head_mask[index if len(head_mask) > 1 else 0].detach().cpu().float().numpy().clip(0, 1)
            base_u8 = np.rint(base.clip(0, 1) * 255).astype(np.uint8)
            head_u8 = np.rint(head.clip(0, 1) * 255).astype(np.uint8)
            target_face, target_detection = detect_contour(detector, base_u8)
            head_face, head_detection = detect_contour(detector, head_u8)
            linear, shift, auto_scale, rotation = fit_contour(head_face, target_face, align_tilt)
            angle = math.atan2(rotation[1, 0], rotation[0, 0])
            auto_aligned = head_face @ linear.T + shift
            auto_metrics = contour_difference(target_face, auto_aligned)
            # All manual scaling uses the aligned outer-contour bounding-box center.
            aligned_center = (auto_aligned.min(axis=0) + auto_aligned.max(axis=0)) * .5
            factor = scale_adjust * (1.0 + face_scale_percent / 100.0)
            linear = factor * linear
            shift = aligned_center + factor * (shift - aligned_center) + [offset_x, offset_y]
            aligned_center += [offset_x, offset_y]
            scale = auto_scale * factor
            matrix = np.column_stack([linear, shift]).astype(np.float32)
            size = (base.shape[1], base.shape[0])
            alpha = cv2.warpAffine(mask, matrix, size, flags=cv2.INTER_LINEAR,
                                   borderMode=cv2.BORDER_CONSTANT, borderValue=0).clip(0, 1)
            # Premultiplied color prevents source background leaking into the feathered edge.
            premultiplied = head * mask[:, :, None]
            layer = cv2.warpAffine(premultiplied, matrix, size, flags=cv2.INTER_LINEAR,
                                   borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            result = layer + base * (1 - alpha[:, :, None])
            aligned_face = head_face @ matrix[:, :2].T + matrix[:, 2]
            identity = np.array([[1, 0, 0], [0, 1, 0]], dtype=np.float32)
            before_alpha = cv2.warpAffine(mask, identity, size)
            before = cv2.warpAffine(premultiplied, identity, size) + base * (1 - before_alpha[:, :, None])
            preview = contour_preview(base_u8, np.rint(before.clip(0, 1) * 255).astype(np.uint8),
                                 np.rint(result.clip(0, 1) * 255).astype(np.uint8),
                                 target_face, head_face, aligned_face, preview_opacity)
            outputs.append(torch.from_numpy(result.astype(np.float32)))
            masks.append(torch.from_numpy(alpha.astype(np.float32)))
            previews.append(torch.from_numpy(preview.astype(np.float32) / 255))
            reports.append({
                "序号": index + 1,
                "自动等比缩放倍数": round(auto_scale, 5), "最终缩放倍数": round(scale, 5),
                "脸部缩放百分比": face_scale_percent, "缩放中心像素": aligned_center.tolist(),
                "平面旋转角度": round(math.degrees(angle), 3), "仿射矩阵": matrix.tolist(),
                "算法": "outer_contour_17_similarity_v2",
                "对齐前": contour_difference(target_face, head_face),
                "自动拟合后_额外缩放移动前": auto_metrics,
                "最终结果_轮廓点随图层变换": contour_difference(target_face, aligned_face),
                "检测": {"底图": target_detection, "姿态图": head_detection},
                "说明": "仅使用两侧脸颊、下颌与下巴17个外轮廓点；眼眉鼻嘴及头发、遮罩边界均不参与拟合、中心计算或对比。此检测器不提供额头上缘轮廓。红线为底图，青线为拼入脸部。对齐后指标是检测点随图层变换的估计，非独立复检；等比缩放保留脸型，不保证各点完全重合，不修正三维朝向。",
            })
        return (torch.stack(outputs), torch.stack(masks), torch.stack(previews),
                json.dumps(reports, ensure_ascii=False, indent=2))


NODE_CLASS_MAPPINGS = {"XinbaoFaceContourCompositeV2": XinbaoFaceContourCompositeV2}
NODE_DISPLAY_NAME_MAPPINGS = {"XinbaoFaceContourCompositeV2": "心宝♥外轮廓拼脸"}
