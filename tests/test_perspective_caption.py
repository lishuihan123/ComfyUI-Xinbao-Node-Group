import importlib.util
import unittest
from pathlib import Path


path = Path(__file__).resolve().parents[1] / "perspective_caption.py"
spec = importlib.util.spec_from_file_location("perspective_caption", path)
caption = importlib.util.module_from_spec(spec)
spec.loader.exec_module(caption)


class PerspectiveCaptionTests(unittest.TestCase):
    def test_all_ui_combinations_produce_complete_instruction(self):
        for angle in (-90, -45, 0, 45, 90):
            for height in ("低", "中", "高", "顶"):
                for distance in ("中", "大"):
                    with self.subTest(angle=angle, height=height, distance=distance):
                        text = caption.build_caption(angle, height, distance)
                        self.assertTrue(text.startswith("Xinbao，"))
                        self.assertIn("场景中心", text)
                        self.assertIn("保持焦距不变" if distance == "大" else "焦距", text)

    def test_scene_direction_is_opposite_camera_motion(self):
        left = caption.build_caption(-45, "中", "中")
        right = caption.build_caption(90, "高", "中")
        self.assertIn("摄像机向右环绕45度", left)
        self.assertIn("场景呈现向左旋转45度", left)
        self.assertIn("摄像机向左环绕90度", right)
        self.assertIn("场景呈现向右旋转90度", right)


if __name__ == "__main__":
    unittest.main()
