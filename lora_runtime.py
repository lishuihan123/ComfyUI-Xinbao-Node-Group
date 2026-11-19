"""Prepare the bundled Windows runtime without changing ComfyUI's packages."""
from contextlib import contextmanager
import hashlib
import importlib
import importlib.util
import json
import logging
import os
from pathlib import Path, PurePosixPath
import struct
import sys
import sysconfig
import threading
import time
import zipfile

_ROOT = Path(__file__).resolve().parent
_LOCK = threading.Lock()
_PREFIXES = ('cryptography', 'cffi', '_cffi_backend', 'pycparser')


def _environment_tag():
    if sys.platform != 'win32' or sys.implementation.name != 'cpython':
        raise RuntimeError('此版本的 LoRA 加载组件支持 Windows CPython 环境。')
    if struct.calcsize('P') != 8 or sysconfig.get_platform() != 'win-amd64':
        raise RuntimeError('请使用 Windows x64 版 Python 和 ComfyUI。')
    if sys.version_info < (3, 10) or sysconfig.get_config_var('Py_GIL_DISABLED'):
        raise RuntimeError('请使用标准版 CPython 3.10–3.14；暂不支持自由线程版本。')
    return f'cp{sys.version_info.major}{sys.version_info.minor}'


def _probe():
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=b'runtime-check', info=b'check').derive(b'local-check')
    engine = AESGCM(key)
    nonce = bytes(12)
    assert engine.decrypt(nonce, engine.encrypt(nonce, b'check', None), None) == b'check'


@contextmanager
def _process_lock(path, timeout=45):
    import msvcrt
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        if handle.tell() == 0:
            handle.write(b'0')
            handle.flush()
        until = time.monotonic() + timeout
        while True:
            try:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                break
            except OSError:
                if time.monotonic() >= until:
                    raise RuntimeError('运行组件正在准备中，请稍后重启 ComfyUI。') from None
                time.sleep(0.1)
        try:
            yield
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def _extract_wheel(wheel, target):
    with zipfile.ZipFile(wheel) as archive:
        for info in archive.infolist():
            part = PurePosixPath(info.filename)
            if part.is_absolute() or '..' in part.parts or '\\' in info.filename or ':' in info.filename:
                raise RuntimeError('运行组件包路径无效，请重新下载完整节点包。')
            if info.is_dir():
                continue
            pieces = part.parts
            if pieces and pieces[0].endswith('.data'):
                if len(pieces) < 3 or pieces[1] not in ('purelib', 'platlib'):
                    continue
                pieces = pieces[2:]
            output = target.joinpath(*pieces)
            if not output.resolve().is_relative_to(target.resolve()):
                raise RuntimeError('运行组件包路径无效。')
            output.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, output.open('wb') as dest:
                import shutil
                shutil.copyfileobj(source, dest)


def _prepare_bundled(tag, root=_ROOT):
    manifest_bytes = (root / 'runtime' / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    wheels = manifest['windows_x64'].get(tag)
    if not wheels:
        raise RuntimeError('此 Python 版本暂无随包运行组件，请使用标准版 CPython 3.10–3.14。')
    revision = hashlib.sha256(manifest_bytes).hexdigest()[:16]
    cache = root / '_runtime' / f'{tag}-{revision}'
    with _process_lock(root / '_runtime' / f'{tag}.lock'):
        marker = cache / 'ready.json'
        if not marker.is_file():
            # Validate every archive before writing any package files.
            verified = []
            for entry in wheels:
                name = entry['file']
                if Path(name).name != name:
                    raise RuntimeError('运行组件清单无效。')
                wheel = root / 'runtime' / 'wheels' / name
                if hashlib.sha256(wheel.read_bytes()).hexdigest() != entry['sha256']:
                    raise RuntimeError('运行组件文件不完整，请重新下载完整节点包。')
                verified.append(wheel)
            cache.mkdir(parents=True, exist_ok=True)
            for wheel in verified:
                _extract_wheel(wheel, cache)
            temporary = cache / 'ready.tmp'
            temporary.write_text(json.dumps({'revision': revision, 'python': tag}), encoding='utf-8')
            os.replace(temporary, marker)
    return cache


def ensure_runtime():
    tag = _environment_tag()
    with _LOCK:
        before = set(sys.modules)
        try:
            _probe()
            return 'existing'
        except (ImportError, OSError, AttributeError, AssertionError, ValueError):
            # Never replace a package already in use by another node.
            active = [name for name in before if name.split('.')[0] == 'cryptography']
            if active:
                raise RuntimeError('现有运行组件无法正常工作，请重启 ComfyUI 后重试，或在独立整合包中使用。') from None
            for name in set(sys.modules) - before:
                if name.split('.')[0] in _PREFIXES:
                    sys.modules.pop(name, None)
        try:
            cache = _prepare_bundled(tag)
            sys.path.insert(0, str(cache))
            importlib.invalidate_caches()
            _probe()
        except Exception as exc:
            raise RuntimeError('LoRA 运行组件准备失败，请确认节点包完整且文件夹可写。' + str(exc)) from None
        logging.info('[心宝节点组] LoRA 运行组件已就绪。')
        return 'bundled'


def load_lora_module(module_name):
    ensure_runtime()
    binary = _ROOT / 'xinbao_lora_loader.pyd'
    spec = importlib.util.spec_from_file_location(module_name, binary)
    if spec is None or spec.loader is None:
        raise RuntimeError('LoRA 加载组件缺失，请重新下载完整节点包。')
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(module_name, None)
        raise
    return module


def unavailable_lora_node(reason):
    """Keep saved graphs readable when this one optional runtime is unavailable."""
    class XinbaoLoraLoaderUnavailable:
        @classmethod
        def INPUT_TYPES(cls):
            import folder_paths
            return {'required': {'model': ('MODEL',), 'lora_name': (folder_paths.get_filename_list('loras'),),
                                 'lora_strength': ('FLOAT', {'default': 1.0, 'min': 0.0, 'max': 2.0, 'step': 0.1, 'display': 'slider'})},
                    'optional': {'lora_stack': ('STRING', {'default': '[]'})}}
        RETURN_TYPES = ('MODEL',)
        RETURN_NAMES = ('模型',)
        FUNCTION = 'load_lora'
        CATEGORY = '心宝♥节点组'
        DESCRIPTION = '批量加载 LoRA，并分别调整权重。'
        def load_lora(self, *args, **kwargs):
            raise RuntimeError('心宝 LoRA 加载暂不可用：' + reason)
    return XinbaoLoraLoaderUnavailable
