# 워커 번들 모델

워커 안에서만 도는 작은 모델이다. 입력(영상 프레임)을 밖으로 보내지 않는다.

| 파일 | 쓰는 곳 | 출처 | 라이선스 |
|---|---|---|---|
| `face_detection_yunet_2023mar.onnx` (227KB, sha256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`) | 얼굴 스티커의 얼굴 찾기 — `pipeline/face.py`, OpenCV `FaceDetectorYN` | [opencv_zoo `models/face_detection_yunet`](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) (2026-10-22 받음) | MIT — `LICENSE-yunet.txt` |

MIT 는 파일을 그대로 함께 배포하고 상업적으로 쓰는 것을 허용한다(저작권 고지 유지). 모델을 바꾸면 `tests/test_face.py` 와
이 표의 해시를 함께 고친다. 결정과 Haar 검출기를 쓰지 않은 이유는 [docs/decisions/trend-recipes.md](../../../../docs/decisions/trend-recipes.md) §7.
