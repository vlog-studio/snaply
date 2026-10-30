"""편집 워커의 실패 처리 — 일시적 실패는 큐의 다음 시도에 맡기고, 확정은 마지막에만 한다.

ffmpeg·S3·DB 없이 돈다. 파이프라인과 DB 호출을 가짜로 두고, 워커가 **언제 실패를 확정하는지**만 본다.
첫 예외에서 실패를 확정하면 큐의 재시도가 아무것도 하지 못하고 일시적 오류도 사용자에게 실패로 간다
(backlog E-27, specs/movie.md MOV-12).

    cd apps/ai-worker && python -m unittest tests.test_edit_worker
"""

import asyncio
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
# 워커 런타임 의존성 없이 흐름만 검증한다 (test_rendition_worker.py 와 같은 방식).
for name in ("loguru", "bullmq", "asyncpg", "boto3", "botocore", "botocore.config"):
    sys.modules.setdefault(name, mock.MagicMock())

import worker  # noqa: E402

JOB_ID = "33333333-3333-3333-3333-333333333333"
USER_ID = "22222222-2222-2222-2222-222222222222"
VIDEO_ID = "11111111-1111-1111-1111-111111111111"


def _job(attempts_made: int = 0, attempts: int = 3) -> mock.Mock:
    job = mock.Mock()
    job.data = {"jobId": JOB_ID, "userId": USER_ID, "clips": [{"videoId": VIDEO_ID}], "editSpec": {"stylePreset": "일상"}}
    job.opts = {"attempts": attempts}
    job.attemptsMade = attempts_made
    job.discarded = False
    return job


class _WorkerCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.db = mock.patch.object(worker, "db").start()
        self.db.mark_failed = mock.AsyncMock()
        self.db.requeue_for_retry = mock.AsyncMock(return_value=True)
        self.publish = mock.patch.object(worker, "_publish", new=mock.AsyncMock()).start()
        mock.patch.object(worker, "_capture").start()
        self.addCleanup(mock.patch.stopall)

    def fail_pipeline_with(self, exc: BaseException) -> None:
        mock.patch.object(worker, "_run_pipeline", new=mock.AsyncMock(side_effect=exc)).start()


class TransientFailureTest(_WorkerCase):
    async def test_an_early_attempt_goes_back_to_the_queue_without_failing(self) -> None:
        self.fail_pipeline_with(OSError("S3 연결 끊김"))
        job = _job(attempts_made=0)

        with self.assertRaises(OSError):
            await worker.process_edit_job(job, "token")

        self.db.requeue_for_retry.assert_awaited_once_with(JOB_ID)
        self.db.mark_failed.assert_not_awaited()
        self.publish.assert_awaited_once_with(JOB_ID, {"progress": 0, "step": worker.RETRY_STEP})
        self.assertFalse(job.discarded)

    async def test_the_last_attempt_settles_the_failure_and_refunds(self) -> None:
        self.fail_pipeline_with(OSError("S3 연결 끊김"))

        with self.assertRaises(OSError):
            await worker.process_edit_job(_job(attempts_made=2), "token")

        self.db.mark_failed.assert_awaited_once()
        self.assertEqual(self.db.mark_failed.await_args.args[2], "INTERNAL")
        self.db.requeue_for_retry.assert_not_awaited()
        frame = self.publish.await_args.args[1]
        self.assertEqual((frame["status"], frame["code"]), ("failed", "INTERNAL"))

    async def test_a_queue_without_retries_settles_on_the_first_failure(self) -> None:
        self.fail_pipeline_with(OSError("S3 연결 끊김"))

        with self.assertRaises(OSError):
            await worker.process_edit_job(_job(attempts=1), "token")

        self.db.mark_failed.assert_awaited_once()

    async def test_a_run_canceled_while_failing_is_not_retried(self) -> None:
        self.fail_pipeline_with(OSError("S3 연결 끊김"))
        self.db.requeue_for_retry = mock.AsyncMock(return_value=False)

        result = await worker.process_edit_job(_job(attempts_made=0), "token")

        self.assertEqual(result["status"], "canceled")
        self.db.mark_failed.assert_not_awaited()
        self.publish.assert_not_awaited()


class PermanentFailureTest(_WorkerCase):
    async def test_a_missing_original_fails_at_once_and_drops_the_retries(self) -> None:
        self.fail_pipeline_with(worker.SourceUnavailableError("원본 클립을 찾을 수 없습니다."))
        job = _job(attempts_made=0)

        with self.assertRaises(worker.SourceUnavailableError):
            await worker.process_edit_job(job, "token")

        self.assertEqual(self.db.mark_failed.await_args.args[2], "SOURCE_UNAVAILABLE")
        self.db.requeue_for_retry.assert_not_awaited()
        self.assertTrue(job.discarded)

    async def test_a_timeout_fails_at_once_and_drops_the_retries(self) -> None:
        self.fail_pipeline_with(asyncio.TimeoutError())
        job = _job(attempts_made=0)

        with self.assertRaises(asyncio.TimeoutError):
            await worker.process_edit_job(job, "token")

        self.assertEqual(self.db.mark_failed.await_args.args[2], "TIMEOUT")
        self.assertTrue(job.discarded)


class RefusedStartTest(_WorkerCase):
    """큐가 다시 넘긴 작업의 시작이 거절된 이유를 가른다 — 끝난 작업을 "취소"로 적지 않는다."""

    def setUp(self) -> None:
        super().setUp()
        self.db.fetch_job_context = mock.AsyncMock(return_value={"video_id": "44444444-4444-4444-4444-444444444444"})
        self.db.mark_processing = mock.AsyncMock(return_value=False)

    async def test_a_job_that_already_ended_is_skipped_as_settled(self) -> None:
        self.db.fetch_job_status = mock.AsyncMock(return_value="failed")

        result = await worker.process_edit_job(_job(attempts_made=1), "token")

        self.assertEqual(result["status"], "settled")
        self.db.mark_failed.assert_not_awaited()

    async def test_a_job_canceled_before_its_retry_stops_as_canceled(self) -> None:
        self.db.fetch_job_status = mock.AsyncMock(return_value="canceled")

        result = await worker.process_edit_job(_job(attempts_made=1), "token")

        self.assertEqual(result["status"], "canceled")
        self.db.mark_failed.assert_not_awaited()


class FinalizeFallbackTest(unittest.TestCase):
    # 마지막 손질이 실패하면 비싼 단계를 다 거친 작업 전체가 실패해 처음부터 다시 돌았다(2026-10-14 리뷰, backlog E-51).
    def test_a_failed_finish_uploads_the_movie_as_it_was(self) -> None:
        failure = RuntimeError("ffmpeg 실패: boom")
        with mock.patch.object(worker.editor, "finalize", side_effect=failure), mock.patch.object(
            worker, "_capture"
        ) as capture:
            self.assertEqual(worker._finalize_or_keep("with_bgm.mp4", "final.mp4"), "with_bgm.mp4")
        capture.assert_called_once_with(failure)

    def test_a_finished_movie_is_the_final_file(self) -> None:
        with mock.patch.object(worker.editor, "finalize"):
            self.assertEqual(worker._finalize_or_keep("with_bgm.mp4", "final.mp4"), "final.mp4")


V3_SPEC = {
    "version": 3,
    "stylePreset": "일상",
    "timeline": {"cuts": [{"cutId": "a", "videoId": VIDEO_ID, "sourceInMs": 0, "sourceOutMs": 1500}], "transitions": []},
}


BLUR_RENDER_SPEC = {"profileVersion": 1, "outputProfile": "short_vertical", "width": 1080, "height": 1920, "fps": 30,
                    "fitMode": "blur_background"}

# classic 의 (원본 소리, BGM) — 2026-10-26 사용자: 모든 무비는 원본 소리를 빼고 음원만(ASMR 만 예외). 되돌리면 (1.0, 0.25)
CLASSIC_GAINS = (0.0, 1.0)


class AccentStageWiringTest(unittest.IsolatedAsyncioTestCase):
    """텍스트 액센트 단계는 v3 무비만 돈다 — classic 무비는 켰을 때만(MOV-27), 레시피 무비는 늘(MOV-28, backlog H-19).
    끄면 classic 무비의 결과물이 지금과 같다."""

    def setUp(self) -> None:
        db = mock.patch.object(worker, "db").start()
        db.fetch_job_context = mock.AsyncMock(return_value={"user_id": USER_ID, "video_id": "44444444-4444-4444-4444-444444444444"})
        db.mark_processing = mock.AsyncMock(return_value=True)
        db.fetch_source_keys = mock.AsyncMock(return_value={VIDEO_ID: "u/src.mp4"})
        db.update_progress = mock.AsyncMock(return_value=True)
        db.set_video_result = mock.AsyncMock()
        db.mark_done = mock.AsyncMock(return_value=True)
        mock.patch.object(worker, "_publish", new=mock.AsyncMock()).start()
        mock.patch.object(worker, "storage").start()
        mock.patch.object(worker, "notify", new=mock.Mock(movie_ready=mock.AsyncMock())).start()
        mock.patch.object(worker.editor, "edit_timeline", return_value="base.mp4").start()
        mock.patch.object(worker.editor, "probe_duration", return_value=1.5).start()
        mock.patch.object(worker.editor, "extract_thumbnail").start()
        self.bgm = mock.patch.object(worker.music, "apply_bgm", return_value=("with_bgm.mp4", True)).start()
        mock.patch.object(worker, "_finalize_or_keep", side_effect=lambda current, _out: current).start()
        self.accents = mock.patch.object(worker, "_apply_accents", new=mock.AsyncMock(return_value="with_accents.mp4")).start()
        self.addCleanup(mock.patch.stopall)

    async def run_pipeline(self, spec: dict) -> None:
        await worker._run_pipeline(JOB_ID, {"userId": USER_ID, "movieId": "m1", "editSpec": spec}, "/tmp/w")

    async def test_a_classic_movie_with_decorations_on_gets_them_after_the_music(self) -> None:
        on = {"text": True, "emoji": True, "face": False}
        await self.run_pipeline({**V3_SPEC, "decorations": on})
        self.accents.assert_awaited_once()
        self.assertEqual(self.accents.await_args.args[0], "with_bgm.mp4")
        self.assertEqual(self.accents.await_args.args[-1], on)
        worker.storage.upload.assert_any_call("with_accents.mp4", mock.ANY, "video/mp4")

    async def test_a_classic_movie_without_decorations_is_as_before(self) -> None:
        # 꾸밈이 없는 스펙(이 결정 전의 작업)은 레시피 기본값 — classic 은 셋 다 꺼짐(예전 TEXT_ACCENTS_ENABLED=false 와 같다)
        await self.run_pipeline(V3_SPEC)
        self.accents.assert_not_awaited()
        worker.storage.upload.assert_any_call("with_bgm.mp4", mock.ANY, "video/mp4")
        self.assertEqual(self.bgm.call_args.args[-2:], CLASSIC_GAINS)

    async def test_a_trend_recipe_drops_the_source_sound_and_runs_the_stage(self) -> None:
        await self.run_pipeline({**V3_SPEC, "recipe": "trend-routine"})
        self.assertEqual(self.bgm.call_args.args[-2:], (0.0, 1.0))
        self.accents.assert_awaited_once()

    async def test_the_movie_recipe_comes_from_the_spec(self) -> None:
        await self.run_pipeline({**V3_SPEC, "recipe": "cinematic"})
        self.assertEqual(self.bgm.call_args.args[-2:], (0.0, 1.0))
        # 뒤의 것은 맞춤 방식 — 레터박스 레시피라 띠(renderSpec 이 없는 예전 작업의 기본 contain 대신). 꾸밈은 레시피 기본값
        self.assertEqual(self.accents.await_args.args[-3:], ("cinematic", "letterbox", {"text": True, "emoji": True, "face": True}))

    async def test_turning_off_every_decoration_still_runs_the_recipe_title(self) -> None:
        # 레시피 무비는 꾸밈을 다 꺼도 고정 타이틀 · 효과음이 이 단계에 있다
        await self.run_pipeline({**V3_SPEC, "recipe": "cinematic", "decorations": {"text": False, "emoji": False, "face": False}})
        self.assertEqual(self.accents.await_args.args[-1], {"text": False, "emoji": False, "face": False})

    async def test_a_spec_without_a_recipe_is_classic_whatever_the_environment(self) -> None:
        # API 는 classic 무비에 recipe 를 싣지 않는다 — 사용자가 고른 '기본'을 워커 전체의 값이 덮으면 안 된다(backlog E-67)
        with mock.patch.dict("os.environ", {"MOVIE_RECIPE": "cinematic"}):
            await self.run_pipeline(V3_SPEC)
        self.assertEqual(self.bgm.call_args.args[-2:], CLASSIC_GAINS)
        self.accents.assert_not_awaited()
        self.assertFalse(hasattr(worker.config, "MOVIE_RECIPE"))

    async def test_an_unknown_recipe_falls_back_to_classic_instead_of_failing(self) -> None:
        await self.run_pipeline({**V3_SPEC, "recipe": "tiktok-max"})
        self.assertEqual(self.bgm.call_args.args[-2:], CLASSIC_GAINS)
        self.accents.assert_not_awaited()

    async def test_auto_cut_movies_are_re_cut_by_the_recipe(self) -> None:
        with mock.patch.object(worker, "_render_trend", new=mock.AsyncMock(return_value="trend.mp4")) as trend:
            await self.run_pipeline({**V3_SPEC, "recipe": "cinematic", "autoCuts": True})
        trend.assert_awaited_once()
        self.bgm.assert_not_called()  # 음원 · 글 · 효과음은 레시피 경로가 한 번에
        worker.storage.upload.assert_any_call("trend.mp4", mock.ANY, "video/mp4")

    async def test_the_recipe_seed_follows_the_composition_not_the_job(self) -> None:
        with mock.patch.object(worker, "_render_trend", new=mock.AsyncMock(return_value="trend.mp4")) as trend:
            await self.run_pipeline({**V3_SPEC, "recipe": "cinematic", "autoCuts": True})
        key = trend.await_args.args[-2]
        spec = {**V3_SPEC, "recipe": "cinematic", "autoCuts": True}
        self.assertEqual(key, worker._variant_key(key.split(":")[0], spec))
        # 같은 구성이면 같은 시드(MOV-14 — 다시 만들어도 같은 편집), 레시피나 컷이 바뀌면 다른 시드. 작업 id 는 들어가지 않는다
        self.assertEqual(worker._variant_key("m1", spec), worker._variant_key("m1", dict(reversed(list(spec.items())))))
        self.assertNotEqual(worker._variant_key("m1", spec), worker._variant_key("m1", {**spec, "recipe": "fast-cut"}))
        self.assertNotEqual(worker._variant_key("m1", spec), worker._variant_key("m2", spec))
        # 꾸밈만 바꾸면 같은 시드 — 글자만 꺼도 컷 · 순서 · 효과가 다시 섞이지 않는다(text-accent-stickers.md §9)
        off = {**spec, "decorations": {"text": False, "emoji": True, "face": True}}
        self.assertEqual(worker._variant_key("m1", spec), worker._variant_key("m1", off))

    async def test_the_recipe_path_gets_the_movie_decorations(self) -> None:
        chosen = {"text": False, "emoji": True, "face": False}
        with mock.patch.object(worker, "_render_trend", new=mock.AsyncMock(return_value="trend.mp4")) as trend:
            await self.run_pipeline({**V3_SPEC, "recipe": "cinematic", "autoCuts": True, "decorations": chosen})
        self.assertEqual(trend.await_args.args[-1], chosen)

    async def test_user_trimmed_movies_keep_their_cuts(self) -> None:
        with mock.patch.object(worker, "_render_trend", new=mock.AsyncMock(return_value="trend.mp4")) as trend:
            await self.run_pipeline({**V3_SPEC, "recipe": "cinematic", "autoCuts": False})
        trend.assert_not_awaited()
        self.bgm.assert_called_once()

    async def test_a_letterbox_recipe_renders_the_band_whatever_the_movie_chose(self) -> None:
        # 컷을 손본 시네마틱 무비 — 무비의 맞춤 방식(블러)이 아니라 AI 컷 경로와 같은 띠(MOV-8 · MOV-28, 2026-10-30).
        # 처음엔 pad_black 이라 세로 원본에는 띠가 없었다
        await worker._run_pipeline(JOB_ID, {"userId": USER_ID, "movieId": "m1", "editSpec": {**V3_SPEC, "recipe": "cinematic"},
                                            "renderSpec": BLUR_RENDER_SPEC}, "/tmp/w")
        self.assertEqual(worker.editor.edit_timeline.call_args.args[3].fit_mode, "letterbox")
        self.assertEqual(self.accents.await_args.args[-2], "letterbox")

    async def test_other_recipes_keep_the_movie_fit_mode(self) -> None:
        await worker._run_pipeline(JOB_ID, {"userId": USER_ID, "movieId": "m1", "editSpec": {**V3_SPEC, "recipe": "trend-routine"},
                                            "renderSpec": BLUR_RENDER_SPEC}, "/tmp/w")
        self.assertEqual(worker.editor.edit_timeline.call_args.args[3].fit_mode, "blur_background")

    async def test_a_failed_recipe_render_falls_back_to_the_usual_path(self) -> None:
        with mock.patch.object(worker, "_render_trend", new=mock.AsyncMock(return_value=None)):
            await self.run_pipeline({**V3_SPEC, "recipe": "cinematic", "autoCuts": True})
        self.bgm.assert_called_once()
        worker.storage.upload.assert_any_call("with_accents.mp4", mock.ANY, "video/mp4")


class RenderTrendTrackTest(unittest.IsolatedAsyncioTestCase):
    """AI 컷 레시피 경로도 곡을 고르기 전에 라이브러리를 맞춘다 — 배포로 새로 뜬 워커는 곡이 비어 있다(2026-10-29 운영에서 BGM 이 빠졌다)."""

    async def test_the_library_is_synced_before_the_track_is_picked(self) -> None:
        order = []
        trend_result = mock.Mock(duration_s=10.0, cuts=[], links=[], accents=[], sfx=[], edl={})
        with mock.patch.object(worker, "db") as db, \
                mock.patch.object(worker, "_progress", new=mock.AsyncMock()), \
                mock.patch.object(worker.music, "sync_library", side_effect=lambda: order.append("sync")) as sync, \
                mock.patch.object(worker.music, "pick_track", side_effect=lambda *_: order.append("pick") or "/bgm/calm/a.mp3"), \
                mock.patch.object(worker.trend_edit, "render", return_value=trend_result) as render:
            db.fetch_accent_inputs = mock.AsyncMock(return_value=({}, {}))
            db.fetch_captured_at = mock.AsyncMock(return_value={})
            out = await worker._render_trend([VIDEO_ID], {VIDEO_ID: "/w/src_0.mp4"}, worker.get_preset("감성"), "cinematic",
                                             {"movieId": "m1"}, JOB_ID, USER_ID, "/w", "m1:abc")
        self.assertEqual(out, "/w/trend.mp4")
        sync.assert_called_once()
        self.assertEqual(order, ["sync", "pick"])
        self.assertEqual(render.call_args.args[2], "/bgm/calm/a.mp3")


class ApplyAccentsInputTest(unittest.IsolatedAsyncioTestCase):
    async def test_cuts_inputs_and_the_chosen_track_reach_the_stage(self) -> None:
        clips = [worker.editor.ClipSource("/w/src_0.mp4", 0, 1500)]
        specs = [mock.Mock(video_id=VIDEO_ID)]
        preset = worker.get_preset("일상")
        with mock.patch.object(worker.editor, "cut_windows", return_value=[(0, 1500, 4000)]), \
                mock.patch.object(worker, "db") as db, \
                mock.patch.object(worker.music, "pick_track", return_value="/bgm/daily/a.mp3") as pick, \
                mock.patch.object(worker.accent_stage, "apply", return_value=("out.mp4", worker.accent_stage.Outcome(True))) as apply:
            db.fetch_accent_inputs = mock.AsyncMock(return_value=({VIDEO_ID: {"places": ["카페"]}}, {VIDEO_ID: [0.01]}))
            result = await worker._apply_accents("with_bgm.mp4", clips, specs, preset, True, 1.5, {"movieId": "m1"}, JOB_ID, "/w",
                                                 "cinematic", "pad_white", {"text": False, "emoji": True, "face": True})
        self.assertEqual(result, "out.mp4")
        pick.assert_called_once_with(preset.bgm_tag, "m1")
        args = apply.call_args.args
        self.assertEqual(args[1], [worker.accent_stage.CutSource(VIDEO_ID, "/w/src_0.mp4", 0, 1500, 4000)])
        self.assertEqual((args[4], args[5], args[6]), ("/bgm/daily/a.mp3", 1500, "m1"))
        self.assertEqual(args[-3:], ("cinematic", "pad_white", {"text": False, "emoji": True, "face": True}))

    async def test_without_music_there_is_no_track_to_follow(self) -> None:
        with mock.patch.object(worker.editor, "cut_windows", return_value=[(0, 1500, 4000)]), \
                mock.patch.object(worker, "db") as db, \
                mock.patch.object(worker.music, "pick_track") as pick, \
                mock.patch.object(worker.accent_stage, "apply", return_value=("in.mp4", worker.accent_stage.Outcome())) as apply:
            db.fetch_accent_inputs = mock.AsyncMock(return_value=({}, {}))
            await worker._apply_accents("in.mp4", [worker.editor.ClipSource("/w/s.mp4")], [mock.Mock(video_id=VIDEO_ID)],
                                        worker.get_preset("일상"), False, 1.5, {}, JOB_ID, "/w", "classic",
                                        "blur_background")
        pick.assert_not_called()
        self.assertIsNone(apply.call_args.args[4])


if __name__ == "__main__":
    unittest.main()
