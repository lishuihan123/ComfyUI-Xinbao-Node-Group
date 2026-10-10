import importlib.util
import json
from pathlib import Path
import sys
import unittest
import tempfile
from unittest import mock

import torch

PLUGIN = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PLUGIN.parents[1]))
spec = importlib.util.spec_from_file_location("pintu_test_module", PLUGIN / "pintu_nodes.py")
pintu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pintu)


class PintuAlphaTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        patcher = mock.patch.object(pintu.folder_paths, "get_temp_directory", return_value=temp.name)
        patcher.start()
        self.addCleanup(patcher.stop)

    def compose(self, background, product, rotation=0, background_ref=""):
        return pintu.XinbaoPintu().compose(
            background, product, 0, 50,
            json.dumps({"x": 0.5, "y": 0.5, "scale": 0.5, "rotation": rotation}),
            False, background_ref, "", "",
        )["result"]

    def test_transparent_output_and_soft_mask(self):
        product = torch.ones((1, 16, 16, 4))
        product[..., 3] = 128 / 255
        result, mask = self.compose(torch.zeros((1, 32, 32, 4)), product)
        self.assertEqual(tuple(result.shape), (1, 32, 32, 4))
        self.assertAlmostEqual(result[0, 16, 16, 3].item(), 128 / 255)
        self.assertEqual(result[0, 0, 0, 3].item(), 0)
        torch.testing.assert_close(mask, result[..., 3])
        self.assertTrue(torch.any((mask > 0) & (mask < 1)))

    def test_opaque_output_remains_rgb(self):
        product = torch.ones((1, 16, 16, 4)); product[..., 3] = 128 / 255
        result, mask = self.compose(torch.zeros((1, 32, 32, 3)), product)
        self.assertEqual(tuple(result.shape), (1, 32, 32, 3))
        torch.testing.assert_close(result[0, 16, 16], torch.full((3,), 128 / 255))
        self.assertAlmostEqual(mask[0, 16, 16].item(), 128 / 255)

    def test_rotation_keeps_soft_edges(self):
        product = torch.zeros((1, 16, 16, 4)); product[:, 2:14, 2:14] = 1
        result, mask = self.compose(torch.zeros((1, 32, 32, 4)), product, rotation=23)
        torch.testing.assert_close(mask, result[..., 3])
        self.assertTrue(torch.any((mask > 0) & (mask < 1)))

    def test_color_panel_ref_uses_connected_tensor(self):
        background = torch.zeros((1, 32, 32, 4))
        product = torch.ones((1, 16, 16, 4))
        expected, _ = self.compose(background, product)
        result, _ = self.compose(background, product, background_ref=json.dumps({
            "kind": "xinbao_color", "width": 32, "height": 32,
            "color": "#123456", "transparent": True,
        }))
        torch.testing.assert_close(result, expected)

    def test_unopened_editor_auto_fits_and_returns_input_previews(self):
        # Portrait canvas + square product should fill width and center vertically.
        background = torch.zeros((1, 96, 64, 3))
        product = torch.ones((1, 20, 20, 3))
        response = pintu.XinbaoPintu().compose(background, product, 0, 100,
            json.dumps(pintu.DEFAULT_TRANSFORM), False, "", "", "")
        output, mask = response["result"]
        self.assertEqual(tuple(output.shape), (1, 96, 64, 3))
        self.assertTrue(torch.all(mask[0, 16:80] == 1))
        self.assertTrue(torch.all(mask[0, :16] == 0))
        preview = response["ui"]["xinbao_pintu"][0]
        self.assertEqual(preview["transform"]["scale"], 1)
        for name in ["background", "product"]:
            ref = preview[name]
            self.assertTrue((Path(pintu.folder_paths.get_temp_directory()) / ref["filename"]).is_file())

    def test_auto_fit_tall_product_and_manual_transform_preserved(self):
        background = torch.zeros((1, 40, 80, 3))
        product = torch.ones((1, 40, 20, 3))
        node = pintu.XinbaoPintu()
        response = node.compose(background, product, 0, 100, "", False, "", "", "")
        self.assertEqual(response["ui"]["xinbao_pintu"][0]["transform"]["scale"], 0.25)
        manual = {"x": 0.3, "y": 0.4, "scale": 0.15, "rotation": 12}
        response = node.compose(background, product, 0, 100, json.dumps(manual), True, "", "", "")
        actual = response["ui"]["xinbao_pintu"][0]["transform"]
        for key, value in manual.items():
            self.assertEqual(actual[key], value)

    def test_old_untouched_default_auto_fits_without_refs(self):
        response = pintu.XinbaoPintu().compose(torch.zeros((1, 32, 32, 3)),
            torch.ones((1, 8, 8, 3)), 0, 100,
            '{"x":0.5,"y":0.5,"scale":0.35,"rotation":0}', False, "", "", "")
        self.assertEqual(response["ui"]["xinbao_pintu"][0]["transform"]["scale"], 1)

    def test_product_ref_keeps_alpha_but_never_replaces_different_input(self):
        original = pintu.Image.new("RGBA", (8, 8), (255, 255, 255, 128))
        ref = json.dumps(pintu._save_editor_preview(original, "test"))
        matched = pintu._image_from_tensor_or_ref(torch.ones((1, 8, 8, 3)), ref)
        self.assertEqual(matched.getpixel((0, 0)), (255, 255, 255, 128))
        changed = pintu._image_from_tensor_or_ref(torch.zeros((1, 8, 8, 3)), ref)
        self.assertEqual(changed.getpixel((0, 0)), (0, 0, 0, 255))

    def test_legacy_42_percent_with_saved_product_ref_is_migrated(self):
        original = pintu.Image.new("RGB", (16, 16), "white")
        ref = json.dumps(pintu._save_editor_preview(original, "legacy"))
        response = pintu.XinbaoPintu().compose(torch.zeros((1, 96, 64, 3)),
            torch.ones((1, 16, 16, 3)), 0, 100,
            '{"x":0.5,"y":0.5,"scale":0.42,"rotation":0}', False, "", ref, "")
        state = response["ui"]["xinbao_pintu"][0]["transform"]
        self.assertEqual(state, {"x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "auto_fit": True, "user_edited": False})
        mask = response["result"][1]
        self.assertTrue(torch.all(mask[0, 16:80] == 1))

    def test_legacy_tall_fit_and_manual_exceptions(self):
        for state, locked, expected in [
            ({"x": .5, "y": .5, "scale": .105, "rotation": 0}, False, .25),
            ({"x": .5, "y": .5, "scale": .105, "rotation": 0}, True, .105),
            ({"x": .5, "y": .5, "scale": .105, "rotation": 0, "auto_fit": False}, False, .25),
            ({"x": .5, "y": .5, "scale": .105, "rotation": 0, "auto_fit": False, "user_edited": True}, False, .105),
            ({"x": .3, "y": .5, "scale": .105, "rotation": 0}, False, .105),
        ]:
            with self.subTest(state=state, locked=locked):
                response = pintu.XinbaoPintu().compose(torch.zeros((1, 40, 80, 3)),
                    torch.ones((1, 40, 20, 3)), 0, 100, json.dumps(state), locked, "", "", "")
                self.assertEqual(response["ui"]["xinbao_pintu"][0]["transform"]["scale"], expected)


if __name__ == "__main__":
    unittest.main()
