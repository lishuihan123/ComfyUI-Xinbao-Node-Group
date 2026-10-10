import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

import torch


PLUGIN = Path(__file__).resolve().parents[1]
COMFY_ROOT = PLUGIN.parents[1] / "ComfyUI"
sys.path.insert(0, str(COMFY_ROOT))

PACKAGE_NAME = "xinbao_migration_tests"
spec = importlib.util.spec_from_file_location(
    PACKAGE_NAME,
    PLUGIN / "__init__.py",
    submodule_search_locations=[str(PLUGIN)],
)
module = importlib.util.module_from_spec(spec)
sys.modules[PACKAGE_NAME] = module
spec.loader.exec_module(module)

from xinbao_migration_tests.local_image_tools import XinbaoImageSplitter, XinbaoSmartGrid
from xinbao_migration_tests.snippet_manager import SnippetManager
from xinbao_migration_tests.xinbao_psd_tool import XinbaoBatchToPSD
from xinbao_migration_tests.xiaohongshu_options import XiaohongshuOptions


MIGRATED_IDS = {
    "XinbaoPromptAssistantNode",
    "XinbaoBatchToPSD",
    "XinbaoLayerSelect",
    "XinbaoSmartGrid",
    "XinbaoLoadImageClean",
    "XinbaoImageSplitter",
    "LayerMask: SegmentAnythingUltra Li",
}


class MigratedNodeTests(unittest.TestCase):
    def test_registration_boundary(self):
        self.assertTrue(MIGRATED_IDS.issubset(module.NODE_CLASS_MAPPINGS))
        self.assertNotIn("LayerMask: MaskBoundingBoxAligned", module.NODE_CLASS_MAPPINGS)
        self.assertIn("XiaohongshuOptions", module.NODE_CLASS_MAPPINGS)
        self.assertEqual(
            module.NODE_DISPLAY_NAME_MAPPINGS["XiaohongshuOptions"],
            "心宝♥小红书选项",
        )

    def test_xiaohongshu_options(self):
        node = XiaohongshuOptions()
        street = node.generate("小红书街拍裂变", "9:16", 8, "", "稍作改变", "夜景")
        self.assertEqual(street[0], "生成8屏图片，强制要求：【夜景】")
        self.assertEqual(street[1:3], ("9:16", "xhs-json"))

        jewelry = node.generate("小红书首饰佩戴", "1:1", 4, "项链", "完全一致", "")
        self.assertIn("生成4屏图片，产品为项链", jewelry[0])
        self.assertEqual(jewelry[1:3], ("1:1", "xhszb-json"))
        self.assertIn("必须保持人物五官特征脸型发型的一致性", jewelry[3])

    def test_smart_grid_and_splitter(self):
        first = torch.ones((1, 80, 128, 3), dtype=torch.float32)
        second = torch.zeros((1, 40, 80, 3), dtype=torch.float32)
        merged, = XinbaoSmartGrid().smart_merge(first, second)
        self.assertEqual(tuple(merged.shape), (1, 144, 128, 3))

        grid = torch.arange(90 * 90 * 3, dtype=torch.float32).reshape(1, 90, 90, 3)
        cells, = XinbaoImageSplitter().split_image(grid, "九宫格 (3x3)")
        self.assertEqual(tuple(cells.shape), (9, 30, 30, 3))

    def test_snippet_storage_uses_node_group_file(self):
        with tempfile.TemporaryDirectory() as temp:
            manager = SnippetManager()
            manager.file_path = str(Path(temp) / "snippets.toml")
            manager._cache = []
            manager._last_mtime = 0
            manager._allow_overwrite_without_toml = True
            created = manager.add_snippet("test prompt", "test", "#ffffff")
            self.assertEqual(created["content"], "test prompt")
            self.assertTrue(Path(manager.file_path).is_file())

    def test_psd_writer(self):
        with tempfile.TemporaryDirectory() as temp:
            node = XinbaoBatchToPSD()
            node.output_dir = temp
            images = torch.stack([
                torch.ones((8, 8, 3), dtype=torch.float32),
                torch.zeros((8, 8, 3), dtype=torch.float32),
            ])
            result = node.write_psd(images, "migration_test")
            output = Path(result["result"][0])
            self.assertTrue(output.is_file())
            self.assertEqual(output.suffix.lower(), ".psd")


if __name__ == "__main__":
    unittest.main()
