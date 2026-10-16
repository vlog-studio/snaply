import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { MOVIE_RESULT_RETENTION_DAYS, SNAP_RETENTION_DAYS } from '../services/retention-policy.js';

/**
 * 플랫폼 콘솔(틱톡 Login Kit, Meta 앱 검수)이 요구하는 공개 페이지.
 *
 * 인스타·틱톡 모두 앱 설정을 **저장**하는 단계에서 서비스 URL·이용약관·개인정보처리방침
 * URL 을 필수로 받는다. 그래서 로컬 터널로도 접근 가능한 최소 페이지를 API 가 직접 서빙한다.
 *
 * ⚠️ 아래 문서는 **출시 전 초안**이다. 실제 수집 항목을 코드 기준으로 정확히 기술했지만
 * 법률 검토를 받지 않았다. 앱 심사 제출·서비스 출시 전에 반드시 법무 검토를 거쳐 교체할 것.
 *
 * 영상 내용 분석은 **분석에 동의한 사용자에게만** 켤 수 있다(옵트인 — docs/decisions/snap-content-analysis.md
 * §6.1, specs ANA-5). 그래서 "동의한 경우에만"·철회 문장은 지금 이미 사실이어야 한다 — legal.test.ts 가 본다.
 *
 * 남은 법무 항목은 docs/backlog.md D-2.
 */

const SERVICE = 'Snaply';
const DEFAULT_CONTACT = 'support@snaply.app';
const UPDATED = '2026-10-11';

/**
 * 플랫폼의 URL 소유권 검증용 메타 태그.
 *
 * 틱톡·Meta 등은 약관/개인정보 URL 이나 영상 URL prefix 의 소유권 검증을 요구한다.
 * DNS TXT 방식은 우리가 도메인을 소유하지 않는 개발 터널에서는 불가능하므로,
 * 서빙하는 페이지에 메타 태그를 넣거나(아래) 검증 파일을 서빙하는(verificationFile) 방식을 쓴다.
 *
 * 형식: `name=content` 를 콤마로 구분.
 * 예: SITE_VERIFICATION_META="tiktok-developers-site-verification=abc123"
 */
function verificationMetaTags(): string {
  const raw = process.env.SITE_VERIFICATION_META;
  if (!raw) {
    return '';
  }
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf('=');
      if (idx <= 0) return '';
      const name = pair.slice(0, idx).trim();
      const content = pair.slice(idx + 1).trim();
      return `<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`;
    })
    .filter(Boolean)
    .join('\n');
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 문의처. `LEGAL_CONTACT_EMAIL` 은 쉼표로 여러 주소를 받고, 한 줄에 하나씩 메일 링크로 보인다.
 * 요청마다 읽는다 — 시크릿을 바꾼 뒤 다시 띄우면 바로 반영되고, 테스트가 값을 바꿀 수 있다.
 */
function contactHtml(): string {
  const emails = (process.env.LEGAL_CONTACT_EMAIL ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email !== '');
  return (emails.length > 0 ? emails : [DEFAULT_CONTACT])
    .map((email) => `<p><a href="mailto:${escapeAttr(email)}">${escapeAttr(email)}</a></p>`)
    .join('\n');
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${verificationMetaTags()}
<title>${title} · ${SERVICE}</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 720px; margin: 0 auto; padding: 2rem 1.25rem 4rem;
         font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; }
  .meta { color: #888; font-size: .85rem; margin-bottom: 2rem; }
  .draft { border-left: 3px solid #d97706; background: rgba(217,119,6,.08);
           padding: .75rem 1rem; margin: 1.5rem 0; font-size: .9rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: .92rem; }
  th, td { border: 1px solid rgba(128,128,128,.35); padding: .5rem .6rem; text-align: left; vertical-align: top; }
  code { font-size: .9em; }
  a { color: inherit; }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="meta">${SERVICE} · 최종 수정 ${UPDATED}</p>
<div class="draft"><strong>출시 전 초안입니다.</strong> 개발·심사 준비 단계에서 사용하는 문서이며,
법률 검토를 거쳐 정식 문서로 교체될 예정입니다.</div>
${body}
<h2>문의</h2>
${contactHtml()}
</body>
</html>`;
}

export async function legalRoutes(app: FastifyInstance): Promise<void> {
  /**
   * 검증 파일 서빙.
   *   SITE_VERIFICATION_FILE_NAME=tiktokAbc123.txt
   *   SITE_VERIFICATION_FILE_CONTENT=<파일에 들어갈 문자열>
   *
   * 플랫폼의 검증 방식이 두 가지라 경로도 두 곳에서 받는다:
   *  - **domain** 검증 → 파일이 도메인 루트에 있어야 한다        → `/<파일명>`
   *  - **URL prefix** 검증 → 파일이 그 prefix 아래 있어야 한다    → `/legal/<파일명>`
   *    (약관·개인정보 URL 을 검증할 때 prefix 는 보통 `.../legal/` 이 된다)
   *
   * 설정된 파일명이 아니면 404 로 흘려보낸다. Fastify 는 정적 경로를 파라미터 경로보다
   * 우선하므로 /health, /legal/terms 같은 기존 경로에는 영향이 없다(테스트로 고정).
   */
  const serveVerificationFile = async (
    request: FastifyRequest<{ Params: { filename: string } }>,
    reply: FastifyReply,
  ): Promise<unknown> => {
    const expected = process.env.SITE_VERIFICATION_FILE_NAME;
    const content = process.env.SITE_VERIFICATION_FILE_CONTENT;
    if (!expected || !content || request.params.filename !== expected) {
      return reply.callNotFound();
    }
    return reply.type('text/plain; charset=utf-8').send(content);
  };

  for (const path of ['/:filename', '/legal/:filename']) {
    app.get<{ Params: { filename: string } }>(
      path,
      { schema: { tags: ['system'], summary: '플랫폼 URL 소유권 검증 파일' } },
      serveVerificationFile,
    );
  }

  // 서비스 소개 (콘솔의 Web/Desktop URL 용)
  app.get('/', { schema: { tags: ['system'], summary: '서비스 소개' } }, async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(
      page(
        `${SERVICE} — 숏폼 브이로그 AI 자동 편집`,
        `<p>${SERVICE}는 사용자가 촬영한 짧은 영상 클립을 자동으로 편집해
         숏폼 브이로그를 만들어 주는 모바일 서비스입니다. 컷 편집·배경음악·자막을 자동으로 넣고,
         완성된 영상을 사용자가 원하면 인스타그램 릴스나 틱톡에 올릴 수 있습니다.</p>
         <h2>주요 기능</h2>
         <ul>
           <li>여러 영상 클립을 하나의 숏폼 영상으로 자동 편집</li>
           <li>스타일 프리셋(감성·여행·일상)에 따른 색보정·전환·배경음악</li>
           <li>음성 인식 기반 자동 자막</li>
           <li>사용자가 연동한 SNS 계정으로 완성본 업로드</li>
           <li>관심 장소 근처에서 촬영을 제안하는 위치 알림</li>
         </ul>
         <h2>문서</h2>
         <ul>
           <li><a href="/legal/terms">이용약관</a></li>
           <li><a href="/legal/privacy">개인정보처리방침</a></li>
         </ul>`,
      ),
    );
  });

  app.get('/legal/terms', { schema: { tags: ['system'], summary: '이용약관' } }, async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(
      page(
        '이용약관',
        `<h2>1. 서비스 내용</h2>
         <p>${SERVICE}는 사용자가 업로드한 영상 클립을 자동 편집하고, 사용자의 요청이 있을 때
         사용자가 연동한 외부 플랫폼(인스타그램·틱톡)에 결과물을 업로드하는 기능을 제공합니다.</p>

         <h2>2. 계정</h2>
         <p>서비스 이용에는 계정이 필요합니다. 계정 정보의 관리 책임은 사용자에게 있습니다.</p>

         <h2>3. 콘텐츠에 대한 권리와 책임</h2>
         <ul>
           <li>사용자가 업로드한 영상의 저작권은 사용자에게 있습니다. ${SERVICE}는 편집·저장·
               사용자가 지시한 업로드를 수행하기 위한 범위에서만 콘텐츠를 처리합니다.</li>
           <li>타인의 권리를 침해하거나 법령·외부 플랫폼 정책에 위반되는 콘텐츠를 업로드해서는 안 됩니다.</li>
           <li>외부 플랫폼에 업로드할 때에는 해당 플랫폼의 약관이 함께 적용됩니다.</li>
         </ul>

         <h2>4. SNS 연동</h2>
         <p>사용자가 명시적으로 연동을 승인한 계정에 대해서만, 사용자가 업로드를 요청한 영상에 한해
         게시합니다. 연동은 언제든지 해제할 수 있으며, 해제 시 저장된 접근 토큰과 게시 기록에 남은 그 서비스의 값(게시물 ID 등)은 삭제됩니다.</p>

         <h2>5. 영상 내용 분석과 자동 추천</h2>
         <p>무비를 만들 때 어떤 영상을 넣을지 제안하기 위해, 사용자가 후보로 지정한 영상에서
         대표 장면 이미지를 뽑아 외부 AI 사업자에게 보내 내용을 분석합니다. 분석은
         <strong>사용자가 동의한 경우에만</strong> 이루어지며, 동의하지 않아도 추천 없이 같은 기능을
         쓸 수 있습니다. 동의는 앱에서 언제든 철회할 수 있습니다. 업로드한 모든
         영상을 분석하지는 않으며, 분석은 사용자가 제작을 시작한 시점의 후보에만 이루어집니다.
         전송 범위와 보관에 관한 자세한 내용은 개인정보처리방침에 있습니다.</p>
         <p>분석 결과는 추천을 만들기 위한 내부 근거로만 사용하며 화면에 표시하지 않습니다.
         추천은 제안일 뿐이고 어떤 영상을 쓸지는 사용자가 정합니다. 추천에는 크레딧이
         차감되지 않습니다.</p>

         <h2>6. 크레딧 결제</h2>
         <p>영상 제작에는 크레딧이 사용되며, 크레딧은 앱 내 인앱결제(App Store · Google Play)로만
         구매할 수 있습니다. 결제와 환불은 각 스토어의 정책에 따라 처리되고 ${SERVICE}는 카드
         정보를 저장하지 않습니다. 정기 구독 상품은 제공하지 않습니다.</p>
         <p>제작을 요청하면 크레딧이 차감되며, 제작이 실패하거나 사용자가 취소한 경우에는 차감된
         크레딧을 돌려드립니다. 스토어를 통해 결제가 환불되면 지급된 크레딧은 회수됩니다.
         구매한 크레딧은 현금으로 환급하거나 타인에게 양도할 수 없으며, 계정을 삭제하면 남은
         크레딧은 소멸합니다.</p>
         <p>광고를 끝까지 보면 크레딧을 받을 수 있습니다. 하루에 받을 수 있는 횟수에는 제한이 있고,
         광고 제공자가 시청 완료를 확인한 경우에만 지급됩니다.</p>

         <h2>7. 영상의 보관</h2>
         <p>업로드한 영상 클립은 업로드 후 ${SNAP_RETENTION_DAYS}일 동안, 정리하지 않은 편집 결과물은 만든 뒤
         ${MOVIE_RESULT_RETENTION_DAYS}일 동안 서버에 보관되고 그 뒤 삭제됩니다. 편집 결과물은 다운로드하거나
         게시해 정리하면 바로 삭제됩니다. 오래 남기려면 기기에 저장해 주세요. 자세한 내용은
         개인정보처리방침에 있습니다.</p>

         <h2>8. 서비스 변경 및 중단</h2>
         <p>서비스 내용은 변경될 수 있으며, 중요한 변경은 사전에 공지합니다.</p>

         <h2>9. 책임의 한계</h2>
         <p>자동 편집 결과물의 품질, 외부 플랫폼의 정책 변경이나 장애로 인한 업로드 실패 등
         ${SERVICE}의 통제 범위를 벗어난 사유에 대해서는 책임이 제한될 수 있습니다.</p>`,
      ),
    );
  });

  app.get('/legal/privacy', { schema: { tags: ['system'], summary: '개인정보처리방침' } }, async (_req, reply) => {
    return reply.type('text/html; charset=utf-8').send(
      page(
        '개인정보처리방침',
        `<h2>1. 수집하는 정보</h2>
         <table>
           <tr><th>항목</th><th>목적</th></tr>
           <tr><td>계정 식별자, 이메일</td><td>로그인·본인 확인</td></tr>
           <tr><td>닉네임, 프로필 이미지, 관심사</td><td>프로필 표시, 콘텐츠 추천</td></tr>
           <tr><td>업로드한 영상 클립과 편집 결과물</td><td>자동 편집 및 결과물 제공, 편집 후보 추천을 위한 내용 분석</td></tr>
           <tr><td>영상 내용 분석 결과(장면 요약, 사물·행동·장소, 편집 사용 가능 여부)</td><td>템플릿 슬롯에 넣을 영상 추천</td></tr>
           <tr><td>편집 취향(장소·사물·분위기 등 개념별 선호도, 전환·스타일 선호도)</td><td>추천과 자동 편집에 반영</td></tr>
           <tr><td>푸시 알림 토큰</td><td>알림 발송</td></tr>
           <tr><td>알림 발송 이력(장소·시각)</td><td>중복 알림 방지</td></tr>
           <tr><td>SNS 접근 토큰</td><td>사용자가 요청한 게시 수행 (암호화 저장)</td></tr>
           <tr><td>크레딧 잔액·증감 내역, 스토어 거래 식별자</td><td>크레딧 지급·차감 및 환불 처리</td></tr>
           <tr><td>광고 시청 기록(보상 요청 시각, 지급 여부, 광고 거래 식별자)</td><td>광고 보상 크레딧 지급 및 중복 지급 방지</td></tr>
         </table>
         <p>위치 정보는 주변 장소를 조회할 때 사용되며 서버에 저장하지 않습니다.
         알림이 실제로 발송된 경우에 한해 어느 장소에서 언제 보냈는지만 기록합니다.
         결제 카드 정보는 수집·저장하지 않습니다.</p>
         <p><strong>보상형 광고</strong> — 크레딧을 받기 위해 광고 보기를 선택하면, 그때부터 광고 SDK
         (Google AdMob)가 광고를 보여 주기 위해 기기의 광고 식별자, 기기·앱 정보, IP 주소를 Google 로 보냅니다.
         보상을 확인하기 위해 ${SERVICE}의 사용자 식별자도 함께 전달됩니다. 광고는 Google 의 설정에 따라
         관심사 기반(맞춤형)으로 제공될 수 있으며, 기기 설정에서 광고 식별자를 재설정하거나 맞춤 광고를 끌 수
         있습니다. 광고를 보지 않으면 광고 SDK 는 동작하지 않습니다.</p>

         <h2>2. 영상 내용 분석</h2>
         <p>무비를 만들 때 어떤 영상을 넣을지 제안하기 위해, 후보 영상의 내용을 외부 AI 사업자의
         분석 서비스로 확인합니다. <strong>사용자가 동의한 경우에만 분석하며</strong>, 동의하지 않아도
         서비스는 분석 없이 이용할 수 있습니다.</p>
         <ul>
           <li><strong>동의</strong> — 분석을 쓰는 기능을 처음 쓸 때 동의 여부를 묻습니다. 동의는 앱의
               나 탭에서 언제든 철회할 수 있고, 철회하면 그 뒤로 분석하지 않으며 이미 만든 분석
               결과와 추천 기록, 영상 내용에서 배운 취향을 삭제합니다.</li>
           <li><strong>언제</strong> — 사용자가 제작을 시작해 후보 영상이 정해진 시점에만 분석합니다.
               업로드하는 모든 영상을 분석하지 않습니다.</li>
           <li><strong>무엇을</strong> — 영상에서 뽑은 <strong>정지 이미지 최대 4장</strong>만
               전송합니다. 원본 영상 파일과 소리는 전송하지 않습니다.</li>
           <li><strong>결과</strong> — 장면 요약과 사물·행동·장소, 편집에 쓸 수 있는 화질인지에 대한
               판단이 영상 단위로 저장되어 다음 추천에 재사용됩니다. 같은 영상을 다시 분석하지
               않기 위한 것입니다.</li>
           <li><strong>파기</strong> — 영상을 삭제하면 그 영상의 분석 결과도 함께 삭제됩니다.</li>
           <li><strong>취향</strong> — 추천·자동 편집에서 고르고 지운 영상, 바꾼 전환·스타일, 끝까지 만든
               무비를 바탕으로 장소·사물·분위기 같은 개념별 선호도를 계산해 저장합니다. 영상 내용이 아니라
               개념별 점수의 합이라, 영상을 삭제해도 이미 반영된 점수는 남습니다. 오래 쓰지 않으면 점차
               옅어지고, 분석 동의를 철회하면 영상 내용에서 배운 선호도를, 계정을 삭제하면 전부를 삭제합니다.
               전환·스타일 선호도는 분석과 무관해 동의 철회 뒤에도 남습니다.</li>
           <li><strong>용도</strong> — 분석 결과는 추천을 만들기 위한 내부 근거로만 사용하며,
               화면에 표시하거나 다른 목적으로 쓰지 않습니다.</li>
           <li><strong>분석 사업자의 처리</strong> — 전송한 이미지는 <strong>해당 사업자의 모델
               학습에 이용되지 않습니다.</strong> 사업자는 남용 모니터링 목적으로 최대 30일간
               보관한 뒤 삭제하며, 그 밖의 목적으로 저장하지 않도록 설정해 요청합니다.</li>
         </ul>

         <h2>3. 보관 및 파기</h2>
         <ul>
           <li><strong>업로드한 영상 클립(스냅)</strong> — 서버에 올라온 지 <strong>${SNAP_RETENTION_DAYS}일</strong>이
               지나면 서버에서 삭제됩니다. 기준은 촬영 시각이 아니라 업로드 시각입니다. 사용자가 지운 스냅도
               원래 보관 기간이 끝날 때까지는 서버에 남아 앱의 최근 삭제에서 되살릴 수 있고, 그 뒤 삭제됩니다.
               보관 기간이 지나도 남기고 싶은 스냅은 앱에서 기기 앨범에 저장할 수 있으며, 앨범의 사본은
               사용자의 기기에 남습니다.</li>
           <li><strong>편집 결과물</strong> — 사용자가 결과물을 다운로드하거나 SNS 에 게시해 정리하면 서버의 파일을
               바로 삭제합니다. 정리하지 않은 결과물도 만든 지 <strong>${MOVIE_RESULT_RETENTION_DAYS}일</strong>이
               지나면 삭제됩니다. 어떤 스냅으로 무비를 구성했는지는 남아 다시 만들 수 있습니다.</li>
         </ul>
         <p>계정을 삭제하면 프로필, 영상, 연동 정보, 알림 이력이 함께 삭제됩니다.
         계정 삭제를 요청하면 SNS 접근 토큰과 푸시 알림 토큰은 즉시 삭제되며, 나머지 정보는
         30일의 복구 유예 기간이 지난 뒤 영구 삭제됩니다. 유예 기간 중에는 앱에서 삭제를
         철회할 수 있습니다. SNS 연동을 해제하면 해당 접근 토큰과 게시 기록에 남은 그 서비스의 값(게시물 ID 등)이 즉시 삭제됩니다.
         Instagram 설정에서 Snaply 를 제거하거나 데이터 삭제를 요청해도 Instagram 연동 정보와 게시 기록에 남은
         Instagram 값(게시물 ID 등)이 즉시 삭제되며, 이때 Snaply 계정과 영상은 삭제되지 않습니다.</p>

         <h2>4. 제3자 제공 및 처리 위탁</h2>
         <table>
           <tr><th>수탁자</th><th>위탁 내용</th></tr>
           <tr><td>Supabase</td><td>계정 인증(로그인)</td></tr>
           <tr><td>Amazon Web Services</td><td>서버 운영, 데이터베이스, 영상 파일 저장 및 전송</td></tr>
           <tr><td>Google (Firebase)</td><td>푸시 알림 발송</td></tr>
           <tr><td>Google (AdMob)</td><td>보상형 광고 제공 및 시청 완료 확인</td></tr>
           <tr><td>Meta (Instagram)</td><td>사용자가 요청한 릴스 게시</td></tr>
           <tr><td>TikTok</td><td>사용자가 요청한 영상 게시</td></tr>
           <tr><td>RevenueCat</td><td>인앱결제 영수증 검증 및 구매 상태 통지</td></tr>
           <tr><td>Apple · Google</td><td>인앱결제 처리</td></tr>
           <tr><td>Sentry</td><td>오류 수집 (개인정보는 마스킹)</td></tr>
           <tr><td>OpenAI</td><td>영상 대표 장면 이미지 분석 (편집 후보 추천)</td></tr>
         </table>
         <p>외부 플랫폼 게시는 <strong>사용자가 명시적으로 요청한 경우에만</strong> 이루어집니다.</p>

         <h2>5. 개인정보의 국외 이전</h2>
         <p>위 수탁자 중 아래 사업자는 국외에 서버를 두고 있어, 위탁한 정보가 국외로 이전됩니다.
         이전은 서비스 제공에 필요한 시점에 암호화된 통신(HTTPS)으로 이루어집니다.</p>
         <table>
           <tr><th>이전받는 자</th><th>국가</th><th>이전 항목</th><th>이용 목적</th><th>보유 기간</th></tr>
           <tr><td>OpenAI</td><td>미국</td><td>영상에서 추출한 정지 이미지 최대 4장</td>
               <td>영상 내용 분석</td>
               <td>남용 모니터링 목적 최대 30일 (법령상 보관 의무가 있는 경우 제외)</td></tr>
           <tr><td>Supabase</td><td>싱가포르</td><td>계정 식별자, 이메일 등 로그인 정보</td>
               <td>계정 인증</td><td>회원 탈퇴 시까지</td></tr>
           <tr><td>Google (Firebase)</td><td>Google 이 시설을 운영하는 국가 (지역을 지정할 수 없습니다)</td>
               <td>푸시 알림 토큰, 알림 메시지</td><td>푸시 알림 발송</td><td>위탁 계약 종료 시까지</td></tr>
           <tr><td>Google (AdMob)</td><td>미국 등 Google 이 시설을 운영하는 국가</td>
               <td>광고 식별자, 기기·앱 정보, IP 주소, 보상 확인용 사용자 식별자</td>
               <td>보상형 광고 제공 및 시청 완료 확인</td><td>Google 의 보관 정책에 따름</td></tr>
           <tr><td>RevenueCat</td><td>미국</td><td>앱 사용자 식별자, 스토어 거래 식별자와 구매 상태</td>
               <td>인앱결제 영수증 검증 및 구매 상태 통지</td><td>위탁 계약 종료 시까지</td></tr>
           <tr><td>Sentry</td><td>미국</td><td>오류 발생 시의 진단 정보 (인증 헤더와 토큰은 마스킹)</td>
               <td>오류 수집 및 원인 분석</td><td>요금제의 보관 기간에 따라 최대 90일</td></tr>
           <tr><td>Meta (Instagram)</td><td>미국, 아일랜드 등 Meta 가 데이터센터를 운영하는 국가</td>
               <td>게시를 요청한 영상과 문구, 연동 계정의 접근 토큰</td>
               <td>사용자가 요청한 릴스 게시</td><td>사용자가 게시물을 삭제할 때까지</td></tr>
           <tr><td>TikTok</td><td>미국, 싱가포르, 말레이시아 등</td>
               <td>게시를 요청한 영상과 문구, 연동 계정의 접근 토큰</td>
               <td>사용자가 요청한 영상 게시</td><td>사용자가 게시물을 삭제할 때까지</td></tr>
         </table>
         <p>업로드하신 영상 파일과 편집 결과물, 그리고 프로필 · 서비스 이용 기록을 담은 데이터베이스는
         <strong>국내(서울) 리전</strong>에 저장되며 국외로 이전되지 않습니다. 인스타그램·틱톡으로의 이전은 <strong>사용자가 그 영상의 게시를 요청한
         경우에만</strong> 일어나며, 요청하지 않으면 어떤 영상도 외부 플랫폼으로 나가지 않습니다.</p>
         <p>인앱결제는 기기의 스토어(App Store · Google Play)와 사용자 사이에서 이루어지고,
         ${SERVICE}는 결제 자체를 중계하지 않습니다. 구매 사실의 검증과 통지는 위 RevenueCat 이
         수행하며, Apple·Google 은 그 과정에서 스토어 거래의 당사자로 관여합니다.</p>
         <p>국외 이전을 원하지 않으시는 경우 회원 탈퇴로 서비스 이용을 중단하실 수 있습니다.</p>

         <h2>6. 안전조치</h2>
         <ul>
           <li>SNS 접근 토큰은 AES-256-GCM 으로 암호화하여 저장합니다.</li>
           <li>영상은 소유자별로 분리된 경로에 저장되며, 타인의 영상에는 접근할 수 없습니다.</li>
           <li>로그에서 인증 헤더와 각종 토큰은 마스킹 처리합니다.</li>
         </ul>

         <h2>7. 이용자의 권리</h2>
         <p>본인 정보의 열람·수정·삭제, SNS 연동 해제, 알림 수신 거부를 앱에서 직접 하실 수 있으며,
         아래 연락처로 요청하실 수도 있습니다.</p>`,
      ),
    );
  });
}
