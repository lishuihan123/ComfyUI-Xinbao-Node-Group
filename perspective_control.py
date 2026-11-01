"""Scene-rotation captions matching the approved Qwen 2.1 dataset."""

from .perspective_caption import build_caption

ANGLES = {"-90": "左90°", "-45": "左45°", "0": "0°", "45": "右45°", "90": "右90°"}
HEIGHTS = {"低": "低", "中": "中", "高": "高", "顶": "顶"}


class XinbaoPerspectiveControl:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "rotation": (list(ANGLES), {"default": "0", "tooltip": "场景旋转方向：负数向左，正数向右。不是摄像机位置。"}),
            "height": (list(HEIGHTS), {"default": "中", "tooltip": "低−45°，中0°，高45°，顶90°。"}),
            "distance": (["中", "大"], {"default": "中", "tooltip": "大表示摄像机沿相同轨道方向拉远，保持焦距。"}),
        }}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("透视提示词",)
    FUNCTION = "build_prompt"
    CATEGORY = "心宝♥节点组"
    DESCRIPTION = "选择场景旋转、摄像机高度与距离，输出Xinbao训练集中文打标格式。"

    def build_prompt(self, rotation, height, distance):
        return (build_caption(rotation, height, distance),)


NODE_CLASS_MAPPINGS = {"XinbaoPerspectiveControl": XinbaoPerspectiveControl}
NODE_DISPLAY_NAME_MAPPINGS = {"XinbaoPerspectiveControl": "心宝❤透视调节"}
