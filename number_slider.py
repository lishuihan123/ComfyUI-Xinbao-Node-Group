from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def slider_value(start, end, step, value):
    try:
        numbers = [Decimal(str(item)) for item in (start, end, step, value)]
        if not all(item.is_finite() for item in numbers):
            raise ValueError("滑条参数必须是有限数值。")
        start, end, step, value = [item.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP) for item in numbers]
    except InvalidOperation as exc:
        raise ValueError("滑条参数必须是有效数值。") from exc
    if start > end:
        raise ValueError("起始值不能大于结束值。")
    if step <= 0:
        raise ValueError("步长至少为 0.000001。")
    value = min(end, max(start, value))
    # Keep the end reachable even when the range is not a multiple of the step.
    if value != end:
        index = ((value - start) / step).to_integral_value(rounding=ROUND_HALF_UP)
        value = min(end, start + index * step)
    return float(value), int(value.to_integral_value(rounding=ROUND_HALF_UP))


class XinbaoNumberSlider:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "start": ("FLOAT", {"default": 0.0, "min": -1e9, "max": 1e9, "step": 0.1, "round": 0.000001, "tooltip": "滑条起始值，支持负数与小数"}),
            "end": ("FLOAT", {"default": 1.0, "min": -1e9, "max": 1e9, "step": 0.1, "round": 0.000001, "tooltip": "滑条结束值，不能小于起始值"}),
            "step": ("FLOAT", {"default": 0.01, "min": 0.000001, "max": 1e9, "step": 0.01, "round": 0.000001, "tooltip": "每步增加或减少的数值，最多6位小数；最后一步不足步长时到达结束值"}),
            "value": ("FLOAT", {"default": 0.5, "min": -1e9, "max": 1e9, "step": 0.01, "round": 0.000001}),
        }}

    RETURN_TYPES = ("FLOAT", "INT")
    RETURN_NAMES = ("浮点", "整数")
    OUTPUT_TOOLTIPS = ("按设置的步长输出浮点数", "将当前数值四舍五入为整数，负数半值向远离零方向取整")
    FUNCTION = "output"
    CATEGORY = "心宝♥节点组"
    DESCRIPTION = "自定义起始值、结束值和步长的数值滑条；选择浮点或整数输出口连接。支持拖动及直接输入数值。"

    def output(self, start, end, step, value):
        return slider_value(start, end, step, value)


NODE_CLASS_MAPPINGS = {"XinbaoNumberSlider": XinbaoNumberSlider}
NODE_DISPLAY_NAME_MAPPINGS = {"XinbaoNumberSlider": "心宝♥数值滑条"}
