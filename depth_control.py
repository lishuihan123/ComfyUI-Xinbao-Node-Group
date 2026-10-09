import torch
import torch.nn.functional as F


class XinbaoDepthDetailControl:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "low_threshold": (
                    "FLOAT",
                    {"default": 0.05, "min": 0.0, "max": 0.95, "step": 0.01, "tooltip": "裁掉低于此值的深度；必须小于高阈值。"},
                ),
                "high_threshold": (
                    "FLOAT",
                    {"default": 0.95, "min": 0.05, "max": 1.0, "step": 0.01, "tooltip": "裁掉高于此值的深度；必须大于低阈值。"},
                ),
                "gamma": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.20, "max": 3.0, "step": 0.05, "tooltip": "调整中间深度，1.0 保持原样。"},
                ),
                "depth_levels": (
                    "INT",
                    {"default": 256, "min": 2, "max": 256, "step": 1, "tooltip": "256 最精细，数值越小越粗糙；2 为两层剪影。"},
                ),
                "smoothing": (
                    "FLOAT",
                    {"default": 0.0, "min": 0.0, "max": 10.0, "step": 0.25, "tooltip": "平滑细碎深度，越大越柔和。"},
                ),
                "invert": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("adjusted_depth",)
    FUNCTION = "adjust"
    CATEGORY = "心宝♥节点组/深度"
    DESCRIPTION = "视频复刻时调节深度视频的阈值、层级与平滑度，在保持帧间连贯性的同时获得更合适的深度控制，从而改善复刻效果。"

    @staticmethod
    def _gaussian_kernel(radius, device, dtype):
        sigma = max(float(radius), 0.01)
        kernel_radius = max(1, int(round(sigma * 2.0)))
        coordinates = torch.arange(
            -kernel_radius, kernel_radius + 1, device=device, dtype=dtype
        )
        kernel = torch.exp(-(coordinates**2) / (2.0 * sigma**2))
        return kernel / kernel.sum()

    def adjust(
        self,
        images,
        low_threshold=0.05,
        high_threshold=0.95,
        gamma=1.0,
        depth_levels=256,
        smoothing=0.0,
        invert=False,
    ):
        source_dtype = images.dtype
        work = images.float()

        low = min(float(low_threshold), float(high_threshold) - 1e-4)
        high = max(float(high_threshold), low + 1e-4)
        work = ((work - low) / (high - low)).clamp(0.0, 1.0)
        work = work.pow(max(float(gamma), 1e-4))

        if smoothing > 0.0:
            kernel = self._gaussian_kernel(smoothing, work.device, work.dtype)
            channels = work.shape[-1]
            tensor = work.permute(0, 3, 1, 2)
            horizontal = kernel.view(1, 1, 1, -1).expand(channels, 1, 1, -1)
            vertical = kernel.view(1, 1, -1, 1).expand(channels, 1, -1, 1)
            padding = kernel.numel() // 2
            tensor = F.pad(tensor, (padding, padding, 0, 0), mode="replicate")
            tensor = F.conv2d(tensor, horizontal, groups=channels)
            tensor = F.pad(tensor, (0, 0, padding, padding), mode="replicate")
            tensor = F.conv2d(tensor, vertical, groups=channels)
            work = tensor.permute(0, 2, 3, 1)

        levels = max(2, min(int(depth_levels), 256))
        if levels < 256:
            work = torch.round(work * (levels - 1)) / float(levels - 1)

        if invert:
            work = 1.0 - work

        return (work.clamp(0.0, 1.0).to(dtype=source_dtype),)


NODE_CLASS_MAPPINGS = {
    "XinbaoDepthDetailControl": XinbaoDepthDetailControl,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XinbaoDepthDetailControl": "心宝♥深度调节",
}
