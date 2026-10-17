import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


PLUGIN = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("custom_tag_test_module", PLUGIN / "custom_tag_selector.py")
custom_tags = importlib.util.module_from_spec(spec)
spec.loader.exec_module(custom_tags)


class CustomTagTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.manager = custom_tags.CustomTagManager(Path(temp.name) / "custom_tags.json")
        self.config = {
            "groups": [
                {"id": "style", "name": "风格"},
                {"id": "quality", "name": "质量"},
            ],
            "tags": [
                {"id": "cinematic", "group_id": "style", "name": "电影感", "prompt": "cinematic lighting"},
                {"id": "clean", "group_id": "quality", "name": "干净", "prompt": "clean background"},
            ],
        }

    def test_config_persists_and_group_order_controls_output(self):
        self.manager.replace_config(self.config)
        self.assertEqual(self.manager.prompts_for(["clean", "cinematic"]), ["cinematic lighting", "clean background"])

        reordered = {**self.config, "groups": list(reversed(self.config["groups"]))}
        self.manager.replace_config(reordered)
        reloaded = custom_tags.CustomTagManager(self.manager.file_path)
        self.assertEqual(reloaded.prompts_for(["cinematic", "clean"]), ["clean background", "cinematic lighting"])

    def test_invalid_group_or_empty_prompt_is_rejected(self):
        invalid = {"groups": self.config["groups"], "tags": [{"id": "x", "group_id": "missing", "name": "X", "prompt": "p"}]}
        with self.assertRaises(ValueError):
            self.manager.replace_config(invalid)

        invalid["tags"][0] = {"id": "x", "group_id": "style", "name": "X", "prompt": ""}
        with self.assertRaises(ValueError):
            self.manager.replace_config(invalid)

    def test_node_outputs_selected_prompts_and_ignores_unknown_ids(self):
        self.manager.replace_config(self.config)
        with mock.patch.object(custom_tags, "CUSTOM_TAG_MANAGER", self.manager):
            result = custom_tags.XinbaoCustomTagSelector().build_text(json.dumps(["clean", "missing", "cinematic"]))
        self.assertEqual(result, ("cinematic lighting，clean background。",))

    def test_node_registration(self):
        self.assertIs(custom_tags.NODE_CLASS_MAPPINGS["XinbaoCustomTagSelector"], custom_tags.XinbaoCustomTagSelector)
        self.assertEqual(custom_tags.NODE_DISPLAY_NAME_MAPPINGS["XinbaoCustomTagSelector"], "心宝♥自定标签")


if __name__ == "__main__":
    unittest.main()
