from __future__ import annotations

import json
import os
import threading
import uuid
from pathlib import Path

from aiohttp import web


try:
    from server import PromptServer
except ImportError:
    class _DummyPromptServer:
        instance = None

    PromptServer = _DummyPromptServer()


class CustomTagManager:
    def __init__(self, file_path: Path | None = None):
        self.file_path = file_path or Path(__file__).with_name("custom_tags.json")
        self.lock = threading.RLock()
        self._mtime_ns = -1
        self._cache = {"groups": [], "tags": []}
        self._reload_if_needed()

    def _current_mtime_ns(self) -> int:
        try:
            return self.file_path.stat().st_mtime_ns
        except FileNotFoundError:
            return 0

    @staticmethod
    def _normalize(data: dict, *, strict: bool) -> dict:
        if not isinstance(data, dict):
            if strict:
                raise ValueError("标签配置格式无效。")
            return {"groups": [], "tags": []}

        raw_groups = data.get("groups", [])
        raw_tags = data.get("tags", [])
        if not isinstance(raw_groups, list) or not isinstance(raw_tags, list):
            if strict:
                raise ValueError("分组和标签必须是列表。")
            return {"groups": [], "tags": []}

        groups = []
        group_ids = set()
        group_names = set()
        for item in raw_groups:
            if not isinstance(item, dict):
                if strict:
                    raise ValueError("分组格式无效。")
                continue
            group_id = str(item.get("id") or uuid.uuid4())
            name = str(item.get("name") or "").strip()
            if not name:
                if strict:
                    raise ValueError("分组名称不能为空。")
                continue
            if group_id in group_ids or name in group_names:
                if strict:
                    raise ValueError("分组名称和 ID 不能重复。")
                continue
            group_ids.add(group_id)
            group_names.add(name)
            groups.append({"id": group_id, "name": name})

        tags = []
        tag_ids = set()
        for item in raw_tags:
            if not isinstance(item, dict):
                if strict:
                    raise ValueError("标签格式无效。")
                continue
            tag_id = str(item.get("id") or uuid.uuid4())
            group_id = str(item.get("group_id") or "")
            name = str(item.get("name") or "").strip()
            prompt = str(item.get("prompt") or "").strip()
            if group_id not in group_ids:
                if strict:
                    raise ValueError(f"标签“{name or tag_id}”没有有效分组。")
                continue
            if not name or not prompt:
                if strict:
                    raise ValueError("标签名和真实提示词不能为空。")
                continue
            if tag_id in tag_ids:
                if strict:
                    raise ValueError("标签 ID 不能重复。")
                continue
            tag_ids.add(tag_id)
            tags.append({"id": tag_id, "group_id": group_id, "name": name, "prompt": prompt})

        return {"groups": groups, "tags": tags}

    def _reload_if_needed(self):
        mtime_ns = self._current_mtime_ns()
        if mtime_ns == self._mtime_ns:
            return
        if not self.file_path.is_file():
            self._cache = {"groups": [], "tags": []}
            self._mtime_ns = 0
            return
        try:
            data = json.loads(self.file_path.read_text(encoding="utf-8"))
            self._cache = self._normalize(data, strict=False)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            print(f"[心宝♥自定标签] 读取配置失败：{exc}")
            self._cache = {"groups": [], "tags": []}
        self._mtime_ns = mtime_ns

    def get_config(self) -> dict:
        with self.lock:
            self._reload_if_needed()
            return json.loads(json.dumps(self._cache, ensure_ascii=False))

    def replace_config(self, data: dict) -> dict:
        normalized = self._normalize(data, strict=True)
        with self.lock:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = self.file_path.with_suffix(self.file_path.suffix + ".tmp")
            temp_path.write_text(
                json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            os.replace(temp_path, self.file_path)
            self._cache = normalized
            self._mtime_ns = self._current_mtime_ns()
            return self.get_config()

    def prompts_for(self, selected_ids: list[str]) -> list[str]:
        config = self.get_config()
        selected = set(selected_ids)
        group_order = {group["id"]: index for index, group in enumerate(config["groups"])}
        ordered_tags = sorted(
            enumerate(config["tags"]),
            key=lambda item: (group_order.get(item[1]["group_id"], len(group_order)), item[0]),
        )
        return [tag["prompt"] for _, tag in ordered_tags if tag["id"] in selected]

    def version_token(self) -> str:
        with self.lock:
            self._reload_if_needed()
            try:
                stat = self.file_path.stat()
                return f"{stat.st_mtime_ns}:{stat.st_size}"
            except FileNotFoundError:
                return "0:0"


def _parse_selection(raw: str) -> list[str]:
    try:
        parsed = json.loads(raw or "[]")
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    selected = []
    seen = set()
    for item in parsed:
        tag_id = str(item)
        if tag_id and tag_id not in seen:
            selected.append(tag_id)
            seen.add(tag_id)
    return selected


def _join_prompts(prompts: list[str]) -> str:
    cleaned = [prompt.strip().rstrip("，,；;。 ") for prompt in prompts if prompt.strip()]
    return "，".join(cleaned) + ("。" if cleaned else "")


CUSTOM_TAG_MANAGER = CustomTagManager()
_ROUTE_REGISTERED = False
_ROUTE_TIMER: threading.Timer | None = None


def _ensure_api_routes(prompt_server_provider):
    global _ROUTE_REGISTERED, _ROUTE_TIMER
    if _ROUTE_REGISTERED:
        return
    prompt_server = prompt_server_provider()
    if prompt_server is None:
        if _ROUTE_TIMER is None or not _ROUTE_TIMER.is_alive() or threading.current_thread() is _ROUTE_TIMER:
            timer = threading.Timer(1.0, lambda: _ensure_api_routes(prompt_server_provider))
            timer.daemon = True
            _ROUTE_TIMER = timer
            timer.start()
        return

    @prompt_server.routes.get("/xinbao-node-group/custom-tags")
    async def get_custom_tags(request):
        return web.json_response({"success": True, "data": CUSTOM_TAG_MANAGER.get_config()})

    @prompt_server.routes.put("/xinbao-node-group/custom-tags")
    async def save_custom_tags(request):
        try:
            data = await request.json()
            saved = CUSTOM_TAG_MANAGER.replace_config(data)
            return web.json_response({"success": True, "data": saved})
        except ValueError as exc:
            return web.json_response({"success": False, "message": str(exc)}, status=400)
        except Exception as exc:
            return web.json_response({"success": False, "message": str(exc)}, status=500)

    _ROUTE_REGISTERED = True


_ensure_api_routes(lambda: getattr(PromptServer, "instance", None))


class XinbaoCustomTagSelector:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected_tags": (
                    "STRING",
                    {
                        "default": "[]",
                        "multiline": False,
                        "tooltip": "由节点内的标签按钮自动维护。",
                    },
                )
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("文本",)
    OUTPUT_TOOLTIPS = ("按分组顺序拼接所有已选标签的真实提示词。",)
    FUNCTION = "build_text"
    CATEGORY = "心宝♥节点组/提示词"
    DESCRIPTION = "自定义分组和标签，多选后输出标签对应的真实提示词。"

    def build_text(self, selected_tags="[]"):
        prompts = CUSTOM_TAG_MANAGER.prompts_for(_parse_selection(selected_tags))
        return (_join_prompts(prompts),)

    @classmethod
    def IS_CHANGED(cls, selected_tags="[]"):
        return f"{selected_tags}|{CUSTOM_TAG_MANAGER.version_token()}"


NODE_CLASS_MAPPINGS = {
    "XinbaoCustomTagSelector": XinbaoCustomTagSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XinbaoCustomTagSelector": "心宝♥自定标签",
}
