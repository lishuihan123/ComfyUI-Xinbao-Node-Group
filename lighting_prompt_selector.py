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

# Directions describe the source position as seen by the camera, not shadow travel.
DIRECTION_ENABLED = True
DIRECTION_SOURCES = {
    "top_left": "从画面左上方向右下方斜向打光。主光源位于主体左上方，光线斜向下照射人物或产品主体；朝向左上方的表面形成明显亮面，右下侧及被遮挡部位自然变暗，使左上受光、右下背光的立体关系清晰可辨",
    "top": "从画面顶部向下方打光。主光源位于主体正上方，光线自上而下照射人物或产品主体；顶部及朝上的表面形成明显亮面，朝下的表面和遮挡下方形成阴影，呈现清晰的顶部照明特征",
    "top_right": "从画面右上方向左下方斜向打光。主光源位于主体右上方，光线斜向下照射人物或产品主体；朝向右上方的表面形成明显亮面，左下侧及被遮挡部位自然变暗，使右上受光、左下背光的立体关系清晰可辨",
    "left": "从画面左侧向右侧横向打光。主光源位于主体左侧，接近主体中部高度；光线明确照亮人物或产品的左侧表面，右侧形成自然背光面，明暗交界沿主体形体展开，呈现清晰的左侧光特征",
    "right": "从画面右侧向左侧横向打光。主光源位于主体右侧，接近主体中部高度；光线明确照亮人物或产品的右侧表面，左侧形成自然背光面，明暗交界沿主体形体展开，呈现清晰的右侧光特征",
    "bottom_left": "从画面左下方向右上方斜向打光。主光源位于主体左下方、低于主体中部，光线斜向上照射人物或产品主体；朝向左下方的表面明显受光，右上侧背光面及向上的遮挡区域形成阴影，呈现清晰的低位左侧仰光特征",
    "bottom": "从画面底部向上方打光。主光源位于主体正下方、低于主体中部，光线由下向上照射人物或产品主体；主体底部及朝下的表面明显受光，朝上的背光面与被遮挡部位自然变暗，呈现清晰可辨的低位仰光特征，而非顶部照明或只提亮地面",
    "bottom_right": "从画面右下方向左上方斜向打光。主光源位于主体右下方、低于主体中部，光线斜向上照射人物或产品主体；朝向右下方的表面明显受光，左上侧背光面及向上的遮挡区域形成阴影，呈现清晰的低位右侧仰光特征",
    "front": "从主体正前方向后方打光。主光源位于靠近相机的位置，沿相机朝向主体的方向照射；人物或产品朝向相机的正面明确受光，遮挡投影落向主体后方实际存在的承接表面，呈现正面顺光特征，同时保留主体曲面的层次和所选光效的明暗图案",
    "back": "从主体正后方向相机方向打光。主光源位于主体后方，朝相机方向照射，形成明确的逆光；人物或产品朝向光源的背面、可见边缘及真实透光部位受光，朝向相机的正面相对较暗但保留细节，突出自然的边缘亮部与前后明暗分离，不将主体整体涂黑或添加发光描边",
}
DIRECTION_SUFFIX = "以上方向均以相机看到的画面为参照，并作为主光方向；若前文有不同的主光方向描述，以此处为准。光线必须实际作用于主体表面，不能只在背景增加亮斑；高光、明暗交界和投影应随主体曲面及遮挡关系一致变化，投影沿光线传播方向落在实际承接表面，符合场景透视。保留所选光效的颜色、软硬程度和光影图案；仅调整照明，不新增灯具或其他物体，不移动或旋转主体，不改变原始构图、视角、背景结构、材质、固有颜色和文字细节。"


def _direction_prompt(direction):
    if not DIRECTION_ENABLED:
        return ""
    source = DIRECTION_SOURCES.get(direction) if isinstance(direction, str) else None
    return "修改光线方向为" + source + "；" + DIRECTION_SUFFIX if source else ""


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
        direction = _direction_prompt(state.get("direction")) if isinstance(state, dict) else ""
        if direction:
            prompt = prompt.rstrip("。；，,; ") + "，" + direction if prompt else direction
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
