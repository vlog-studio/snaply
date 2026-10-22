"""잘못된 회전 정보 바로잡기 — 회전 정보(display matrix)대로 세우면 오히려 눕는 영상을 찾아 회전 정보를 지운다.

메신저(카카오톡 등)를 거친 영상 중에는 픽셀은 이미 바로 서 있는데 '90도 돌려 보여라'는 회전 정보가 붙어 오는 것이 있다
(2026-10-22 sample/02 — 사람들이 옆으로 누운 채 무비에 들어갔다). 회전 정보만으로는 맞고 틀림을 알 수 없으므로 **얼굴**로 판단한다:
회전 정보가 있는 영상에서 몇 프레임을 '회전 적용' · '회전 무시' 두 가지로 읽어 얼굴을 찾고(YuNet), 무시한 쪽이 뚜렷이 더 잘 잡히면
회전 정보를 0 으로 덮어 다시 감싼다(-c copy — 다시 인코딩하지 않는다). 얼굴이 어느 쪽에도 없으면 파일 정보를 그대로 따른다 — 근거 없이
돌리지 않는다.
"""

import json
import os
import subprocess

import numpy as np

from pipeline import face

SAMPLE_AT = (0.2, 0.5, 0.8)  # 영상 길이의 몫
MIN_FACES = 1.0  # 무시한 쪽의 얼굴 점수 합 하한
MARGIN = 1.5  # 무시한 쪽이 적용한 쪽의 이 배를 넘어야 바꾼다


def rotation(path: str) -> float:
    """첫 영상 스트림의 회전 정보(도). 없으면 0."""
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream_side_data=rotation:format=duration", "-of", "json", path], capture_output=True, text=True)
    try:
        data = json.loads(out.stdout or "{}")
    except json.JSONDecodeError:
        return 0.0
    for stream in data.get("streams", []):
        for side in stream.get("side_data_list", []) or []:
            if "rotation" in side:
                return float(side["rotation"])
    return 0.0


def _duration(path: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def _frames(path: str, honour: bool) -> np.ndarray:
    """SAMPLE_AT 자리의 프레임들(BGR, face.READ_W x READ_H 에 맞춰 늘이지 않고 가운데 정사각형 안에 넣는다)."""
    duration = _duration(path)
    size = face.READ_W
    frames = []
    for share in SAMPLE_AT:
        cmd = ["ffmpeg", "-v", "error"]
        if not honour:
            cmd += ["-display_rotation:v:0", "0"]
        cmd += ["-ss", f"{duration * share:.3f}", "-i", path, "-frames:v", "1",
                "-vf", f"scale={size}:{size}:force_original_aspect_ratio=decrease,pad={face.READ_W}:{face.READ_H}:(ow-iw)/2:(oh-ih)/2",
                "-pix_fmt", "bgr24", "-f", "rawvideo", "-"]
        raw = subprocess.run(cmd, capture_output=True).stdout
        if len(raw) == face.READ_W * face.READ_H * 3:
            frames.append(np.frombuffer(raw, np.uint8).reshape(face.READ_H, face.READ_W, 3))
    return np.stack(frames) if frames else np.zeros((0, face.READ_H, face.READ_W, 3), np.uint8)


def _face_score(frames: np.ndarray) -> float:
    if len(frames) == 0:
        return 0.0
    return float(sum(len(boxes) for boxes in face.detect_frames(frames)))


def needs_fix(path: str) -> bool:
    """회전 정보가 있고, 그것을 무시해야 얼굴이 뚜렷이 더 잘 서는가."""
    if rotation(path) % 360 == 0:
        return False
    try:
        honoured, ignored = _face_score(_frames(path, True)), _face_score(_frames(path, False))
    except face.FaceError:
        return False  # 얼굴 모델을 못 쓰면 파일 정보를 그대로
    return ignored >= MIN_FACES and ignored > honoured * MARGIN


def fix(path: str, work_dir: str) -> str:
    """바로잡아야 하면 회전 정보를 0 으로 덮은 사본의 경로, 아니면 그대로."""
    if not needs_fix(path):
        return path
    dst = os.path.join(work_dir, "upright_" + os.path.basename(path))
    proc = subprocess.run(["ffmpeg", "-v", "error", "-y", "-display_rotation:v:0", "0", "-i", path, "-map", "0", "-c", "copy",
                           dst], capture_output=True, text=True)
    return dst if proc.returncode == 0 else path
