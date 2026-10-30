"""BGM 고르기와 라이브러리 맞추기(backlog E-5 · A-7 "공모전용 9곡 반영").

ffmpeg·S3 없이 돈다. 곡은 빈 파일, 버킷은 딕셔너리다.

    cd apps/ai-worker && python -m unittest tests.test_music
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
for name in ("loguru", "boto3", "botocore", "botocore.config"):
    sys.modules.setdefault(name, mock.MagicMock())

import config  # noqa: E402
from pipeline import music  # noqa: E402


class _LibraryCase(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        patcher = mock.patch.object(config, "BGM_DIR", str(self.root))
        patcher.start()
        self.addCleanup(patcher.stop)

    def put(self, tag: str, *files: str) -> None:
        (self.root / tag).mkdir(parents=True, exist_ok=True)
        for file in files:
            (self.root / tag / file).write_bytes(b"audio")


class PickTrackTest(_LibraryCase):
    def test_the_same_movie_gets_the_same_track(self) -> None:
        self.put("calm", "a.mp3", "b.mp3", "c.mp3")
        first = music.pick_track("calm", "movie-1")
        self.assertEqual({music.pick_track("calm", "movie-1") for _ in range(5)}, {first})

    def test_movies_spread_over_the_tracks(self) -> None:
        self.put("calm", "a.mp3", "b.mp3", "c.mp3")
        picked = {Path(music.pick_track("calm", f"movie-{i}")).name for i in range(30)}
        self.assertEqual(picked, {"a.mp3", "b.mp3", "c.mp3"})

    def test_falls_back_to_any_track_then_to_none(self) -> None:
        self.assertIsNone(music.pick_track("calm", "movie-1"))
        self.put("daily", "d.mp3", "notes.txt")
        self.assertEqual(Path(music.pick_track("calm", "movie-1")).name, "d.mp3")


class ApplyBgmTest(_LibraryCase):
    # 합성이 실패하면 컷을 다 붙인 무비 전체가 실패해 처음부터 다시 돌았다(2026-10-14 리뷰, backlog E-51).
    def test_a_failed_mix_goes_on_without_music(self) -> None:
        self.put("calm", "a.mp3")
        failure = music.subprocess.CalledProcessError(1, ["ffmpeg"], stderr="boom")
        with mock.patch.object(music, "mix", side_effect=failure), mock.patch.object(music, "_capture") as capture:
            path, applied = music.apply_bgm("in.mp4", "calm", "out.mp4", 5.0, "movie-1")

        self.assertEqual((path, applied), ("in.mp4", False))
        capture.assert_called_once_with(failure)

    def test_gains_reach_the_mix(self) -> None:
        self.put("calm", "a.mp3")
        with mock.patch.object(music, "mix") as mix:
            music.apply_bgm("in.mp4", "calm", "out.mp4", 5.0, "movie-1", 0.0, 1.0)
        self.assertEqual(mix.call_args.args[-2:], (0.0, 1.0))


class MixGraphTest(unittest.TestCase):
    """섞기 그래프 — 기본값은 지금까지의 무비와 글자 하나 다르지 않고, 음원만 모드는 원본 소리를 쓰지 않는다."""

    def graph(self, *gains) -> str:
        with mock.patch.object(music.subprocess, "run") as run:
            music.mix("in.mp4", "bgm.mp3", "out.mp4", 10.0, *gains)
        cmd = run.call_args.args[0]
        return cmd[cmd.index("-filter_complex") + 1]

    def test_default_is_the_old_graph(self) -> None:
        self.assertEqual(self.graph(), "[1:a]volume=0.25,afade=t=out:st=8.00:d=2,atrim=0:10.00[bg];"
                                       "[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[a]")

    def test_music_only_drops_the_source_sound(self) -> None:
        graph = self.graph(0.0, 1.0)
        self.assertNotIn("[0:a]", graph)
        self.assertIn("volume=1", graph)

    def test_partial_source_is_turned_down(self) -> None:
        self.assertIn("[0:a]volume=0.35[src]", self.graph(0.35, 0.7))

    def test_speech_keeps_the_source_only_where_someone_talks(self) -> None:
        # 음원만 레시피여도 말하는 구간은 원본을 살리고 음원을 낮춘다(trend-recipes §24)
        with mock.patch.object(music.subprocess, "run") as run:
            music.mix("in.mp4", "bgm.mp3", "out.mp4", 10.0, 0.0, 1.0, speech=[(2.0, 4.0)])
        cmd = run.call_args.args[0]
        graph = cmd[cmd.index("-filter_complex") + 1]
        self.assertIn("[0:a]volume='", graph)
        self.assertIn(":eval=frame[src]", graph)
        self.assertIn("amix=inputs=2", graph)
        self.assertIn("normalize=0", graph)  # 섞을 때 두 소리를 반씩 깎지 않는다 — 크기는 곡선이 정한다
        self.assertEqual(self.graph(0.0, 1.0), self.graph(0.0, 1.0, 0.0))  # 말소리가 없으면 지금과 같다

    def test_end_fade_closes_the_whole_mix(self) -> None:
        for gains in [(1.0, 0.25), (0.35, 0.7), (0.0, 1.0)]:
            self.assertTrue(self.graph(*gains, 1.0).endswith(",afade=t=out:st=9.00:d=1[a]"), gains)


class ParseManifestTest(unittest.TestCase):
    def test_reads_the_tag_and_file_of_each_track(self) -> None:
        raw = json.dumps(
            {
                "tracks": [
                    {"tag": "calm", "file": "a.mp3", "title": "A", "source": "Pixabay", "licenseUrl": "https://x", "checkedAt": "2026-10-15"},
                    {"tag": "upbeat", "file": "b.m4a"},
                ]
            }
        ).encode()
        self.assertEqual(music.parse_manifest(raw), [("calm", "a.mp3"), ("upbeat", "b.m4a")])

    def test_refuses_what_could_escape_the_directory_or_is_not_audio(self) -> None:
        for track in (
            {"tag": "calm", "file": "../x.mp3"},
            {"tag": "../calm", "file": "x.mp3"},
            {"tag": "calm", "file": ".hidden.mp3"},
            {"tag": "calm", "file": "notes.txt"},
            {"tag": "calm"},
        ):
            with self.subTest(track=track), self.assertRaises(music.ManifestError):
                music.parse_manifest(json.dumps({"tracks": [track]}).encode())
        with self.assertRaises(music.ManifestError):
            music.parse_manifest(b"not json")


class SyncLibraryTest(_LibraryCase):
    def setUp(self) -> None:
        super().setUp()
        self.bucket: dict[str, bytes] = {}
        self.downloads: list[str] = []

        def download(key: str, dest: str) -> None:
            if key not in self.bucket:
                raise FileNotFoundError(key)
            self.downloads.append(key)
            Path(dest).write_bytes(self.bucket[key])

        storage = mock.MagicMock()
        storage.download.side_effect = download
        modules = mock.patch.dict(sys.modules, {"storage": storage})
        modules.start()
        self.addCleanup(modules.stop)
        prefix = mock.patch.object(config, "BGM_S3_PREFIX", "assets/bgm/")
        prefix.start()
        self.addCleanup(prefix.stop)

    def publish(self, *tracks: tuple[str, str]) -> None:
        self.bucket["assets/bgm/manifest.json"] = json.dumps(
            {"tracks": [{"tag": tag, "file": file} for tag, file in tracks]}
        ).encode()
        for tag, file in tracks:
            self.bucket[f"assets/bgm/{tag}/{file}"] = f"{tag}/{file}".encode()

    def files(self) -> set[str]:
        return {str(p.relative_to(self.root)) for p in self.root.rglob("*") if p.is_file()}

    def test_fetches_what_the_manifest_lists_and_drops_what_it_no_longer_does(self) -> None:
        self.put("calm", "dev_placeholder.m4a")
        self.publish(("calm", "a.mp3"), ("upbeat", "b.mp3"))

        music.sync_library(force=True)

        self.assertEqual(self.files(), {"calm/a.mp3", "upbeat/b.mp3"})
        self.assertEqual((self.root / "calm" / "a.mp3").read_bytes(), b"calm/a.mp3")

    def test_does_not_fetch_a_track_it_already_has(self) -> None:
        self.publish(("calm", "a.mp3"))
        music.sync_library(force=True)
        self.downloads.clear()

        music.sync_library(force=True)

        self.assertEqual(self.downloads, ["assets/bgm/manifest.json"])

    def test_waits_between_looks_at_the_bucket(self) -> None:
        self.publish(("calm", "a.mp3"))
        music.sync_library(force=True)
        self.downloads.clear()

        music.sync_library()

        self.assertEqual(self.downloads, [])

    def test_keeps_the_tracks_it_has_when_the_bucket_cannot_be_read(self) -> None:
        self.put("calm", "a.mp3")

        music.sync_library(force=True)  # 매니페스트가 없다

        self.assertEqual(self.files(), {"calm/a.mp3"})

    def test_does_nothing_without_a_prefix(self) -> None:
        self.put("calm", "a.mp3")
        with mock.patch.object(config, "BGM_S3_PREFIX", ""):
            music.sync_library(force=True)
        self.assertEqual(self.downloads, [])
        self.assertEqual(self.files(), {"calm/a.mp3"})


if __name__ == "__main__":
    unittest.main()
