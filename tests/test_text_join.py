import importlib.util
from pathlib import Path
import unittest


PLUGIN = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("xinbao_text_join_tests", PLUGIN / "text_join.py")
text_join = importlib.util.module_from_spec(spec)
spec.loader.exec_module(text_join)


class TextJoinTests(unittest.TestCase):
    def test_joins_only_non_empty_inputs(self):
        node = text_join.XinbaoTextJoin()
        result = node.join_text("，", True, text_c=" 第三段 ", text_a="第一段", text_b="  ")
        self.assertEqual(result, ("第一段，第三段",))

    def test_literal_newline_delimiter(self):
        node = text_join.XinbaoTextJoin()
        self.assertEqual(node.join_text("\\n", True, text_a="A", text_b="B"), ("A\nB",))


if __name__ == "__main__":
    unittest.main()
