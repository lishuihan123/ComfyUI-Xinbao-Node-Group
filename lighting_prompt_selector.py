from __future__ import annotations

import json
from collections import OrderedDict


LIGHTING_PROMPTS = OrderedDict(
    [
        (
            "tree_shadow",
            (
                "树荫光",
                "加入自然、真实、方向一致的树荫光，使枝叶形状的光影可以投射在人物、地面和背景上；只添加光影，不新增树木、树枝、树叶或其他植物实体。",
            ),
        ),
        (
            "striped_light",
            (
                "条纹光",
                "加入自然的条纹光影，让方向一致的条纹阴影落在主体与场景表面。",
            ),
        ),
        (
            "lens_flare",
            (
                "镜头光晕",
                "加入克制、自然的镜头光晕，不遮挡主体与文字。",
            ),
        ),
        (
            "transparent_caustics",
            (
                "透明焦散",
                "增强透明材质的透光感、光线传输和自然焦散，保持材质真实。",
            ),
        ),
        (
            "tyndall_light",
            (
                "丁达尔光",
                "加入强烈、清晰可见的丁达尔光，多束明亮的体积光穿过空气中的薄雾，形成鲜明的光柱与明暗分层；光束照亮人物或产品主体，并在受遮挡区域形成明显阴影，呈现强烈的空间纵深和戏剧性光照，保持光线方向与场景透视一致。",
            ),
        ),
        (
            "night_lamp",
            (
                "夜间开灯",
                "转换为夜间室内光，让台灯自然照亮桌面与场景，保持真实的夜间明暗关系。",
            ),
        ),
        (
            "rim_light",
            (
                "轮廓光",
                "加入明显而自然的轮廓光，使主体边缘形成清晰的高光轮廓，增强主体与背景的层次分离，保持主体结构不变。",
            ),
        ),
        (
            "dramatic_spotlight",
            (
                "戏剧聚光",
                "加入明显的戏剧性聚光灯，使聚光集中照亮主体，周围区域自然变暗，形成清晰但柔和的明暗层次。",
            ),
        ),
        (
            "sunset_gold",
            (
                "日落金光",
                "转换为温暖的日落金色光，让低角度暖光自然照射主体与场景，形成明显的金色高光和柔和长阴影。",
            ),
        ),
        (
            "warm_cool_dual",
            (
                "冷暖双色",
                "加入明显的冷暖双色打光，一侧为暖色光，另一侧为冷色光，两种光线自然作用于主体和背景，保持真实的明暗关系。",
            ),
        ),
        (
            "neon_dual",
            (
                "霓虹双色",
                "加入明显的蓝色与洋红色霓虹光，让彩色光线自然照亮主体与环境表面，呈现真实的颜色反射，不新增霓虹灯牌或其他物体。",
            ),
        ),
        (
            "moonlight",
            (
                "月光",
                "转换为自然的夜间月光效果，让冷色月光从单一方向照入，形成柔和高光与清晰阴影，不新增月亮或改变背景内容。",
            ),
        ),
        (
            "stage_follow_spot",
            (
                "舞台追光",
                "加入明显的舞台追光，使一束方向明确的光集中照亮主体，背景适度压暗，光束与空间透视保持一致。",
            ),
        ),
        (
            "firelight",
            (
                "火光",
                "加入自然跳动的暖色火光效果，让橙红色光线照亮主体和附近环境，形成真实的明暗变化，但不新增火焰、蜡烛或壁炉。",
            ),
        ),
        (
            "water_ripple",
            (
                "水波光影",
                "加入明显而自然的水波光影，让流动的波纹光投射在主体与场景表面，只添加光影，不新增水面、泳池或其他物体。",
            ),
        ),
        (
            "color_projection",
            (
                "彩色投影",
                "加入明显的彩色投影光影，使抽象色彩和渐变光线自然投射在主体与背景上，只改变光线，不新增投影设备或文字图案。",
            ),
        ),
        (
            "hard_light_cut",
            (
                "硬光切割",
                "加入方向明确的硬光，使主体和场景出现清晰的明暗切割与锐利阴影边缘，保持真实的光线方向和空间关系。",
            ),
        ),
        (
            "studio_softbox",
            (
                "棚拍柔光",
                "转换为干净自然的商业棚拍柔光，均匀照亮主体，保留柔和阴影、材质纹理和立体感，避免过曝和塑料感。",
            ),
        ),
    ]
)


SUBJECT_FLAG = "__subject_surface__"
SUBJECT_PROMPT = "光影必须明确作用于人物或产品主体表面，形成清晰的硬光照明与遮挡投影，呈现明显的明暗交界；投影随主体轮廓和曲面自然变化，不得仅作用于背景或地面。"
SUBJECT_LIGHTS = {"tree_shadow", "striped_light"}


def _parse_selection(raw_selection: str) -> list[str]:
    if not raw_selection:
        return []
    try:
        parsed = json.loads(raw_selection)
    except (TypeError, ValueError, json.JSONDecodeError):
        parsed = [item.strip() for item in str(raw_selection).split(",")]

    if isinstance(parsed, dict):
        parsed = parsed.get("lights", [])
    if not isinstance(parsed, list):
        return []

    selected = []
    seen = set()
    for item in parsed:
        key = str(item)
        if (key in LIGHTING_PROMPTS or key == SUBJECT_FLAG) and key not in seen:
            selected.append(key)
            seen.add(key)
    return selected


def _join_prompts(keys: list[str]) -> str:
    sentences = []
    for key in keys:
        if key == SUBJECT_FLAG:
            continue
        prompt = LIGHTING_PROMPTS[key][1].strip().rstrip("。；，,; ")
        if SUBJECT_FLAG in keys and key in SUBJECT_LIGHTS:
            prompt += "。" + SUBJECT_PROMPT.rstrip("。")
        if prompt:
            sentences.append(prompt)
    return "，".join(sentences) + ("。" if sentences else "")


class XinbaoLightingPromptSelector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected_lights": (
                    "STRING",
                    {
                        "default": "[]",
                        "multiline": False,
                        "tooltip": "由节点按钮自动维护，请直接点击节点内的光效按钮。",
                    },
                )
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("文本",)
    OUTPUT_TOOLTIPS = ("把所有已选光效的完整提示词用中文逗号合并。",)
    FUNCTION = "build_prompt"
    CATEGORY = "心宝❤节点组/提示词"
    DESCRIPTION = "搭配心宝全能打光 LoRA 使用，选择光效更加方便。"

    def build_prompt(self, selected_lights="[]"):
        prompt = _join_prompts(_parse_selection(selected_lights))
        try:
            state = json.loads(selected_lights)
        except (TypeError, ValueError):
            state = None
        supplement = state.get("supplement", "") if isinstance(state, dict) else ""
        if isinstance(supplement, str) and supplement.strip():
            supplement = supplement.strip()
            prompt = prompt.rstrip("。；，,; ") + "，" + supplement if prompt else supplement
        return (prompt,)


class XinbaoLightingPromptSelectorLegacy(XinbaoLightingPromptSelector):
    """仅用于自动打开旧工作流中已保存的节点。"""

    DEPRECATED = True


NODE_CLASS_MAPPINGS = {
    "XinbaoLightingCompanion": XinbaoLightingPromptSelector,
    "XinbaoLightingPromptSelector": XinbaoLightingPromptSelectorLegacy,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XinbaoLightingCompanion": "心宝❤打光搭档",
    "XinbaoLightingPromptSelector": "心宝❤打光搭档",
}
