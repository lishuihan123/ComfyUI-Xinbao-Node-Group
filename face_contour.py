"""Similarity fit using only the 17 cheek/jaw/chin boundary landmarks."""
import cv2
import numpy as np


def detect_contour(detector, rgb):
    points, scores = detector(rgb[:, :, ::-1].copy())
    if len(points) == 0:
        raise ValueError("未检测到人物，无法提取脸部外轮廓。")
    contours = points[:, 23:40]
    index = int(np.argmax([np.prod(np.ptp(c, axis=0)) for c in contours]))
    return contours[index].astype(np.float64), {
        "检测人数": len(points), "选择规则": "最大脸颊下颌外轮廓区域",
        "轮廓点平均检测分数": round(float(scores[index, 23:40].mean()), 4),
    }


def fit_contour(source, target, align_tilt=False):
    source_center, target_center = source.mean(axis=0), target.mean(axis=0)
    source_zero, target_zero = source - source_center, target - target_center
    variance = float(np.sum(source_zero * source_zero))
    if variance <= 1e-12:
        raise ValueError("脸部外轮廓点重合，无法计算缩放。")
    rotation = np.eye(2)
    if align_tilt:
        u, _, vt = np.linalg.svd(source_zero.T @ target_zero)
        sign = np.diag([1.0, np.linalg.det(vt.T @ u.T)])
        rotation = vt.T @ sign @ u.T
    scale = float(np.sum((source_zero @ rotation.T) * target_zero) / variance)
    linear = scale * rotation
    shift = target_center - linear @ source_center
    return linear, shift, scale, rotation


def contour_difference(target, source):
    axis = target[-1] - target[0]
    length = float(np.linalg.norm(axis))
    if length <= 1e-12:
        raise ValueError("脸部外轮廓两端重合，无法测量宽高。")
    axis /= length
    basis = np.column_stack([axis, [-axis[1], axis[0]]])
    target_span = np.ptp(target @ basis, axis=0)
    source_span = np.ptp(source @ basis, axis=0)
    delta = source - target
    spans = np.divide(source_span, target_span, out=np.ones(2), where=target_span > 1e-12)
    return {
        "外轮廓宽度偏差百分比": round(float(100 * (spans[0] - 1)), 2),
        "外轮廓高度偏差百分比": round(float(100 * (spans[1] - 1)), 2),
        "轮廓中心横向偏差像素": round(float(delta.mean(axis=0)[0]), 2),
        "轮廓中心纵向偏差像素": round(float(delta.mean(axis=0)[1]), 2),
        "轮廓对应点均方根距离像素": round(float(np.sqrt(np.mean(np.sum(delta * delta, axis=1)))), 2),
    }


def draw_contour(rgb, contour, color):
    result = rgb.copy()
    cv2.polylines(result, [np.rint(contour).astype(np.int32)], False, color,
                  max(1, round(rgb.shape[1] / 400)), cv2.LINE_AA)
    return result


def contour_preview(base, before, after, target, source, aligned, opacity):
    points = np.concatenate([target, source, aligned])
    low, high = points.min(axis=0), points.max(axis=0)
    center = (low + high) * .5
    side = float(max(high - low) * 1.8)
    x0, y0 = center[0] - side * .5, center[1] - side * .65
    crop = np.array([[320 / side, 0, -x0 * 320 / side],
                     [0, 320 / side, -y0 * 320 / side]], dtype=np.float32)
    red, cyan = (255, 65, 65), (0, 205, 215)
    overlay = cv2.addWeighted(base, 1 - opacity, after, opacity, 0)
    overlay = draw_contour(draw_contour(overlay, target, red), aligned, cyan)
    panels = [draw_contour(base, target, red), draw_contour(before, source, cyan),
              draw_contour(after, aligned, cyan), overlay]
    labels = ["Base contour", "Before alignment", "After contour fit", f"Overlay {opacity:.0%}"]
    board = np.full((410, 1280, 3), 238, dtype=np.uint8)
    for i, (panel, label) in enumerate(zip(panels, labels)):
        x = i * 320
        board[30:350, x:x + 320] = cv2.warpAffine(panel, crop, (320, 320), flags=cv2.INTER_AREA)
        cv2.putText(board, label, (x + 7, 21), cv2.FONT_HERSHEY_SIMPLEX, .5, (20, 20, 20), 1, cv2.LINE_AA)
    for i, points in [(1, source), (2, aligned)]:
        diff = contour_difference(target, points)
        labels = [f"Contour W {diff['外轮廓宽度偏差百分比']:+.1f}% H {diff['外轮廓高度偏差百分比']:+.1f}%",
                  f"dx {diff['轮廓中心横向偏差像素']:+.1f} dy {diff['轮廓中心纵向偏差像素']:+.1f}  RMS {diff['轮廓对应点均方根距离像素']:.1f}px"]
        for row, label in enumerate(labels):
            cv2.putText(board, label, (i * 320 + 7, 373 + row * 22), cv2.FONT_HERSHEY_SIMPLEX,
                        .44, (20, 20, 20), 1, cv2.LINE_AA)
    return board
