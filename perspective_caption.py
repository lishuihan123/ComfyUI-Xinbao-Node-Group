"""Approved Xinbao perspective instructions, 2026-11-01."""
import re

HEIGHT_TEXT = {
    '低': '摄像机位于观察中心下方，以45度仰角向上看向中心。',
    '中': '摄像机与观察中心保持等高，水平看向中心。',
    '高': '摄像机位于观察中心上方，以45度俯角向下看向中心。',
    '顶': '摄像机位于观察中心正上方，垂直向下俯拍。',
}
PRESERVE = '保持场景内容、物体外观及相互位置关系一致，前景和背景随摄像机视角一起变化。'

def build_caption(rotation, height, distance):
    angle = int(rotation)
    height = {'垂直': '顶', '更高': '顶'}.get(height, height)
    if angle == 0 and height == '中' and distance == '大':
        return ('Xinbao，调整输入图像的拍摄距离。保持原有水平方位，摄像机水平看向同一个场景中心，'
                '拉远摄像机以扩大取景范围，保持焦距不变。保持场景内容、物体外观及相互位置关系一致。')
    text = 'Xinbao，调整输入图像的整体透视视角。'
    if angle:
        scene_dir, camera_dir = ('左', '右') if angle < 0 else ('右', '左')
        text += (f'围绕同一个场景中心，将摄像机向{camera_dir}环绕{abs(angle)}度，'
                 f'使整个场景呈现向{scene_dir}旋转{abs(angle)}度的视角效果。')
    else:
        text += '保持原有水平方位，以同一个场景中心为观察中心。'
    text += HEIGHT_TEXT[height]
    text += ('保持摄像机到观察中心的原有距离和焦距。' if distance == '中'
             else '拉远摄像机，扩大取景范围，保持焦距不变。')
    return text + PRESERVE

def expand_short_caption(caption):
    match = re.fullmatch(r'Xinbao，场景旋转：(左|右)?(0|45|90)°，高度：(低|中|高|顶)，距离：(中|大)。', caption)
    if not match:
        raise ValueError('Unrecognized short caption: ' + caption)
    side, degrees, height, distance = match.groups()
    return build_caption(-int(degrees) if side == '左' else int(degrees), height, distance)
