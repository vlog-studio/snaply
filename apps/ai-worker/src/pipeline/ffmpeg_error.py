"""ffmpeg 가 실패했을 때 원인이 남는 오류 문구(backlog E-64 ①).

오류에는 stderr 의 끝만 싣는다. 진행 표시줄(`frame=… speed=…`)이 그 자리를 채우면 원인이 잘려 나가므로 ffmpeg 는
`-nostats` 로 돌린다(`no_stats`). 메모리가 모자라 커널이 ffmpeg 를 죽이면 stderr 에는 아무 말도 남지 않는다 — 그래서
종료 코드 · 신호를 문구 끝에 붙인다(작업 실패 기록은 문구의 앞을, 로그 몇 곳은 끝을 자르므로 원인은 끝에, 문구는 짧게).
"""

import signal

STDERR_TAIL = 800


def no_stats(cmd: list[str]) -> list[str]:
    """ffmpeg 명령이면 진행 표시줄을 끈다. 이미 끈 명령 · ffmpeg 가 아닌 명령은 그대로."""
    if not cmd or cmd[0] != "ffmpeg" or "-nostats" in cmd:
        return cmd
    return [cmd[0], "-nostats", *cmd[1:]]


def exit_status(returncode: int) -> str:
    """`subprocess` 의 종료 코드를 읽는 말로. 음수는 프로세스를 끝낸 신호다."""
    if returncode >= 0:
        return f"exit {returncode}"
    try:
        name = signal.Signals(-returncode).name
    except ValueError:
        return f"signal {-returncode}"
    if -returncode == signal.SIGKILL:
        return f"{name} — 메모리 부족으로 강제 종료됐을 수 있다"
    return name


def describe(returncode: int, stderr: str, tail: int = STDERR_TAIL) -> str:
    """stderr 의 끝과 종료 상태. 부르는 쪽이 `"ffmpeg 실패: " + describe(...)` 처럼 앞말을 붙인다."""
    text = stderr.strip()[-tail:]
    status = exit_status(returncode)
    return f"{text} ({status})" if text else status
