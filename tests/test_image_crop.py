import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch

PLUGIN = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PLUGIN.parents[1]))
spec = importlib.util.spec_from_file_location("xinbao_crop_tests", PLUGIN / "__init__.py", submodule_search_locations=[str(PLUGIN)])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
from xinbao_crop_tests.image_crop import DEFAULT_CROP, XinbaoImageCrop, crop_frame, crop_settings, crop_size
from xinbao_crop_tests.image_standardizer import STANDARD_IMAGE_SIZES
from xinbao_crop_tests.color_panel import XinbaoColorPanel
import folder_paths


class CropTests(unittest.TestCase):
    def state(self, **kwargs):
        return crop_settings(json.dumps({**DEFAULT_CROP, **kwargs}))

    def test_default_and_linked_dimensions(self):
        self.assertEqual(crop_size(self.state()), (1024, 1024))
        for edge, pixels in (("long", 1024), ("width", 1024), ("short", 576), ("height", 576)):
            self.assertEqual(crop_size(self.state(ratio="16:9", edge=edge, pixels=pixels)), (1024, 576))
        self.assertEqual(crop_size(self.state(ratio="9:16")), (576, 1024))

    def test_all_ratios_align(self):
        for ratio, _, _, _ in STANDARD_IMAGE_SIZES["1K"]:
            for multiple in (8, 16, 32):
                for edge in ("width", "height", "long", "short"):
                    w, h = crop_size(self.state(ratio=ratio, multiple=multiple, edge=edge, pixels=1001))
                    self.assertEqual(w % multiple, 0)
                    self.assertEqual(h % multiple, 0)

    def test_custom_ratio(self):
        for edge, pixels in (("long", 1600), ("width", 1600), ("short", 1000), ("height", 1000)):
            state = self.state(ratio="custom", custom_width=8, custom_height=5, edge=edge, pixels=pixels, multiple=8)
            self.assertEqual(crop_size(state), (1600, 1000))
        self.assertEqual(crop_size(self.state(ratio="custom", custom_width=1, custom_height=2.5, multiple=16)), (416, 1024))
        for value in (0, -1, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                crop_size(self.state(ratio="custom", custom_width=value))

    def test_identity_and_move(self):
        frame = torch.zeros((32, 32, 3))
        frame[:, :16, 0] = 1
        frame[:, 16:, 2] = 1
        original = crop_frame(frame, self.state(), (32, 32))
        np.testing.assert_array_equal(original, frame.numpy())
        shifted = crop_frame(frame, self.state(x=0.5, background="#00ff00"), (32, 32))
        np.testing.assert_array_equal(shifted[16, 0], [0, 1, 0])
        np.testing.assert_array_equal(shifted[16, 20], [1, 0, 0])

    def test_zoom_padding_and_alpha(self):
        frame = torch.ones((32, 32, 3))
        output = crop_frame(frame, self.state(zoom=0.5, background="#123456"), (32, 32))
        np.testing.assert_allclose(output[0, 0], np.array([18, 52, 86]) / 255)
        np.testing.assert_array_equal(output[16, 16], [1, 1, 1])
        rgba = torch.ones((32, 32, 4)); rgba[..., 3] = 0
        alpha_out = crop_frame(rgba, self.state(background="#ff0000"), (32, 32))
        np.testing.assert_array_equal(alpha_out[16, 16], [1, 0, 0])

    def test_batch_and_preview(self):
        with tempfile.TemporaryDirectory() as temp:
            old = folder_paths.get_temp_directory()
            folder_paths.set_temp_directory(temp)
            try:
                state = self.state(pixels=32, zoom=0.5, locked=True)
                batch = torch.stack([torch.ones((16, 32, 3)), torch.zeros((16, 32, 3))])
                result = XinbaoImageCrop().crop(batch, json.dumps(state))
                self.assertEqual(tuple(result["result"][0].shape), (2, 32, 32, 3))
                self.assertEqual(result["result"][1:], (32, 32, 32, 32))
                self.assertTrue((Path(temp) / result["ui"]["crop_source"][0]["filename"]).is_file())
                np.testing.assert_array_equal(result["result"][0][0, 0, 0], [0, 0, 0])
            finally:
                folder_paths.set_temp_directory(old)

    def test_color_panel(self):
        for text, expected in (("#123456", "#123456"), ("abc", "#AABBCC"), (" #fff ", "#FFFFFF")):
            image, w, h, color = XinbaoColorPanel().create(80, 35, text)
            self.assertEqual(tuple(image.shape), (1, 35, 80, 3))
            self.assertEqual((w, h, color), (80, 35, expected))
            rgb = [int(expected[i:i+2], 16) / 255 for i in (1, 3, 5)]
            np.testing.assert_allclose(image[0, 10, 20], rgb)
        with self.assertRaisesRegex(ValueError, "HEX"):
            XinbaoColorPanel().create(80, 35, "#oops")

    def test_transparent_panel_ignores_color(self):
        image, w, h, color = XinbaoColorPanel().create(80, 35, "invalid but ignored", True)
        self.assertEqual(tuple(image.shape), (1, 35, 80, 4))
        self.assertEqual((w, h, color), (80, 35, "#00000000"))
        self.assertEqual(torch.count_nonzero(image).item(), 0)


if __name__ == "__main__":
    unittest.main()
