import hashlib
import os

import folder_paths
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps


GHOST_FILE_NAME = "⛔_点击这里清空图片_⛔.png"


def _ensure_ghost_image():
    try:
        path = os.path.join(folder_paths.get_input_directory(), GHOST_FILE_NAME)
        if not os.path.exists(path):
            Image.new("RGBA", (512, 512), (0, 0, 0, 0)).save(path)
    except Exception:
        pass


_ensure_ghost_image()


class XinbaoSmartGrid:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image_1": ("IMAGE",),
                "image_2": ("IMAGE",),
                "image_3": ("IMAGE",),
                "image_4": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "smart_merge"
    CATEGORY = "心宝♥节点组/图像工具"

    @staticmethod
    def _resize_width(image, target_width):
        height, width, _ = image.shape
        if width == target_width:
            return image
        target_height = max(1, round(height * target_width / width))
        value = image.permute(2, 0, 1).unsqueeze(0)
        value = F.interpolate(value, size=(target_height, target_width), mode="bilinear", align_corners=False)
        return value.squeeze(0).permute(1, 2, 0)

    @staticmethod
    def _resize_height(image, target_height):
        height, width, _ = image.shape
        if height == target_height:
            return image
        target_width = max(1, round(width * target_height / height))
        value = image.permute(2, 0, 1).unsqueeze(0)
        value = F.interpolate(value, size=(target_height, target_width), mode="bilinear", align_corners=False)
        return value.squeeze(0).permute(1, 2, 0)

    def smart_merge(self, image_1=None, image_2=None, image_3=None, image_4=None):
        valid_images = []
        for batch in (image_1, image_2, image_3, image_4):
            if batch is None:
                continue
            valid_images.extend(image for image in batch if image.shape[1] > 64)

        if not valid_images:
            return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)
        if len(valid_images) == 1:
            return (valid_images[0].unsqueeze(0),)
        if len(valid_images) <= 3:
            target_width = max(image.shape[1] for image in valid_images)
            rows = [self._resize_width(image, target_width) for image in valid_images]
            return (torch.cat(rows, dim=0).unsqueeze(0),)

        image_1, image_2, image_3, image_4 = valid_images[:4]
        row_1 = torch.cat([image_1, self._resize_height(image_2, image_1.shape[0])], dim=1)
        row_2 = torch.cat([image_3, self._resize_height(image_4, image_3.shape[0])], dim=1)
        row_2 = self._resize_width(row_2, row_1.shape[1])
        return (torch.cat([row_1, row_2], dim=0).unsqueeze(0),)


class XinbaoLoadImageClean:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = sorted(
            name for name in os.listdir(input_dir)
            if name != GHOST_FILE_NAME and os.path.isfile(os.path.join(input_dir, name))
        )
        return {"required": {"image": ([GHOST_FILE_NAME, *files], {"image_upload": True})}}

    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "load_image"
    CATEGORY = "心宝♥节点组/图像工具"

    def load_image(self, image):
        if image == GHOST_FILE_NAME:
            return self._empty()
        try:
            path = folder_paths.get_annotated_filepath(image)
            with Image.open(path) as source:
                value = ImageOps.exif_transpose(source)
                image_tensor = torch.from_numpy(np.array(value.convert("RGB")).astype(np.float32) / 255.0)[None,]
                if "A" in value.getbands():
                    mask = 1.0 - torch.from_numpy(np.array(value.getchannel("A")).astype(np.float32) / 255.0)
                else:
                    mask = torch.zeros((64, 64), dtype=torch.float32)
            return (image_tensor, mask)
        except Exception:
            return self._empty()

    @staticmethod
    def _empty():
        return (
            torch.zeros((1, 64, 64, 3), dtype=torch.float32),
            torch.zeros((64, 64), dtype=torch.float32),
        )

    @classmethod
    def IS_CHANGED(cls, image):
        if image == GHOST_FILE_NAME:
            return ""
        digest = hashlib.sha256()
        with open(folder_paths.get_annotated_filepath(image), "rb") as handle:
            digest.update(handle.read())
        return digest.hexdigest()

    @classmethod
    def VALIDATE_INPUTS(cls, image):
        if image == GHOST_FILE_NAME or folder_paths.exists_annotated_filepath(image):
            return True
        return f"Invalid image file: {image}"


class XinbaoImageSplitter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "split_mode": (["四方格 (2x2)", "九宫格 (3x3)"], {"default": "四方格 (2x2)"}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "split_image"
    CATEGORY = "心宝♥节点组/图像工具"

    def split_image(self, image, split_mode):
        if image.shape[1] <= 64:
            return (image,)
        image = image[:1]
        _, height, width, _ = image.shape
        rows, columns = (2, 2) if "2x2" in split_mode else (3, 3)
        cell_height, cell_width = height // rows, width // columns
        crops = [
            image[:, row * cell_height:(row + 1) * cell_height, column * cell_width:(column + 1) * cell_width, :]
            for row in range(rows)
            for column in range(columns)
        ]
        return (torch.cat(crops, dim=0),)


NODE_CLASS_MAPPINGS = {
    "XinbaoSmartGrid": XinbaoSmartGrid,
    "XinbaoLoadImageClean": XinbaoLoadImageClean,
    "XinbaoImageSplitter": XinbaoImageSplitter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "XinbaoSmartGrid": "心宝♥智能拼图",
    "XinbaoLoadImageClean": "心宝♥图片加载",
    "XinbaoImageSplitter": "心宝♥图片拆分",
}
