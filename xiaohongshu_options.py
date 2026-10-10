class XiaohongshuOptions:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "用途": (
                    ["小红书街拍裂变", "小红书首饰佩戴"],
                    {"default": "小红书街拍裂变"},
                ),
                "比例": (
                    ["9:16", "16:9", "1:1", "4:3", "3:4", "2:3", "3:2", "5:4", "4:5", "9:21"],
                    {"default": "9:16"},
                ),
                "数量": ("INT", {"default": 8, "min": 1, "max": 20, "step": 1}),
                "产品": ("STRING", {"default": ""}),
                "模特相似度": (
                    ["稍作改变", "完全一致"],
                    {"default": "稍作改变"},
                ),
                "特殊要求": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("user_prompt", "aspect_ratio", "model_id", "supp_prompt")
    FUNCTION = "generate"
    CATEGORY = "心宝♥节点组/提示词"

    def generate(self, 用途, 比例, 数量, 产品, 模特相似度, 特殊要求):
        if 用途 == "小红书街拍裂变":
            model_id = "xhs-json"
            supp_prompt = (
                "图1是我指定的人物模特跟服装穿戴，必须保持人物跟服装的一致性，"
                "场景，姿势，人物的表情，镜头的角度，参考上面的文案进行生成。"
                "场景必须做出改变，严禁跟原图一模一样的场景，场景相似程度最多50%，"
                "生成的构图，镜头必须有高级的感觉，符合小红书的视觉规范，能够吸引人。"
            )
            if 特殊要求.strip():
                user_prompt = f"生成{数量}屏图片，强制要求：【{特殊要求.strip()}】"
            else:
                user_prompt = f"生成{数量}屏图片"
        else:
            model_id = "xhszb-json"
            if 模特相似度 == "稍作改变":
                supp_prompt = (
                    "图2仅是参考模特把相似度控制在70%左右，去除人物ai感油光感，"
                    "人物如实拍一样细腻。"
                )
            else:
                supp_prompt = (
                    "图2是我要指定使用的模特，必须保持人物五官特征脸型发型的一致性，"
                    "去除人物ai感油光感，人物如实拍一样细腻。"
                )

            user_prompt = f"生成{数量}屏图片，产品为{产品}，{supp_prompt}"
            if 特殊要求.strip():
                user_prompt += f"，强制要求：【{特殊要求.strip()}】"

        return (user_prompt.strip(), 比例, model_id, supp_prompt)


NODE_CLASS_MAPPINGS = {"XiaohongshuOptions": XiaohongshuOptions}
NODE_DISPLAY_NAME_MAPPINGS = {"XiaohongshuOptions": "心宝♥小红书选项"}
