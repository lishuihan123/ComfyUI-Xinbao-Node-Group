class XinbaoTextJoin:
    @classmethod
    def INPUT_TYPES(cls):
        text_input = ("*", {"forceInput": True})
        return {
            "required": {
                "delimiter": ("STRING", {"default": ", "}),
                "clean_whitespace": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "text_a": text_input,
                "text_b": text_input,
                "text_c": text_input,
                "text_d": text_input,
                "text_e": text_input,
                "text_f": text_input,
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("文本",)
    FUNCTION = "join_text"
    CATEGORY = "心宝♥节点组"
    DESCRIPTION = "联结已启用的文本输入；上游节点或分组停用时，会自动忽略失效的可选连接。"

    def join_text(self, delimiter=", ", clean_whitespace=True, **texts):
        delimiter = "\n" if delimiter in ("\n", "\\n") else delimiter
        values = []
        for name in sorted(texts):
            value = texts[name]
            if not isinstance(value, str):
                continue
            if clean_whitespace:
                value = value.strip()
            if value:
                values.append(value)
        return (delimiter.join(values),)


NODE_CLASS_MAPPINGS = {
    "XinbaoTextJoin": XinbaoTextJoin,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XinbaoTextJoin": "心宝♥文本联结",
}
