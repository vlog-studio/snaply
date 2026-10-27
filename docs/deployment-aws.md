# 배포와 운영 — AWS 공모전 서버

**작성일**: 2026-10-08
**상태**: 현행
**원천**: 현행 배포 대상인 AWS 공모전 서버의 설치·배포·시크릿·배치·백업 절차와 이 서버를 보는 테스터 앱. 이 구성을 고른 이유는
[decisions/aws-contest-server.md](./decisions/aws-contest-server.md)
**관련 문서**: [decisions/env-management.md](./decisions/env-management.md) · [backlog.md](./backlog.md) B-8 ·
인프라 구성 · 접속은 사내 위키 "snaply — AWS 구성 · 인프라 접속"(이하 인프라 문서)

---

## 0. 이 서버가 무엇인가

**사내 공모전 테스터용 외부 서버**다. 인프라팀이 만든 EC2 한 대 앞에 공용 ALB 가 있고
(`https://snaply-api.dweaxai.com` → 인스턴스 3000), 영상은 S3, 시크릿은 Secrets Manager 에 있다. 바깥에서
닿으므로 결제 웹훅 · SNS 콜백을 받을 수 있다. **2026년 11월까지** 운영하고 내린다([decisions/aws-contest-server.md](./decisions/aws-contest-server.md)).

앱(api · 워커 4개 · postgres · redis)과 GitHub runner 는 우리가 깔고 운영한다.

| 무엇 | 어디 |
|---|---|
| compose 파일 · 배치 스크립트 · env 파일 · 돌고 있는 이미지 태그 | `/data/compose` — 배포가 채운다 |
| Docker 데이터(이미지 · DB · Redis · whisper 캐시) | `/data/docker` |
| DB 덤프(14일) | `/data/backup` |
| GitHub runner | `/opt/actions-runner` |
| 배치 로그 | `/var/log/snaply` |
| 배포 · 배치를 돌리는 계정 | `snaply` |

**`/data` 만 인스턴스를 교체해도 남고 매일 스냅샷된다.** 나머지(runner · Docker 설정 · cron)는 루트 볼륨이라
교체하면 다시 깐다(§7).

## 1. 설치 — 인스턴스마다 한 번

접속 준비(MFA · 역할 전환 · Session Manager)는 인프라 문서 4~5장. EC2 → 연결 → Session Manager 탭의
"IAM 역할을 가져오지 못했습니다" 는 진단 정보를 읽을 권한이 없다는 뜻일 뿐이다 — **연결** 버튼으로 셸이 열린다.

1. GitHub 저장소 **Settings → Actions → Runners → New self-hosted runner** 에서 등록 토큰을 받는다(1시간 유효).
2. 인스턴스 셸에서:

   ```bash
   sudo dnf install -y git
   git clone --depth 1 https://github.com/vlog-studio/snaply-backend.git /tmp/snaply
   sudo bash /tmp/snaply/deploy/aws/install.sh
   ```

   토큰을 물으면 붙여 넣는다. 하는 일은 [`deploy/aws/install.sh`](../deploy/aws/install.sh) 머리말에 있다 — 패키지
   (cron 은 Amazon Linux 2023 에 기본으로 없다), `snaply` 계정(docker 그룹), Docker data-root 를 `/data/docker` 로
   옮기고 `/data` 마운트를 기다리게 하기(인프라 문서 6-2), runner 설치 · 등록 · 서비스, cron.
3. 저장소 Runners 화면에 `dweax-snaply`(라벨 `snaply-aws` — `deploy-aws` 잡의 `runs-on`)가 **Idle** 이면 끝이다.

다시 돌려도 된다. 앱이 떠 있으면 Docker 는 건드리지 않는다. runner 는 다시 시작되므로 배포 중에는 피한다.

**runner 는 main 의 `deploy.yml`(push)만 받는다.** 저장소가 public 이라 누구나 포크해 PR 을 열 수 있고, 이 호스트에서
돈 작업은 Docker 와 인스턴스 역할(영상 버킷 · 시크릿)을 그대로 갖는다. 작업 전에 도는
[`runner-job-started.sh`](../deploy/aws/runner-job-started.sh)(`/etc/snaply/`, root 소유)가 다른 작업을 거부하고,
사유는 그 작업 로그의 **Set up runner** 에 남는다. 지우거나 느슨하게 하지 않는다.

## 2. 시크릿

값은 Secrets Manager `dweax/service/snaply/env` 하나(키-값 JSON)에 둔다. 넣고 바꾸는 법은 인프라 문서 5-5 —
**받아서 고친 뒤 통째로 올린다.** 한 키만 보내면 나머지가 모두 사라진다.

**콘솔에서는 고칠 수 없다.** snaply 역할에 `DescribeSecret`·`ListSecrets` 가 없어 Secrets Manager 화면이 열리지 않고 CloudShell
도 막혀 있다(2026-10-08). 인프라 문서 4장의 CLI 프로필(`dweax-snaply`)로 내 컴퓨터에서 한다 — 읽기 · 쓰기는 된다.

```bash
(umask 077; aws secretsmanager get-secret-value --profile dweax-snaply --secret-id dweax/service/snaply/env --query SecretString --output text | jq . > ~/snaply-env.json)
nano ~/snaply-env.json        # 값만 고친다. TextEdit 은 따옴표를 바꿔 JSON 을 깨뜨린다
jq -r 'keys[]' ~/snaply-env.json
aws secretsmanager put-secret-value --profile dweax-snaply --secret-id dweax/service/snaply/env --secret-string file://$HOME/snaply-env.json && rm ~/snaply-env.json
```

`POSTGRES_PASSWORD` 와 `SNS_TOKEN_ENCRYPTION_KEY` 는 한 번 정하면 바꾸지 않는다 — Postgres 는 첫 기동 때만 비밀번호를 정하고, 암호화 키가 바뀌면
저장된 SNS 토큰을 못 읽는다.

- **넣는 키**: [`env-spec.ts`](../apps/api/src/env-spec.ts) 에서 `origin` 이 `local` 이 아닌 것 중 쓰는 것과
  `POSTGRES_PASSWORD`(접속 URL 에 들어가므로 영숫자만). 목록의 원천은 그 파일이다.
- **`OPENAI_API_KEY` 는 로컬 개발(`apps/api/.env`)과 다른 키다.** 한쪽이 새거나 폐기돼도 다른 쪽이 살아 있게 한다. 한쪽이 새면
  그쪽 키만 바꾼다 — 로컬을 바꿔도 된다. 둘이 다른지는 값을 꺼내지 않고 해시로 본다(저장소 루트에서, `SAME`/`DIFFERENT` 만 나온다):

  ```bash
  [ "$(aws secretsmanager get-secret-value --profile dweax-snaply --secret-id dweax/service/snaply/env --query SecretString --output text | jq -r .OPENAI_API_KEY | shasum)" = "$(grep '^OPENAI_API_KEY=' apps/api/.env | cut -d= -f2- | shasum)" ] && echo SAME || echo DIFFERENT
  ```

  서버 쪽이 비어 있어도 `DIFFERENT` 다 — 빈 키면 `analysis-worker` 가 기동 단계에서 종료한다(§6).
- **같은 키를 API 도 읽는다(2026-10-13~).** AI 편집 초안의 에이전트(MOV-25)가 이 키로 OpenAI 를 부른다 — API 는 분석 워커와 같은
  시크릿 파일을 읽으므로 따로 넣을 것이 없다. 키가 비면 API 는 정상 기동하고 초안을 규칙만으로 만든다(`movie_drafts.mode` 가 `rules`).
  에이전트 모델은 `EDIT_AGENT_MODEL`(선택, 기본값은 [`env-spec.ts`](../apps/api/src/env-spec.ts))이다. 바꾸면 API 재기동만으로 반영된다(배포 불필요).
- **넣지 않는 키**: compose 가 정한다 — `DATABASE_URL` · `DIRECT_URL` · `REDIS_URL` · `NODE_ENV` · `API_PORT` ·
  `TRUST_PROXY` · `BGM_S3_PREFIX`(편집 워커, §6 "BGM 곡 올리기"). S3 키 · `S3_ENDPOINT` · `S3_PUBLIC_ENDPOINT` · `CLOUDFRONT_DOMAIN` 은 넣어도 ""로 덮인다 — 이 서버는
  인스턴스 역할로만 S3 에 붙는다.
- **빈 값은 배포 때 빠지고 코드의 기본값이 쓰인다.** 그대로 옮기면 빈 `LOG_LEVEL` 은 기동 실패, 빈
  `RATE_LIMIT_GLOBAL_MAX` 는 모든 요청 429 다([`write-env.sh`](../deploy/aws/write-env.sh) 머리말).
- **값에 작은따옴표나 줄바꿈이 있으면 배포가 멈춘다.** `FIREBASE_SERVICE_ACCOUNT_KEY` 는 서비스 계정 JSON 을 base64
  한 줄로 넣는다(`base64 -w0 key.json`, macOS 는 `base64 -i key.json`).
- **외부 연동**(SNS · 결제 · 광고 보상)은 키가 비어 있으면 mock · 꺼짐으로 뜬다. 콘솔에 콜백 · 웹훅 주소
  (`https://snaply-api.dweaxai.com/...`)를 등록한 뒤 키를 넣는다. 틱톡은 `TIKTOK_SCOPES` 를 비우면 코드 기본값
  `user.info.basic,video.publish`(심사 필요한 직접 게시)가 되므로, 심사(C-3) 전에는 `user.info.basic,video.upload` 를
  명시한다([sns-setup.md](./sns-setup.md) §3).

바꾼 값은 다음 배포에 반영된다. 기다리지 않으려면 셸에서 env 파일을 다시 만들고 컨테이너를 다시 올린다(§6 의 셸에서
`deploy/aws/write-env.sh` → `docker compose --env-file .env up -d`).

첫 배포 전에는 `/data/compose/deploy` 가 비어 있다(배포가 채운다). 그때 형식을 미리 보려면 §1 에서 받은 체크아웃의 스크립트를
쓴다 — `sudo -u snaply /tmp/snaply/deploy/aws/write-env.sh` 가 "N개 키를 … 썼다"를 내면 된다.

## 3. 배포

**켜기**: 저장소 **Settings → Variables** 에 `DEPLOY_AWS_ENABLED=true`. 그때부터 main 머지가 이 서버로 배포된다(어느
머지가 배포를 부르는지는 [`deploy.yml`](../.github/workflows/deploy.yml) 의 `paths` 가 정한다 — API · 워커 · 공유 패키지 · compose ·
`deploy/` 가 바뀐 머지만이고, 문서나 모바일만 바꾼 머지는 배포하지 않는다). 첫 배포는 다음 머지를 기다리거나 마지막 Deploy 실행에서
**Re-run** 한다. 저장소가 public 이므로 **Settings → Actions → General** 의 포크 PR 워크플로 승인도 "모든 외부 협업자"로
올려 둔다 — 작업 전 검사와 겹으로 막는다.

```
main 머지
  ↓  GitHub 이 빌려주는 컴퓨터 — 두 잡이 나란히 돈다
     · 같은 커밋의 CI(ci.yml) 가 끝나기를 기다려 성공인지 본다                         (wait-for-ci)
     · 이미지 빌드 → 스모크 검사 → GHCR(커밋 SHA 태그)                                  (build-and-push)
  ↓  둘 다 통과해야 — 이 인스턴스의 runner, deploy.yml 의 deploy-aws
     배포 파일을 /data/compose 로 → 시크릿을 env 파일로 → GHCR 로그인 → pull → 마이그레이션 → up → 태그 기록
     → /health 가 db=connected 인지 → 72시간 넘은 이미지 정리
```

- **GitHub 에 AWS 키를 두지 않는다.** runner 가 GitHub 쪽으로 먼저 연결해 일을 받아오고(나가는 연결만), 시크릿은
  인스턴스 역할로 읽는다. GHCR 패키지는 비공개라 잡마다 주어지는 토큰으로 받는다.
- **CI 가 실패한 커밋은 배포하지 않는다.** `wait-for-ci` 가 같은 커밋의 CI 실행을 찾아(없으면 최대 10분, 끝날 때까지 최대
  60분) 결론이 성공이 아니면 실패하고, `deploy-aws` 는 돌지 않는다. CI 를 고친 다음 커밋이 다시 배포를 부른다. CI 의
  `workflow_run` 으로 배포를 띄우지 않은 것은, 그 이벤트에는 `paths` 를 걸 수 없어 앱만 바꾼 커밋도 배포되고 이 runner 가
  push 로 뜬 작업만 받기 때문이다(작업 전 검사). 배포 경로는 모두 CI 의 `paths-ignore`(문서 · 마크다운) 밖이라 배포되는
  커밋에는 CI 가 반드시 돈다. 실패한 CI 를 Re-run 해 성공하면, Deploy 의 실패한 잡도 Re-run 하면 된다.
- **마이그레이션이 먼저다.** 실패하면 거기서 멈추고 이전 버전이 계속 돈다.
- **`deploy/` 를 고친 커밋도 서버에서 따로 할 일이 없다** — 배포가 `/data/compose` 로 덮어쓴다(서버에서 `git pull` 하지 않는다).
- **되돌리기**: 이전 커밋의 Deploy 실행에서 `Deploy to the AWS server` 잡을 Re-run 한다. 마이그레이션은 되돌아가지
  않으므로 스키마를 바꾼 배포라면 이전 코드와 호환되는지 먼저 본다.

## 4. 배치

`/etc/cron.d/snaply` 가 [`deploy/batches.cron`](../deploy/batches.cron) 과 **같은 시각**으로 돈다 —
[`render-cron.sh`](../deploy/aws/render-cron.sh) 가 경로와 compose 파일만 바꿔 깐다 — **시각과 순서의 원천은 그 파일 하나**다.
로그는 `/var/log/snaply/*.log`.

| 무엇 | 로그 |
|---|---|
| DB 백업 | `backup.log` |
| 만료 정리(스냅 · 결과물 · 남은 객체 · 7일 지난 위치 알림 이력) | `purge-expired.log` |
| 계정 실삭제 | `accounts-purge.log` |
| pending 영상 회수 | `purge-pending.log` |
| **만료 예고 알림**(스냅 D-3 · D-1, 끝내지 않은 무비 결과물 D-3) | `notify-expiring.log` |

**예고와 정리를 같은 시각에 묶지 않는다.** 조용한 시간대(22–08시)에 보낸 예고는 발송되지 않고 버려지고,
그러면 예고 없는 삭제가 된다([decisions/expiry-notice-schedule.md](./decisions/expiry-notice-schedule.md)).
배치는 하나라도 빠뜨리면 배포는 성공하고 에러도 없이 알림이 영영 안 가거나 파일이 무한히 쌓인다.

손으로 한 건 돌릴 때(배치는 `--yes` 가 붙어 실제로 지운다):

```bash
sudo -u snaply env COMPOSE_FILE=docker-compose.aws.yml SNAPLY_ENV_FILE=/data/compose/.env /data/compose/deploy/run-batch.sh media:purge-expired
```

만료 예고(`media:notify-expiring`)는 `FIREBASE_SERVICE_ACCOUNT_KEY` 가 없거나 깨졌으면 시작하지 않고 실패로 끝난다 — 그때
FCM 은 dry-run 으로 떨어지는데, 보내지 않은 예고를 보냈다고 기록하지 않기 위해서다.

## 5. 백업

- 매일(시각은 [`deploy/batches.cron`](../deploy/batches.cron)) `pg_dump` → `/data/backup`, 14일 보관. `/data` 볼륨은 인프라가 매일 스냅샷한다(7개).
- **S3 영상은 백업이 없다.** 버킷의 버전 관리가 꺼져 있어 지운 영상은 되돌릴 수 없다 — 공모전 서버라 두지 않기로 했다(2026-10-11, [decisions/aws-contest-server.md](./decisions/aws-contest-server.md)).
- 볼륨째 되돌리는 것은 인프라에 요청한다. 덤프로 DB 만 되돌리는 법은 아래.

### 덤프로 DB 되돌리기

덤프는 `pg_dump` 기본값이라 `DROP` 이 없다 — **데이터가 있는 DB 에 부으면 섞인다.** 그래서 DB 를 지우고 새로 만든 뒤 붓는다.
덤프 뒤에 생긴 데이터(스냅 · 무비 · 크레딧)는 사라지고, S3 에는 그 사이 올라온 영상이 행 없이 남는다. §6 의 셸에서 한다.
배치 시각([`deploy/batches.cron`](../deploy/batches.cron))은 피한다.

```bash
docker compose --env-file .env stop api ai-worker analysis-worker rendition-worker notification-worker
docker compose --env-file .env exec -T postgres dropdb -U postgres snaply
docker compose --env-file .env exec -T postgres createdb -U postgres snaply
gunzip -c /data/backup/snaply-<YYYYMMDD-HHMMSS>.sql.gz | docker compose --env-file .env exec -T postgres psql -U postgres -d snaply -v ON_ERROR_STOP=1 -q
docker compose --env-file .env exec -T postgres psql -U postgres -d snaply -tAc "SELECT count(*), max(migration_name) FROM _prisma_migrations"
docker compose --env-file .env up -d
```

- 다섯째 줄의 마이그레이션 수 · 마지막 이름이 저장소(`apps/api/prisma/migrations`)보다 뒤처졌으면 마지막 배포를 Re-run 한다 — 배포가
  마이그레이션을 먼저 적용한다(§3). 덤프보다 새 코드가 이미 돌고 있었다는 뜻이다.
- `up -d` 뒤 `curl -s localhost:3000/health` 가 `db=connected` 인지 본다.

**리허설은 운영 DB 를 건드리지 않고 한다** — 다른 이름의 DB 에 부어 보고 지운다. 2026-10-11 에 한 번 했다(최근 덤프 32K, 붓기 0.7초,
행 수 · 마이그레이션 일치 — [progress.md](./progress.md) 2026-10-11 "DB 복구 리허설 · 용량 실측"). 위의 실제 되돌리기 순서는 아직 운영에서 돌린 적이 없다.

```bash
docker compose --env-file .env exec -T postgres createdb -U postgres snaply_restore_check
gunzip -c /data/backup/snaply-<YYYYMMDD-HHMMSS>.sql.gz | docker compose --env-file .env exec -T postgres psql -U postgres -d snaply_restore_check -v ON_ERROR_STOP=1 -q
docker compose --env-file .env exec -T postgres dropdb -U postgres snaply_restore_check
```

## 6. 자주 볼 것

`snaply` 계정의 셸을 열고 compose 가 쓸 값을 읽어 둔다(이미지 태그는 `:?` 라 없으면 compose 가 멈춘다).

```bash
sudo -iu snaply
cd /data/compose && set -a && . deploy/.current-images && set +a && export COMPOSE_FILE=docker-compose.aws.yml
docker compose --env-file .env ps
docker compose --env-file .env logs -f --tail=100 api
curl -s localhost:3000/health
```

| 증상 | 볼 곳 |
|---|---|
| 배포 잡이 대기열에서 안 움직인다 | runner 가 꺼져 있다 — `systemctl status "$(cat /opt/actions-runner/.service)"` |
| 배포 잡이 Set up runner 에서 실패 | 작업 전 검사가 거부했다 — main 의 `deploy.yml` 이 아닌 작업이다 |
| Write the secrets file 에서 실패 | 값에 작은따옴표 · 줄바꿈이 있거나, 키 이름이 env 변수 형식이 아니거나, `POSTGRES_PASSWORD` 가 비었다(§2) |
| `analysis-worker` 가 재시작을 반복 | `OPENAI_API_KEY` 가 없다(의도된 동작) |
| 도메인이 502 · 디스크 · presigned URL 의 `ExpiredToken` | 인프라 문서 8장 |
| WebSocket 이 끊김 | 서버가 30초마다 ping 을 보내 ALB 유휴 제한(180초)을 넘기지 않는다(2026-10-09). 그래도 끊기면 앱이 다시 붙는다 — 인프라 문서 8장 |

### 용량 (2026-10-11 실측)

| 상태 | CPU | 메모리 |
|---|---|---|
| 유휴 | 컨테이너 모두 1% 아래, load average 0.01 ~ 0.04 | 7.6GiB 중 약 1GiB 사용 · 6.3GiB 여유, 컨테이너 합 약 350MiB |
| 렌더 중(24초 무비, 5초 스냅 여러 개) | `ai-worker` 196% — 2 vCPU 를 거의 다 쓴다 | `ai-worker` 1.23GiB |

- 24초 무비 하나의 렌더는 66 ~ 71초 걸렸다. 렌더 동안 서버가 차지만, 편집 워커는 작업을 하나씩 받아 여러 사용자의 생성은
  대기열에서 차례를 기다린다(쓰러지지 않는다). **동시성은 1 로 둔다** — 렌더가 CPU 에 묶여 올려도 처리량이 늘지 않는다
  ([decisions/aws-contest-server.md](./decisions/aws-contest-server.md) 2026-10-11).
- **추가 요금선(24시간 평균 CPU 30%)** 은 하루 약 51,840 vCPU · 초다. 렌더 한 편이 약 140 vCPU · 초라 **하루 약 350편** 까지는 그 아래다
  (렌디션 · 분석은 따로 재지 않았다). 실제 사용량은 EC2 콘솔 → 인스턴스 → 모니터링의 CPUUtilization 24시간 평균으로 본다.
- **무비 최대 길이** — 컷 상한이 20(최대 100초)이 된 뒤(2026-10-20), 최대 길이 무비의 렌더는 위 24초 무비의 약 4배(약 5분)로 보고 하루 약 90편이
  추가 요금선 아래다. 워커 이미지를 2 CPU 로 묶은 합성 스냅 실측의 비율이고, 컷을 잇는 단계의 `ai-worker` 메모리는 20컷에 약 2.0GB 였다.
- **이 서버의 20컷 실측(2026-10-26)** — 휴대폰 영상에서 가져온 3초 스냅 20개(60초 무비, 스타일 일상 · classic): 대기 0초 · **렌더 435초**(제한 600초의
  73%), `ai-worker` 최고 **973MiB**(2초 간격 `docker stats`), CPU 최고 약 195%. 렌더 내내 2 vCPU 를 거의 다 쓴다고 보면 한 편이 약 830 vCPU · 초라
  **추가 요금선 아래는 하루 약 60편**이다(위 추정 90편보다 적다). 5초 스냅 20개(100초)의 최대 길이는 재지 않았다 — 길이에 비례하면 600초를 넘을 수 있어
  `EDIT_TIMEOUT_SECONDS` 를 다시 볼 근거다(progress 2026-10-26 "공모전 지표 실측"). 그래서 2026-10-27 제한을 **900초**로 올렸다(약 720초 추정에 25%
  여유, [decisions/aws-contest-server.md](./decisions/aws-contest-server.md) 2026-10-27) — 실측은 backlog A-18 에 남았다.
- 디스크는 `/data` 50G 중 4.7G. 이미지가 17개 4.2GB 이고 그중 3.8GB 가 지난 배포의 것인데, 배포가 72시간 지난 이미지를 지워(§3) 46G 여유에
  비하면 지금 주기로 충분하다.

### BGM 곡 올리기

곡은 git 에 없어 배포 이미지에 들어가지 않는다. 편집 워커(`ai-worker`)는 영상 버킷의 `assets/bgm/` 에서 받아 온다
(compose 의 `BGM_S3_PREFIX`, `apps/ai-worker/src/pipeline/music.py` 의 `sync_library`). 공모전용 곡은 무료 라이선스 9곡으로 정했다
([decisions/bgm-sourcing.md](./decisions/bgm-sourcing.md) "공모전 기간").

- 버킷에 `assets/bgm/manifest.json` 과 `assets/bgm/<tag>/<file>` 을 올린다. `tag` 는 `calm`(감성) · `upbeat`(여행) · `daily`(일상).
  매니페스트는 `{"tracks": [{"tag": "calm", "file": "a.mp3", "title": "…", "source": "…", "licenseUrl": "…", "checkedAt": "2026-10-15"}]}` —
  `tag` · `file` 만 워커가 읽고, 나머지는 곡마다의 라이선스 기록이다.
- 워커는 작업을 받을 때 매니페스트를 보고(10분에 한 번까지) 없는 곡을 받고 빠진 곡을 지운다. 재시작은 필요 없다. 같은 이름의 곡은 다시 받지
  않으므로 **곡을 바꿀 때는 새 이름으로** 올린다.
- 매니페스트를 읽지 못하면 있는 곡으로(없으면 BGM 없이) 렌더하고 Sentry 에 남긴다 — 음악 때문에 무비가 실패하지 않는다.
- 곡을 고르는 규칙(무비마다 고정, 곡 수가 바뀌면 결과가 바뀔 수 있다)은 [BGM 라이브러리 README](../apps/ai-worker/assets/bgm/README.md#디렉터리-구조)다.
- `assets/` 는 정리 배치(§4 · 계정 삭제)가 지우는 `uploads/` 밖이다.
- **올리는 길** — 담당자 역할(`dweax-snaply`)로는 버킷 안의 파일을 읽고 쓸 수 없고, 서버에 명령을 바로 보내는 `AWS-StartNonInteractiveCommand` 도 막혀 있다
  (대화형 셸만 된다). 2026-10-27 에는 서버 셸(`aws ssm start-session`)에서 `ai-worker` 컨테이너로 지금 매니페스트와 15분짜리 업로드 주소(presigned PUT)를
  받아 내 컴퓨터에서 곡 → 매니페스트 순으로 올렸다. 곡 파일은 저장소가 public 이라 GitHub(릴리스 · 아티팩트)으로 옮기지 않는다 — 재배포가 된다.
  CLI 프로필의 MFA 는 가상 MFA(인증 앱)여야 한다 — 보안 키 · 패스키(`u2f`)는 CLI 역할 전환에 쓸 수 없다.

### 실측 — 스냅 분석 · AI 편집 초안(backlog A-3 · A-12 · A-14)

공모전 지표는 이 서버의 기록으로 낸다 — 로컬 `apps/api/.env` 에는 OpenAI 키가 없다. 실측 전용 계정 하나에 팀 스냅을 모아 분석 · 추천 · 초안을 돌리고,
[`deploy/aws/measure.sql`](../deploy/aws/measure.sql) 로 집계한다(읽기만 한다). 준비는 이 순서다.

1. **예산 상한(오너)** — 서버 키가 속한 OpenAI 프로젝트에 월 사용 한도를 건다(backlog D-6). 실측 규모는 분석 100편(편당 약 0.6원) ·
   초안 20~30회(회당 약 15~20원 추정)라 몇천 원 수준이다 — 한도는 사고를 막는 값으로 넉넉히 둔다. rate limit 등급도 같은 화면에서 본다.
2. **분석 켜기(오너)** — §2 의 방법으로 시크릿에 `MOVIE_RECOMMENDATION_ENABLED=true` 를 넣고 마지막 배포를 Re-run 한다. 켜도 **분석에 동의한 사용자의
   스냅만** 모델로 간다(ANA-5) — 동의하지 않은 테스터는 지금과 같다. 켜지면 앱 나 탭의 `스냅 분석` 이 `준비 중` 에서 켤 수 있는 상태로 바뀐다.
3. **실측 계정(오너)** — 테스터 앱으로 새 계정을 만든다(다른 테스터 · 검수 계정과 섞지 않는다). 나 탭에서 `스냅 분석` 에 동의하고, 관심사는 고르지 않는다
   (A-14 의 "새 계정과 취향이 쌓인 계정" 비교를 남겨 두기 위해서다). 사용자 id 는 §8 의 첫 쿼리로 찾는다.
4. **스냅(팀)** — 팀원 폰으로 30~100편을 찍어 이 계정으로 올린다. 카테고리를 일부러 채운다: 음식 · 셀카 · 반려동물 · 빠른 움직임 · 야간 · 역광 · 흔들림 ·
   초점 불량 · 비슷한 장면 연속 · 한 스냅 안의 장면 전환([plans/snap-analysis-recommendation-rollout.md](./plans/snap-analysis-recommendation-rollout.md) §4.1).
   초안용으로 **한 외출에 10편 이상**인 묶음을 여러 개 만든다(카페 · 산책 · 나들이처럼 템플릿과 겹치게). 원본 · 프레임 · 모델 응답은 저장소에 넣지 않는다.
5. **크레딧(운영자)** — 초안 20~30회(무료 3회 뒤 20크레딧) · 무비 생성 몇 편을 하려면 가입 보너스 500 으로 모자란다. §8 의 `promo` 로 1,000 정도 넣는다.
6. **돌리기(팀)** — 앱에서 템플릿 추천(템플릿 화면을 열면 후보 분석이 적재된다)과 `스냅 골라 자동 편집` 을 외출마다 돌린다. 초안은 **20회 이상**(A-14 표본),
   몇 번은 `편집하는 중…` 이 보인 시간을 손으로 잰다.
7. **집계(누구나 · §6 의 셸)**:

   ```bash
   docker compose --env-file .env exec -T postgres psql -U postgres -d snaply -v uid=<USER_ID> < deploy/aws/measure.sql > ~/measure-$(date +%F).txt
   ```

   스냅 분석의 상태 · 모델별 지연과 토큰 · 실패 사유 · 프레임 수, 사람 채점용 분석 결과 표, 초안의 모드별 지연 · 왕복 · 토큰 · 에이전트 성공률 · 첫 검토 통과율과
   재시도 · 초점 · 분위기를 쓴 비율, 초안마다 에이전트와 분석의 토큰이 나온다. 원 환산(모델 단가 · 환율)은 그날 값으로 따로 한다. 결과 파일은 저장소에 넣지
   않고, 숫자만 [progress.md](./progress.md) 에 표본 · 날짜와 함께 옮긴다.
8. **사람 채점(팀)** — 채점용 표의 스냅마다 요약 사실성 · 핵심 사물/행동 포함 · 환각 · `usableForEdit` 정확도를 매긴다(A-3 "품질 · 단가 기준선").

## 7. 인스턴스를 교체하면

`/data` 는 그대로 다시 붙는다(DB · 이미지 · env 파일 · 태그가 남는다). §1 을 다시 하고(토큰은 새로 받는다) 마지막 배포를
Re-run 한다. 같은 이름(`dweax-snaply`)으로 등록하므로 예전 등록은 새 runner 가 이어받는다.

## 8. 테스터 앱

이 서버를 보는 Android 앱이다. 주소가 `https` 라 release 빌드가 그대로 닿는다(release 는 `http://` 를 막는다).
`EXPO_PUBLIC_API_BASE_URL` 은 번들에 박히고, 셸에서 준 값이 `apps/mobile/.env` 보다 앞선다.

`apps/mobile/app.json` 이나 `apps/mobile/plugins/` 가 바뀐 뒤에는 먼저 `cd apps/mobile && npx expo prebuild --clean --platform android` 로
`android/` 를 다시 만들고 `android/local.properties` 를 되살린다([함정](../apps/mobile/docs/workflows/app-branding-and-native-config.md#known-pitfalls-all-observed-on-this-project)).
아래 Gradle 명령은 있는 `android/` 를 그대로 빌드하므로, 건너뛰면 APK 에 체리 스플래시 · 최소 Android 9 · 종이 창 배경 · Android 16 대화면 세로 고정이 빠진다.

```bash
cd apps/mobile/android && EXPO_PUBLIC_API_BASE_URL=https://snaply-api.dweaxai.com ./gradlew app:assembleRelease -x lint -x test
```

```bash
unzip -p app/build/outputs/apk/release/app-release.apk assets/index.android.bundle | grep -ao 'https://snaply-api.dweaxai.com'
```

두 번째 명령이 주소를 한 줄 내면 된다. 휴대폰에는 `npm run android:device:install -w snaply-app -- --variant release --apk <APK 경로>`
로 깐다(`.env` 의 `http://` 경고는 이 APK 와 무관하다).

- **나눠 줄 APK 는 출력 폴더 밖에 둔다.** 다음 Gradle 빌드가 `release/` 를 비운다.
- **개발용 앱을 대체한다.** 패키지가 같아 덮어 깔리고, 로그인과 기기의 라이브러리가 남는다. 라이브러리는 계정으로만 나뉘고 서버로는
  나뉘지 않으므로, 로컬 서버에서 쓰던 계정으로 이 서버를 보면 두 서버의 스냅이 섞인다 — 테스터 앱에는 별도 계정을 쓴다. 이미 로그인돼
  있으면 비행기 모드에서 앱을 열어 로그아웃한 뒤 바꾼다. 개발용으로 돌아갈 때는 `npm run android:device:install -w snaply-app`.
- **테스터 크레딧은 가입 보너스로 준다.** 광고 보상은 꺼져 있고 결제는 mock 이라, 시크릿에 `CREDIT_SIGNUP_BONUS=500`
  을 둔다(§2). 지급 규칙(계정마다 한 번 등)은 [specs/credits-and-payment.md](./specs/credits-and-payment.md) CRD-8 이다.
  더 줘야 하는 테스터는 §6 의 셸에서 사용자 id 를 찾아 `promo` 를 넣는다:

  ```bash
  docker compose --env-file .env exec -T postgres psql -U postgres -d snaply -c "SELECT u.id, u.nickname, count(v.id) AS snaps, max(v.created_at) AS last_upload FROM users u LEFT JOIN videos v ON v.user_id = u.id GROUP BY u.id ORDER BY last_upload DESC NULLS LAST;"
  ```

  ```bash
  docker compose --env-file .env exec -T postgres psql -U postgres -d snaply -c "INSERT INTO credit_ledger (id, user_id, delta, reason) VALUES (gen_random_uuid(), '<USER_ID>', 500, 'promo');"
  ```

### EAS 로 빌드해 링크로 나눠 주기

Android SDK 가 없는 컴퓨터에서도 만들 수 있고, 결과가 설치 링크라 테스터에게 그대로 보낸다. iOS 는 유료 Apple Developer 계정이 없어
만들지 않는다(backlog B-8). 빌드 명령 · 서명 · `eas init` 주의는 모바일 문서
[Tester build against the AWS contest server](../apps/mobile/docs/workflows/local-development-and-testing.md#tester-build-against-the-aws-contest-server--tester-profile)가 원천이다.

| 무엇 | 어디 |
|---|---|
| 빌드 프로필 | [`apps/mobile/eas.json`](../apps/mobile/eas.json) 의 `tester` — 내부 배포 APK, `EXPO_PUBLIC_API_BASE_URL=https://snaply-api.dweaxai.com` |
| EAS 프로젝트 | Expo 계정 `dayomi` 의 `snaply-app` (`app.json` 의 `owner` · `extra.eas.projectId`) |
| Supabase 클라이언트 값 | EAS 프로젝트 환경변수(`preview` 환경) `EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_ANON_KEY` — 공개 저장소라 `eas.json` 에 두지 않는다 |

- **Supabase 값은 서버와 같은 프로젝트여야 한다.** 서버 시크릿의 `SUPABASE_URL` 과 같은 프로젝트의 URL, 그 프로젝트 대시보드
  (Project Settings → API Keys)의 publishable 또는 anon 키를 넣는다. 서버는 anon 키가 없어도 된다(JWKS 로 검증) —
  시크릿에 없다고 앱도 비워 두면 로그인이 안 된다.
