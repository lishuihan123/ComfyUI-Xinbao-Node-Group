import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('runtime_test_subject', ROOT / 'lora_runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


@unittest.skipUnless(sys.platform == 'win32', 'Windows runtime')
class RuntimeSetupTests(unittest.TestCase):
    def test_existing_working_environment_is_not_installed_over(self):
        with patch.object(runtime, '_probe'), patch.object(runtime, '_prepare_bundled') as prepare:
            self.assertEqual(runtime.ensure_runtime(), 'existing')
            prepare.assert_not_called()

    def test_missing_runtime_does_not_reject_unrelated_existing_dependency(self):
        fake = object()
        with patch.dict(sys.modules, {'cffi': fake}), patch.object(runtime, '_probe', side_effect=[ImportError('absent'), None]), patch.object(runtime, '_prepare_bundled', return_value=Path('unused-runtime')):
            # Isolate only the simulated failed import; do not disturb real packages.
            with patch.dict(sys.modules, {k:v for k,v in sys.modules.items() if not k.startswith('cryptography')}, clear=True):
                original = sys.path[:]
                try:
                    self.assertEqual(runtime.ensure_runtime(), 'bundled')
                    self.assertIs(sys.modules['cffi'], fake)
                finally:
                    sys.path[:] = original

    def test_in_use_broken_runtime_is_not_replaced(self):
        with patch.dict(sys.modules, {'cryptography': object()}), patch.object(runtime, '_probe', side_effect=ImportError('broken')), patch.object(runtime, '_prepare_bundled') as prepare:
            with self.assertRaisesRegex(RuntimeError, '重启'):
                runtime.ensure_runtime()
            prepare.assert_not_called()

    def test_unsupported_environment_has_readable_error(self):
        with patch.object(runtime.sys, 'platform', 'linux'):
            with self.assertRaisesRegex(RuntimeError, 'Windows'):
                runtime._environment_tag()
        with patch.object(runtime.sysconfig, 'get_config_var', return_value=1):
            with self.assertRaisesRegex(RuntimeError, '自由线程'):
                runtime._environment_tag()

    def test_corrupted_archive_rejected_before_extract(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            wheel = root / 'runtime/wheels/test.whl'
            wheel.parent.mkdir(parents=True)
            wheel.write_bytes(b'broken')
            (root / 'runtime/manifest.json').write_text(json.dumps({'windows_x64': {'cp312': [{'file':'test.whl', 'sha256':'0'*64}]}}))
            with self.assertRaisesRegex(RuntimeError, '不完整'):
                runtime._prepare_bundled('cp312', root)
            self.assertFalse(list((root / '_runtime').rglob('ready.json')))

    def test_archive_cannot_write_outside_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for bad in ('../escape.py', '/escape.py', 'C:/escape.py', '..\\escape.py'):
                wheel = root / 'bad.whl'
                with zipfile.ZipFile(wheel, 'w') as archive:
                    archive.writestr(bad, b'bad')
                with self.assertRaisesRegex(RuntimeError, '路径无效'):
                    runtime._extract_wheel(wheel, root / 'target')
            self.assertFalse((root / 'escape.py').exists())

    def test_parallel_first_start_produces_complete_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            wheel = root / 'runtime/wheels/test.whl'
            wheel.parent.mkdir(parents=True)
            with zipfile.ZipFile(wheel, 'w') as archive:
                archive.writestr('example/data.bin', b'x' * 1000000)
            (root / 'runtime/manifest.json').write_text(json.dumps({'windows_x64': {'cp312': [{'file':'test.whl','sha256':hashlib.sha256(wheel.read_bytes()).hexdigest()}]}}))
            code = ('import importlib.util;from pathlib import Path;'
                    f's=importlib.util.spec_from_file_location("rt",{str(ROOT / "lora_runtime.py")!r});'
                    'm=importlib.util.module_from_spec(s);s.loader.exec_module(m);'
                    f'm._prepare_bundled("cp312",Path({str(root)!r}))')
            processes = [subprocess.Popen([sys.executable, '-c', code], stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(4)]
            for proc in processes:
                _, error = proc.communicate(timeout=60)
                self.assertEqual(proc.returncode, 0, error.decode(errors='replace'))
            markers = list((root / '_runtime').rglob('ready.json'))
            self.assertEqual(len(markers), 1)
            self.assertEqual((markers[0].parent / 'example/data.bin').read_bytes(), b'x' * 1000000)

    def test_runtime_failure_preserves_saved_node_interface(self):
        node = runtime.unavailable_lora_node('test reason')
        self.assertEqual(node.RETURN_TYPES, ('MODEL',))
        self.assertEqual(node.FUNCTION, 'load_lora')
        with self.assertRaisesRegex(RuntimeError, 'test reason'):
            node().load_lora(None, 'sample', 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
