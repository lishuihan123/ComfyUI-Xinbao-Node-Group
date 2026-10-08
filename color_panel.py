import re

import torch
from PIL import ImageColor


class XinbaoColorPanel:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "width": ("INT", {"default": 512, "min": 1, "max": 16384, "step": 1}),
            "height": ("INT", {"default": 512, "min": 1, "max": 16384, "step": 1}),
            "color": ("STRING", {"default": "#000000"}),
        }, "optional": {
            "transparent_background": ("BOOLEAN", {"default": False}),
        }}

    RETURN_TYPES = ("IMAGE", "INT", "INT", "STRING")
    RETURN_NAMES = ("图像", "宽", "高", "HEX色号")
    FUNCTION = "create"
    CATEGORY = "心宝❤节点组"
    DESCRIPTION = "设置宽高与 HEX 填充色。勾选 PNG 透明背景后忽略颜色，输出全透明 RGBA 图像，连接保存图像可保存透明 PNG。"

    def create(self, width, height, color, transparent_background=False):
        if transparent_background:
            return (torch.zeros((1, height, width, 4), dtype=torch.float32), width, height, "#00000000")
        color = color.strip()
        if not color.startswith("#"):
            color = "#" + color
        if not re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})", color):
            raise ValueError("请输入 HEX 色号，例如 #000000 或 #FF8800。")
        rgb = ImageColor.getrgb(color)
        hex_color = "#%02X%02X%02X" % rgb
        image = torch.tensor(rgb, dtype=torch.float32).div_(255).reshape(1, 1, 1, 3)
        return (image.expand(1, height, width, 3).clone(), width, height, hex_color)


NODE_CLASS_MAPPINGS = {"XinbaoColorPanel": XinbaoColorPanel}
NODE_DISPLAY_NAME_MAPPINGS = {"XinbaoColorPanel": "心宝❤颜色面板"}
