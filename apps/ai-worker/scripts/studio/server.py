"""로컬 레시피 스튜디오 — 브라우저에서 스냅 묶음과 레시피를 골라 렌더하고, 결과 영상 · 지표를 본다.

    npm run studio            # 저장소 루트에서. http://127.0.0.1:8765
    python3 apps/ai-worker/scripts/studio/server.py [--media 폴더] [--port 8765]

- 표준 라이브러리만 쓴다(호스트의 python3 로 돈다). 렌더는 워커 이미지(`apps/ai-worker/Dockerfile`, libass 포함)로 `render.py` 를
  `docker run` 한다 — 저장소를 읽기 전용으로 붙이므로 워커 코드를 고치면 다음 렌더에 바로 반영된다. 이미지가 없으면 처음에 빌드한다
- 스냅 묶음: `--media`(기본 `sample/`) 자신과 그 아래에서 영상 파일이 들어 있는 폴더. 결과: `apps/ai-worker/.studio/jobs/<id>/`(git 에 넣지 않는다)
- 곡: `BGM_DIR`(없으면 `~/snaply-bgm`, 그것도 없으면 `apps/ai-worker/assets/bgm`). 곡은 묶음 이름으로 정해져 같은 묶음이면 레시피를 바꿔도
  같은 곡이다 — 레시피끼리 비교가 공정하게
- 내용 분석은 `apps/api/.env` 의 OPENAI_API_KEY 로 스냅마다 한 번 부르고 파일 해시로 캐시한다(끌 수 있다)
- 렌더는 한 번에 하나씩 차례로 돈다(메모리). 127.0.0.1 에만 연다
"""

from __future__ import annotations

import argparse
import errno
import json
import mimetypes
import os
import re
import subprocess
import threading
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HERE = Path(__file__).resolve().parent
WORKER = HERE.parents[1]
REPO = WORKER.parents[1]
IMAGE = "snaply-ai-worker:studio"
VIDEO_EXTS = {".mp4", ".mov", ".m4v"}
STYLES = ("일상", "여행", "감성")
JOBS: dict[str, dict] = {}
LOCK = threading.Lock()
# 렌더는 한 번에 하나 — 둘을 함께 돌리면 글 · 스티커 합성(전체 해상도 스티커 트랙 겹치기)에서 Docker 메모리가 모자라 죽었다(2026-10-29)
RENDER_SLOT = threading.Semaphore(1)


def bgm_dir() -> Path:
    for candidate in (os.environ.get("BGM_DIR"), str(Path.home() / "snaply-bgm"), str(WORKER / "assets" / "bgm")):
        if candidate and Path(candidate).is_dir():
            return Path(candidate)
    return WORKER / "assets" / "bgm"


class Studio:
    def __init__(self, media: Path, out: Path) -> None:
        self.media, self.out = media.resolve(), out.resolve()
        (self.out / "jobs").mkdir(parents=True, exist_ok=True)
        self.bgm = bgm_dir()
        self._load_jobs()

    def _load_jobs(self) -> None:
        for meta in (self.out / "jobs").glob("*/job.json"):
            job = json.loads(meta.read_text(encoding="utf-8"))
            if job.get("status") in ("queued", "running"):
                job["status"] = "failed"
                job["error"] = "스튜디오가 다시 시작돼 작업이 끊겼습니다."
            JOBS[job["id"]] = job

    def sets(self) -> list[dict]:
        """영상이 든 폴더마다 묶음 하나 — `--media` 폴더 자신에 영상이 있으면 그 폴더도 묶음(id '.')이다."""
        out = []
        for folder in [self.media, *sorted(p for p in self.media.rglob("*") if p.is_dir())]:
            rel = folder.relative_to(self.media)
            if any(part.startswith((".", "eval-")) for part in rel.parts):
                continue
            files = sorted(f.name for f in folder.iterdir() if f.suffix.lower() in VIDEO_EXTS and not f.name.startswith("."))
            if files:
                out.append({"id": str(rel), "name": folder.name, "files": files})
        return out

    def recipes(self) -> list[dict]:
        """레시피 사전의 레시피 — 앱이 보여 주는 이름 · 설명(movie-recipe.ts)과 꾸밈 기본값을 붙인다(앱처럼 레시피를 바꾸면 꾸밈이 기본값으로)."""
        vocab = json.loads((REPO / "packages/shared-types/src/recipe-vocabulary.json").read_text(encoding="utf-8"))
        app = (REPO / "apps/mobile/src/entities/movie/lib/movie-recipe.ts").read_text(encoding="utf-8")
        shown = {m[0]: (m[1], m[2]) for m in re.findall(r"'?([\w-]+)'?:\s*\{\s*label:\s*'([^']+)',\s*description:\s*[\"']([^\"']+)[\"']", app)}
        return [{"id": name, "label": shown.get(name, (name,))[0], "description": shown.get(name, (None, spec.get("label", "")))[1],
                 "decorations": spec.get("decorations") or {"text": False, "emoji": False, "face": False}}
                for name, spec in vocab["recipes"].items()]

    def start(self, body: dict) -> dict:
        folder = (self.media / body["set"]).resolve()
        if self.media not in folder.parents and folder != self.media:
            raise ValueError("묶음 경로가 media 밖입니다.")
        files = [f for f in body.get("files") or [] if (folder / f).is_file() and "/" not in f]
        if not files:
            raise ValueError("스냅을 하나 이상 고르세요.")
        if body.get("recipe") not in {r["id"] for r in self.recipes()} or body.get("style") not in STYLES:
            raise ValueError("레시피 · 스타일을 확인하세요.")
        job = {"id": time.strftime("%m%d-%H%M%S-") + uuid.uuid4().hex[:4], "set": body["set"], "files": files,
               "recipe": body["recipe"], "style": body["style"], "analysis": bool(body.get("analysis", True)),
               "stabilize": bool(body.get("stabilize", False)),
               "speech": bool(body.get("speech", False)), "sceneOrder": bool(body.get("sceneOrder", False)),
               "decorations": {k: bool((body.get("decorations") or {}).get(k)) for k in ("text", "emoji", "face")},
               "locked": bool(body.get("locked", False)), "freshTrack": bool(body.get("freshTrack", False)),
               "sing": bool(body.get("sing", False)), "auto": bool(body.get("auto", False)),
               "black": bool(body.get("black", False)), "newStickers": bool(body.get("newStickers", False)),
               "note": str(body.get("note") or "")[:80], "status": "queued", "progress": 0, "step": "대기",
               "log": [], "created": time.time()}
        self._save(job)
        threading.Thread(target=self._run, args=(job,), daemon=True).start()
        return job

    def _save(self, job: dict) -> None:
        with LOCK:
            JOBS[job["id"]] = job
            folder = self.out / "jobs" / job["id"]
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "job.json").write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")

    @staticmethod
    def movie_key(job: dict) -> str:
        """곡 · 레시피의 무작위를 정하는 무비 키(운영은 무비 id). 기본은 묶음 이름이라 레시피끼리 같은 곡으로 비교하고,
        '새 무비처럼'이면 작업마다 다른 키 — 앱에서 같은 스냅으로 무비를 새로 만든 것처럼 곡이 다시 뽑힌다."""
        return f"studio:{job['set']}:{job['id']}" if job.get("freshTrack") else f"studio:{job['set']}"

    def _command(self, job: dict) -> list[str]:
        cmd = ["docker", "run", "--rm", "--name", f"snaply-studio-{job['id']}",
               "-v", f"{REPO}:/repo:ro", "-v", f"{self.out}:/out", "-v", f"{self.media}:/media:ro", "-v", f"{self.bgm}:/bgm",
               "-e", "BGM_DIR=/bgm", "-e", "BGM_S3_PREFIX=", "-e", "PYTHONDONTWRITEBYTECODE=1", "-e", "PYTHONUNBUFFERED=1",
               "-w", "/repo/apps/ai-worker", IMAGE, "python", "scripts/studio/render.py",
               "--out", f"/out/jobs/{job['id']}", "--cache", "/out/.cache/analysis",
               "--recipe", job["recipe"], "--style", job["style"], "--key", self.movie_key(job)]
        if not job["analysis"]:
            cmd.append("--no-analysis")
        if job.get("stabilize"):
            cmd.append("--stabilize")
        if job.get("speech"):
            cmd.append("--speech")
        if job.get("sceneOrder"):
            cmd.append("--scene-order")
        if job.get("locked"):
            cmd.append("--locked")
        if job.get("sing"):
            cmd.append("--sing")
        if job.get("auto"):
            cmd.append("--auto")
        if job.get("black"):
            cmd.append("--black")
        if job.get("newStickers"):
            cmd.append("--new-stickers")
        if "decorations" in job:
            cmd += ["--decorations", json.dumps(job["decorations"])]
        return cmd + [f"/media/{job['set']}/{f}" for f in job["files"]]

    def _run(self, job: dict) -> None:
        with RENDER_SLOT:
            self._render(job)

    def _render(self, job: dict) -> None:
        job["status"] = "running"
        self._save(job)
        try:
            ensure_image(lambda line: self._log(job, line))
            proc = subprocess.Popen(self._command(job), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            job["pid"] = proc.pid
            for line in proc.stdout or []:
                self._line(job, line.rstrip())
            code = proc.wait()
            result = self.out / "jobs" / job["id"] / "result.json"
            if code == 0 and result.exists():
                track = json.loads(result.read_text(encoding="utf-8")).get("track") or ""
                job.update(status="done", progress=100, step="완료", track=Path(track).stem)  # 목록에서 어느 곡인지 보이게
            else:
                job.update(status="failed", error=f"렌더 실패(exit {code}) — 로그를 보세요")
        except Exception as exc:  # noqa: BLE001 — 작업 하나의 실패를 서버 실패로 만들지 않는다
            job.update(status="failed", error=str(exc))
        self._save(job)

    def _line(self, job: dict, line: str) -> None:
        if line.startswith("STUDIO "):
            try:
                msg = json.loads(line[7:])
            except json.JSONDecodeError:
                msg = {}
            if "progress" in msg:
                job.update(progress=msg["progress"], step=msg.get("step", ""))
                self._save(job)
            if "warning" in msg:
                self._log(job, "⚠ " + msg["warning"])
            return
        self._log(job, line)

    def _log(self, job: dict, line: str) -> None:
        job["log"] = (job["log"] + [re.sub(r"\x1b\[[0-9;]*m", "", line)])[-300:]

    def cancel(self, job_id: str) -> None:
        subprocess.run(["docker", "kill", f"snaply-studio-{job_id}"], capture_output=True)

    def thumbnail(self, rel: str) -> Path | None:
        """스냅 1초 지점의 작은 jpg — 목록에서 영상을 수십 개 띄우면 브라우저가 첫 화면을 그리지 않는다. 호스트 ffmpeg 로 한 번 만들어 둔다."""
        src = (self.media / rel).resolve()
        if self.media not in src.parents or not src.is_file():
            return None
        thumb = self.out / ".cache" / "thumbs" / (re.sub(r"[^\w.-]", "_", rel) + ".jpg")
        if not thumb.exists():
            thumb.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", str(src), "-frames:v", "1",
                            "-vf", "scale=180:-2", str(thumb)], capture_output=True)
        return thumb if thumb.exists() else None

    def job_view(self, job_id: str) -> dict:
        job = dict(JOBS[job_id])
        result = self.out / "jobs" / job_id / "result.json"
        if result.exists():
            job["result"] = json.loads(result.read_text(encoding="utf-8"))
        return job


def ensure_image(log) -> None:
    if subprocess.run(["docker", "image", "inspect", IMAGE], capture_output=True).returncode == 0:
        return
    log("워커 이미지를 처음 빌드합니다(몇 분 걸립니다)…")
    subprocess.run(["docker", "build", "-q", "-f", str(WORKER / "Dockerfile"), "-t", IMAGE, str(REPO)], check=True,
                   capture_output=True)


class Handler(BaseHTTPRequestHandler):
    studio: Studio

    def log_message(self, *_args) -> None:  # 요청마다 찍지 않는다
        return

    def _json(self, payload, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: Path, root: Path) -> None:
        path = path.resolve()
        if root not in path.parents or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        size = path.stat().st_size
        start, end = 0, size - 1
        match = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
        if match:
            start = int(match.group(1) or 0)
            end = min(size - 1, int(match.group(2))) if match.group(2) else size - 1
        self.send_response(206 if match else 200)
        self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if match:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with open(path, "rb") as handle:
            handle.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = handle.read(min(1 << 16, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                left -= len(chunk)

    def do_GET(self) -> None:  # noqa: N802 — http.server 규약
        path = unquote(urlparse(self.path).path)
        s = self.studio
        if path in ("/", "/index.html"):
            self._file(HERE / "index.html", HERE)
        elif path == "/api/sets":
            self._json(s.sets())
        elif path == "/api/recipes":
            self._json({"recipes": s.recipes(), "styles": STYLES})
        elif path == "/api/jobs":
            self._json(sorted(({k: v for k, v in j.items() if k != "log"} for j in JOBS.values()),
                              key=lambda j: -j["created"]))
        elif path.startswith("/api/jobs/") and path[10:] in JOBS:
            self._json(s.job_view(path[10:]))
        elif path.startswith("/thumb/"):
            thumb = s.thumbnail(path[7:])
            if thumb is None:
                self.send_error(HTTPStatus.NOT_FOUND)
            else:
                self._file(thumb, s.out)
        elif path.startswith("/media/"):
            self._file(s.media / path[7:], s.media)
        elif path.startswith("/out/"):
            self._file(s.out / "jobs" / path[5:], s.out)
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        try:
            if path == "/api/render":
                self._json(self.studio.start(body), 201)
            elif path.startswith("/api/jobs/") and path.endswith("/cancel"):
                self.studio.cancel(path.split("/")[3])
                self._json({"ok": True})
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self._json({"error": str(exc)}, 400)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--media", default=str(REPO / "sample"))
    ap.add_argument("--out", default=str(WORKER / ".studio"))
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    Handler.studio = Studio(Path(args.media), Path(args.out))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as exc:
        if exc.errno != errno.EADDRINUSE:
            raise
        raise SystemExit(f"포트 {args.port} 을 이미 쓰고 있습니다 — 스튜디오가 떠 있다면 http://127.0.0.1:{args.port} 를 여세요. "
                         f"새로 띄우려면 떠 있는 것을 끄거나(`pkill -f studio/server.py`) `npm run studio -- --port 8766` 처럼 다른 포트로.")
    print(f"Snaply 레시피 스튜디오 — http://127.0.0.1:{args.port}  (media={Handler.studio.media}, bgm={Handler.studio.bgm})")
    server.serve_forever()


if __name__ == "__main__":
    main()
