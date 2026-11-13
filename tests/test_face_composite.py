import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = '_xinbao_face_test'
pkg = types.ModuleType(PACKAGE)
pkg.__path__ = [str(ROOT)]
sys.modules[PACKAGE] = pkg
folder_paths = types.ModuleType('folder_paths')
folder_paths.models_dir = ''
with patch.dict(sys.modules, {'folder_paths': folder_paths}):
    spec = importlib.util.spec_from_file_location(PACKAGE + '.face_composite', ROOT / 'face_composite.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)


class FaceCompositeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        folder_paths.models_dir = self.temp.name
        pose = Path(self.temp.name) / 'pose'
        pose.mkdir()
        for name in (module.DETECTOR_FILE, module.POSE_FILE):
            (pose / name).touch()
        theta = np.linspace(0, np.pi, 17)
        self.contour = np.column_stack([32 + 12 * np.cos(theta), 25 + 14 * np.sin(theta)])
        self.base = torch.linspace(0, 1, 64 * 64 * 3).reshape(1, 64, 64, 3)
        self.head = torch.full_like(self.base, .7)
        self.mask = torch.zeros(1, 64, 64)
        self.mask[:, 18:43, 18:45] = 1

    def run_composite(self, head, **kwargs):
        fake = types.ModuleType('rtmlib')
        fake.Wholebody = lambda **kw: object()
        with patch.dict(sys.modules, {'rtmlib': fake}), patch.object(
            module, 'detect_contour', side_effect=[(self.contour, {}), (self.contour, {})]
        ):
            return module.XinbaoFaceContourCompositeV2().composite(self.base, head, self.mask, **kwargs)

    def test_scale_and_translation_only_affect_masked_layer(self):
        original = self.base.clone()
        result, alpha, _, report = self.run_composite(self.head, face_scale_percent=-20, offset_x=5, offset_y=-3)
        self.assertTrue(torch.equal(self.base, original))
        self.assertTrue(torch.equal(result[alpha == 0], self.base[alpha == 0]))
        m = np.asarray(json.loads(report)[0]['仿射矩阵'])
        center = (self.contour.min(0) + self.contour.max(0)) / 2
        np.testing.assert_allclose(m[:, :2], np.eye(2) * .8, atol=1e-6)
        np.testing.assert_allclose(m[:, :2] @ center + m[:, 2], center + [5, -3], atol=1e-5)

    def test_unmasked_source_pixels_cannot_leak(self):
        altered = self.head.clone()
        altered[self.mask == 0] = 1
        a = self.run_composite(self.head, face_scale_percent=13, offset_x=1)[0]
        b = self.run_composite(altered, face_scale_percent=13, offset_x=1)[0]
        self.assertTrue(torch.equal(a, b))

    def test_internal_landmarks_do_not_change_contour(self):
        detect_contour = module.detect_contour
        points = np.zeros((1, 133, 2))
        points[0, 23:40] = self.contour
        scores = np.ones((1, 133))
        rgb = np.zeros((64, 64, 3), dtype=np.uint8)
        a, _ = detect_contour(lambda image: (points.copy(), scores), rgb)
        points[0, 40:91] = 999
        b, _ = detect_contour(lambda image: (points.copy(), scores), rgb)
        np.testing.assert_array_equal(a, b)


if __name__ == '__main__':
    unittest.main()
