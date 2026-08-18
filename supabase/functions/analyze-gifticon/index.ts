// 기프티콘 이미지에서 상품명·상호·금액·유효기간을 읽어오는 함수.
//
// 예전에는 브라우저에서 tesseract로 글자를 읽고, 그 결과를 정규식으로 잘라 상품명을
// 골라냈다. 한글 인식이 자주 틀리는 데다 "읽은 글자 중 무엇이 상품명인가"를 규칙으로
// 맞히는 일이 근본적으로 어려워서, 이미지를 그대로 모델에게 보여주고 필요한 항목만
// 정해진 형식(JSON)으로 받아오는 방식으로 바꿨다.
//
// 바코드 자체는 브라우저에서 zxing이 이미 잘 읽으므로 여기서는 다루지 않고,
// 바코드 밑에 인쇄된 번호만 보조로 함께 받아온다(막대를 못 읽었을 때의 대비책).
//
// API 키는 브라우저에 노출되면 안 되므로 이 서버 쪽 비밀값으로만 갖고 있는다:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import Anthropic from 'npm:@anthropic-ai/sdk@0.115.0';
import { corsFor, limitFromEnv, logAiUsage, requireUser, tooManyMessage, withinDailyLimit } from '../_shared/guard.ts';

// 어느 모델로 읽을지. 값을 안 넣으면 지금 쓰는 것 그대로다.
//
//   supabase secrets set ANALYZE_MODEL=claude-sonnet-5     # 재볼 때
//   supabase secrets unset ANALYZE_MODEL                   # 되돌릴 때
//
// 코드에 박아두면 재볼 때마다 고치고 배포하고 되돌려야 한다. 지금 재봐야 하는 것이
// "이 사진의 상품명을 더 센 모델은 읽는가" 하나뿐이라, 값만 바꿔 끼울 수 있게 뺀다.
//
// 값 차이가 크다(한 건 6원 → 18원). 재보고 나면 반드시 되돌리거나, 올릴지 말지를
// 정해서 여기 기본값을 바꾼다 — 시험하려고 켜둔 것이 그대로 남는 일이 없게.
const MODEL = Deno.env.get('ANALYZE_MODEL') || 'claude-haiku-4-5';
const MAX_IMAGES = 5;

// 상품명만 한 번 더 읽는 모델. 값이 없으면 검증하지 않는다(예전 동작 그대로).
//
//   supabase secrets set ANALYZE_VERIFY_MODEL=claude-sonnet-5
//
// 왜 상품명만 따로 보는가:
//   틀리는 항목이 상품명 하나로 몰려 있다. 금액·기한·상호는 숫자거나 아는 이름이라
//   하이쿠도 잘 읽는데, 상품명은 처음 보는 한글 덩어리라 획 하나로 갈린다
//   (떠먹는 → 따먹는/뚜믹는). 게다가 틀린 방식이 조용해서, 멀쩡한 이름처럼 저장된다.
//
// 왜 모델에게 "확실하냐"고 묻는 것으로는 안 되는가:
//   그건 자기가 자기 답을 채점하는 것이다. 따먹는으로 읽었다는 건 그 순간 모델 눈에
//   그렇게 보였다는 뜻이라, 헷갈릴 이유가 없다 — 틀린 줄 알면 애초에 안 틀렸다.
//   그래서 헷갈림 표시로 거르지 않고 전부 다시 본다.
//
// 왜 잘라 보내지 않고 사진을 통째로 주는가:
//   한때 상품명 네모만 잘라 보냈다. 값이 3분의 1이라 그게 나아 보였는데, 좌표에 기대는
//   순간 조용히 망가지는 길이 열린다 — 네모가 엉뚱한 데를 짚으면 이쪽은 거기 있는 글자를
//   정직하게 읽어오고, 그 값으로 갈아끼우면 맞게 읽은 이름이 틀린 이름으로 덮인다.
//
//   막아보려고 "앞서 읽은 이름과 너무 다르면 물리친다"를 넣었다가 걷어냈다. 못 믿는 쪽을
//   자로 삼는 셈이라, 하이쿠가 크게 틀릴수록("또망는 케이크") 맞는 교정을 더 확실히
//   막았다. 게다가 "이쪽이 맞고 하이쿠가 많이 틀림"과 "네모가 딴 데를 짚음"은 둘 다
//   "크게 다름"으로 보여서 가를 수가 없다.
//
//   사진을 통째로 주면 좌표가 아예 필요 없다. 이쪽이 스스로 상품명을 찾으니, 답을 그냥
//   받으면 된다. 발행사마다 카드 생김새가 달라도 여기는 손댈 것이 없다.
const VERIFY_MODEL = Deno.env.get('ANALYZE_VERIFY_MODEL') || '';

// 어디에 있는지는 적지 않는다.
//
// 한때 "상호 이름 옆이나 아래, 교환처·유효기간 줄보다 위"라고 적어뒀다. 배스킨라빈스
// 카드를 보고 "가장 크게 인쇄된"을 고치면서 대신 넣은 것인데, 그것도 결국 한 발행사의
// 배치를 규칙으로 굳힌 것이다. 카드 생김새는 발행사마다 다르고 개편도 한다.
//
// 무엇인지만 말하면 저쪽이 알아서 찾는다. 사람이 카드를 보고 "이게 받을 상품이구나"
// 하는 데 좌표가 필요 없는 것과 같다. 여기 남길 것은 "무엇을 찾느냐"와 "어떻게 옮기느냐"
// 둘뿐이고, 뒤엣것이 이 호출의 존재 이유다.
const VERIFY_PROMPT = `기프티콘 사진에서 상품 이름만 찾아 그대로 옮긴다.

- 이 쿠폰을 내면 받게 되는 그 상품의 이름이다. 인사말, 상호, 버튼, 쿠폰 파는 회사
  이름은 아니다.
- 한 글자도 바꾸지 않는다. 대괄호가 붙어 있으면 대괄호째로 옮긴다.
- 한글은 획 하나로 갈린다(떠/따/뚜, 반/밤, 올/울). 한 글자씩 확인한다.
  흔한 이름일 것 같다는 이유로 고쳐 쓰지 않는다.
- 못 찾겠으면 빈 문자열로 둔다. 지어내지 않는다.`;

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '인쇄된 상품 이름 그대로. 안 보이면 빈 문자열' },
  },
  required: ['name'],
  additionalProperties: false,
};

// 프롬프트를 고칠 때마다 올린다. 답과 함께 돌려줘서, 테스트 빌드 화면에 그대로 찍힌다.
//
// 이게 없으면 "고쳤는데 왜 그대로냐"를 가릴 방법이 없다. 함수를 안 올린 것인지, 올렸는데
// 안 먹은 것인지, 캐시가 옛 답을 준 것인지 — 셋 다 화면에서는 똑같아 보인다. 실제로 그걸
// 못 가려서 같은 자리를 여러 번 헤맸다.
const PROMPT_VERSION = '2026-08-18-위치규칙제거';

// 프롬프트에는 규칙만 적는다. 왜 그렇게 정했는지는 여기 적는다.
//
// 한동안 프롬프트 안에 "실제로 이런 일이 있었다"를 함께 적었다. 코드 주석 쓰듯 쓴
// 것인데, 모델에게는 그냥 잡음이다. 게다가 덧붙인 것이 대부분 "이건 읽지 마라"는
// 금지라, 정작 읽어야 할 상품명에서 주의를 뺏을 수 있다. 짧게 줄였다.
//
// 유효기간을 카드 안쪽으로 묶은 이유:
//   앱 화면을 찍은 캡처에서 메모 옆 날짜가 기한으로 들어와 등록되자마자 D-Day가 됐다.
//   그다음엔 우리 목록의 빨간 배지("D-Day · 2026.08.17까지")가 그대로 되돌아왔다.
//   카드 바깥 글자는 쿠폰이 말하는 것이 아니라 그것을 보여주는 앱이 말하는 것이고,
//   그 값은 그 앱이 먼저 잘못 읽어 그려놓은 것일 수도 있다. 되읽으면 틀린 값이 굳는다.
//   목록 화면이면 옆 칸 기프티콘 것일 수도 있다.
//
// 애매하면 비우게 한 이유:
//   기한이 틀리면 알림이 엉뚱한 날에 오고 정작 만료되는 날에는 아무 말이 없다.
//   빈칸은 사람이 채울 수 있지만 틀린 날짜는 아무도 안 고친다.
const SYSTEM_PROMPT = `너는 한국 모바일 기프티콘 이미지에서 필요한 값만 뽑는 도구다.
보이는 것만 쓴다. 안 보이면 빈 문자열로 두고 지어내지 않는다.

[상품명] — 가장 중요하다
- 이 쿠폰을 내면 받게 되는 그 상품의 이름이다. 크다고 상품명이 아니다 — 맨 위 띠의
  인사말("받아랏 내마음"), 상호, 버튼("선물하기"), 쿠폰 파는 회사 이름은 아니다.
- 한 글자도 바꾸지 말고 그대로 옮긴다. 앞에 대괄호가 붙어 있으면 대괄호째로 옮긴다.
- 한글은 획 하나로 갈린다(떠/따/뚜, 반/밤, 올/울). 비슷한 글자를 짐작으로 채우지
  말고 한 글자씩 확인한다. 흔한 상품명일 것 같다는 이유로 고쳐 쓰지 않는다.
- 상호를 상품명 자리에 넣지 않는다. 못 읽겠으면 빈 문자열로 둔다.
- 다 옮긴 뒤 nameConfidence를 적는다. 한 글자라도 짐작으로 채웠거나 획이 흐려 둘 중
  하나로 보였으면 "헷갈림"이다. 전부 또렷하게 읽었을 때만 "확실"이다.
- nameImage에는 그 이름이 인쇄된 사진이 몇 번째인지 적는다. 못 찾으면 0.

[상호]
- 이 기프티콘을 쓸 수 있는 브랜드(BBQ, 스타벅스, GS25).
- 한글 표기가 함께 있으면 한글로 쓴다(TWOSOME PLACE → 투썸플레이스). 한글 이름이 없는
  브랜드만 영문 그대로 둔다.

[금액]
- 상품 자체의 가격이 인쇄돼 있을 때만 숫자로 적는다. 결제·할인·배송비는 아니다.

[유효기간]
- 상품명·바코드와 한 카드 안에 있고 기한이라고 적힌 날짜만 쓴다
  ("유효기간", "사용기한", "교환기한", "○○까지").
- 카드 바깥은 안 쓴다 — 목록 줄, 구석의 배지("D-Day", "○일 남음"), 상단바, 메모.
- 라벨 없는 날짜, "선물주문일", "구매일", "취소 가능 기간"도 아니다. 애매하면 비운다.

[isVoucher]
- 적힌 금액만큼 값을 치르는 상품권이면 true, 정해진 상품과 바꾸는 교환권이면 false.
- 애매하면 false로 둔다.

[thumbnail]
- 목록에 작게 쓸 상품 그림 한 장이 차지한 네모. 그림이 가진 배경(색 있는 부분)까지
  테두리에 맞춘다.
- 글자·버튼·바코드·상단바는 넣지 않는다. 그림 둘레의 흰 여백도 뺀다.
- 화면 전체에 가까우면 비운다. 확실하지 않으면 image를 0으로 둔다.

여러 장이 들어오면 같은 기프티콘을 여러 번 찍은 것으로 보고 하나로 합쳐 답한다.`;

function buildSchema(categories: string[]) {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: '상품명. 못 찾으면 빈 문자열' },
      nameConfidence: {
        type: 'string',
        enum: ['확실', '헷갈림'],
        description: '상품명을 한 글자도 짐작 없이 읽었으면 확실, 한 글자라도 흐릿했으면 헷갈림',
      },
      nameImage: {
        type: 'integer',
        description: '상품명이 인쇄된 이미지가 몇 번째인지(1부터). 못 찾으면 0',
      },
      brand: { type: 'string', description: '상호(브랜드). 못 찾으면 빈 문자열' },
      amount: { type: 'string', description: '금액. 숫자만(쉼표 없이). 인쇄돼 있지 않으면 빈 문자열' },
      expiresAt: {
        type: 'string',
        description:
          '유효기간. YYYY-MM-DD 형식. 기한이라고 적혀 있는 날짜만 쓰고, 라벨 없는 날짜나 못 찾으면 빈 문자열',
      },
      category: { type: 'string', enum: categories, description: '가장 알맞은 분류. 애매하면 기타' },
      code: {
        type: 'string',
        description: '바코드 아래 인쇄된 번호. 숫자만(공백·하이픈 제거). 안 보이면 빈 문자열',
      },
      isVoucher: { type: 'boolean', description: '금액권이면 true, 정해진 상품과 바꾸는 교환권이면 false' },
      thumbnail: {
        type: 'object',
        description: '상품 사진이 있는 네모 영역',
        properties: {
          image: { type: 'integer', description: '몇 번째 이미지인지(1부터). 못 찾으면 0' },
          x: { type: 'number', description: '왼쪽 위 x. 이미지 너비의 백분율(0~100)' },
          y: { type: 'number', description: '왼쪽 위 y. 이미지 높이의 백분율(0~100)' },
          width: { type: 'number', description: '가로 길이. 이미지 너비의 백분율(0~100)' },
          height: { type: 'number', description: '세로 길이. 이미지 높이의 백분율(0~100)' },
        },
        required: ['image', 'x', 'y', 'width', 'height'],
        additionalProperties: false,
      },
    },
    required: [
      'name',
      'nameConfidence',
      'nameImage',
      'brand',
      'amount',
      'expiresAt',
      'category',
      'code',
      'isVoucher',
      'thumbnail',
    ],
    additionalProperties: false,
  };
}

// 모델이 짚어준 상품 사진 위치를 그대로 믿지 않는다. 좌표는 글자보다 자주 틀리는데,
// 엉뚱한 데를 잘라 놓으면 "왜 이 그림이지?" 싶은 썸네일이 남고 되돌릴 방법도 없다.
// 화면의 한 귀퉁이만 집었거나 길쭉한 띠를 집은 것은 상품 사진이 아니라고 보고 버린다.
// 버리면 예전처럼 캡처 전체가 썸네일이 되므로, 애매할 때는 버리는 쪽이 안전하다.
// 화면을 통째로 짚은 것도 버린다. 그건 자르지 않은 것과 같은데, 잘라낸 그림으로 저장되면
// 나중에 "왜 안 잘렸지" 하고 원인을 찾을 자리가 하나 늘어난다.
const MIN_THUMB_PERCENT = 15;
const MAX_THUMB_PERCENT = 90;
const MAX_THUMB_RATIO = 2.5;

function parseThumbnail(raw: Record<string, unknown> | null, imageCount: number) {
  const box = raw as { image?: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null;
  if (!box) return null;

  const index = Number(box.image);
  if (!Number.isInteger(index) || index < 1 || index > imageCount) return null;

  const [x, y, width, height] = [box.x, box.y, box.width, box.height].map(Number);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width < MIN_THUMB_PERCENT || height < MIN_THUMB_PERCENT) return null;
  if (width > MAX_THUMB_PERCENT && height > MAX_THUMB_PERCENT) return null;
  if (x < 0 || y < 0 || x + width > 101 || y + height > 101) return null;

  // 백분율은 가로세로 기준이 달라서 비율을 바로 비교할 수 없지만, 기프티콘 상품 사진은
  // 대체로 정사각형에 가깝다. 한쪽이 다른 쪽의 두 배를 넘으면 사진이 아니라 글자 줄일 때가 많다.
  const ratio = width / height;
  if (ratio > MAX_THUMB_RATIO || ratio < 1 / MAX_THUMB_RATIO) return null;

  return { image: index, x, y, width, height };
}

// 사진 한 장을 통째로 주고 상품명만 다시 읽힌다.
//
// 실패해도 400이나 500을 돌려주지 않는다. 이건 이미 나온 답을 더 낫게 만드는 곁가지라,
// 여기서 막히면 화면은 앞서 읽은 이름을 그대로 쓰면 된다. 검증이 안 됐다고 등록 자체가
// 막히면, 있으나 마나 한 기능 하나 때문에 되던 것이 안 되는 셈이다.
async function verifyName(
  body: { image?: { data?: string; mediaType?: string } },
  guard: { admin: unknown },
  jsonHeaders: Record<string, string>,
) {
  const ok = (name: string | null) =>
    new Response(JSON.stringify({ name, model: VERIFY_MODEL || null }), { headers: jsonHeaders });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!VERIFY_MODEL || !apiKey || !body?.image?.data) return ok(null);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: VERIFY_MODEL,
      // 답은 상품명 한 줄뿐이다. 그래도 되풀이에 빠져 잘리는 일이 있어 여유를 둔다 —
      // 실제로 쓴 만큼만 값을 내므로 천장을 올려도 비싸지지 않는다.
      max_tokens: 512,
      system: VERIFY_PROMPT,
      output_config: { format: { type: 'json_schema', schema: VERIFY_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: body.image.mediaType || 'image/jpeg',
                data: body.image.data,
              },
            },
            { type: 'text', text: '이 상품 이름을 그대로 읽어줘.' },
          ],
        },
      ],
    });
    await logAiUsage(guard.admin, 'verify', VERIFY_MODEL, response.usage);

    if (response.stop_reason === 'max_tokens' || response.stop_reason === 'refusal') return ok(null);
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || !('text' in textBlock)) return ok(null);

    const parsed = JSON.parse(textBlock.text);
    return ok(String(parsed.name ?? '').trim() || null);
  } catch (err) {
    console.error('analyze-gifticon: 상품명 재확인 실패', err);
    return ok(null);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // 이미지 한 장을 볼 때마다 AI 요금이 나간다. 아무나 부를 수 있으면 그대로 요금이 된다.
    const guard = await requireUser(req);
    if (guard.error) {
      return new Response(JSON.stringify({ error: guard.error }), { status: guard.status, headers: jsonHeaders });
    }
    const body = await req.json();

    // 상품명만 다시 읽는 길. 앞선 분석이 짚어준 네모를 화면 쪽에서 잘라 보낸다.
    //
    // 한도를 따로 세는 이유: 이건 늘 분석 한 번 뒤에 따라붙는 것이라, 같은 통에 넣으면
    // 사람이 하루에 등록할 수 있는 건수가 그대로 반이 된다. 세긴 세야 한다 — 이 길만
    // 골라서 부르면 그것도 요금이다.
    if (body?.mode === 'verify') {
      const verifyUsage = await withinDailyLimit(
        guard.admin,
        guard.user.id,
        'verify',
        limitFromEnv('VERIFY_DAILY_LIMIT', 60),
        limitFromEnv('VERIFY_TOTAL_DAILY_LIMIT', 1000),
      );
      if (!verifyUsage.allowed) {
        return new Response(JSON.stringify({ error: tooManyMessage(verifyUsage) }), {
          status: 429,
          headers: jsonHeaders,
        });
      }
      return await verifyName(body, guard, jsonHeaders);
    }

    // 이미지 한 장을 볼 때마다 AI 요금이 나간다. 아무나 부를 수 있으면 그대로 요금이 된다.
    const usage = await withinDailyLimit(
      guard.admin,
      guard.user.id,
      'analyze',
      // ── 이 두 값은 출시 전에 따로 정한다. 여기서 손대지 않는다 ──────────────
      // 한 번 "처음 쓰는 사람이 몰아 넣다가 막힌다"는 이유로 1인 한도를 50으로 올렸다가
      // 되돌렸다. 세는 단위가 건(기프티콘 하나)이라 30건이면 사진 90장이고, 하루에 그만큼
      // 찍어 쌓는 일이 흔하지 않다. 여행 다녀온 날 정도다.
      //
      // 두 값은 성격이 다르다. 1인 한도는 "한 사람이 몰아 쓰는 것"을 막고, 전체 한도는
      // 하루 요금의 천장이다. 따로 보면 한쪽만 조이게 되니 나란히 놓고 한 번에 정한다.
      limitFromEnv('ANALYZE_DAILY_LIMIT', 30),
      limitFromEnv('ANALYZE_TOTAL_DAILY_LIMIT', 500),
    );
    if (!usage.allowed) {
      return new Response(JSON.stringify({ error: tooManyMessage(usage) }), {
        status: 429,
        headers: jsonHeaders,
      });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: '이미지 인식 서버 설정이 아직 완료되지 않았어요.' }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const { images, categories } = body;
    if (!Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: '이미지가 필요해요.' }), { status: 400, headers: jsonHeaders });
    }
    if (!Array.isArray(categories) || categories.length === 0) {
      return new Response(JSON.stringify({ error: '카테고리 목록이 필요해요.' }), { status: 400, headers: jsonHeaders });
    }

    const imageBlocks = images.slice(0, MAX_IMAGES).map((image) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: image.mediaType || 'image/jpeg',
        data: image.data,
      },
    }));

    const client = new Anthropic({ apiKey });
    const ask = () =>
      client.messages.create({
        model: MODEL,
        // 답은 짧은 JSON 하나라 200토큰 안팎이면 끝난다. 그런데 모델이 한 번씩 같은 구절을
        // 되풀이하다 천장에 닿았고, 그때 JSON이 잘려 통째로 실패했다. 천장을 올려도 실제로
        // 쓴 만큼만 값을 내므로, 여유를 두는 쪽이 싸다.
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema', schema: buildSchema(categories) } },
        messages: [
          {
            role: 'user',
            content: [...imageBlocks, { type: 'text', text: '이 기프티콘의 정보를 뽑아줘.' }],
          },
        ],
      });

    let response = await ask();
    // 응답을 받았으면(성공이든 거절이든) 토큰 요금은 이미 나갔으니 여기서 적는다.
    await logAiUsage(guard.admin, 'analyze', MODEL, response.usage);

    // 잘렸으면 한 번만 다시 부른다.
    //
    // 천장을 더 올려도 소용없다. 되풀이에 빠진 답은 4096에서도 똑같이 잘린다 — 길이가
    // 모자란 게 아니라 답이 헛도는 것이다. 다시 부르면 대개 한 번에 끝난다.
    //
    // 이걸 사람 손에 맡겨뒀었다. 카드에 "다시 읽기"가 붙어서 누르면 되긴 하지만, 여덟 건을
    // 찾아준 화면에서 한 건만 빨갛게 남아 있으면 그건 앱이 실패한 것으로 보인다. 한 번
    // 더 부르는 값(한 건 6원)이 그 인상보다 싸다.
    if (response.stop_reason === 'max_tokens') {
      console.warn('analyze-gifticon: 답이 잘려 한 번 더 부릅니다');
      response = await ask();
      await logAiUsage(guard.admin, 'analyze', MODEL, response.usage);
    }

    if (response.stop_reason === 'refusal') {
      return new Response(JSON.stringify({ error: '이 이미지는 인식할 수 없어요. 직접 입력해주세요.' }), {
        status: 422,
        headers: jsonHeaders,
      });
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || !('text' in textBlock)) {
      return new Response(JSON.stringify({ error: '이미지에서 정보를 찾지 못했어요.' }), {
        status: 502,
        headers: jsonHeaders,
      });
    }

    // 답이 max_tokens에서 잘리면 JSON도 문장 한가운데서 끊긴다. 그대로 파싱하면
    // "Unterminated string in JSON at position …"이 튀어나오고, 그 말이 카드에 그대로
    // 찍혔다. 사용자에게는 아무 뜻도 없는 말이고, 무엇을 해야 하는지도 알려주지 않는다.
    // deno-lint-ignore no-explicit-any
    let parsed: any;
    try {
      if (response.stop_reason === 'max_tokens') throw new Error('truncated');
      parsed = JSON.parse(textBlock.text);
    } catch (_err) {
      console.error('analyze-gifticon: 답을 읽지 못했습니다', {
        stopReason: response.stop_reason,
        length: textBlock.text.length,
      });
      return new Response(JSON.stringify({ error: '정보를 읽다가 끊겼어요. 다시 시도해주세요.' }), {
        status: 502,
        headers: jsonHeaders,
      });
    }

    const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
    const amount = digits(parsed.amount);

    const brand = String(parsed.brand ?? '').trim();
    const rawName = String(parsed.name ?? '').trim();
    // 상품명 자리에 상호가 들어온 경우는 상품명을 못 읽은 것이다. 프롬프트로도 막지만,
    // 여기서 한 번 더 본다 — 이건 모델이 지키기로 한 약속이 아니라 우리가 아는 사실이다.
    //
    // 비우면 카드가 "상품명을 못 읽었어요"로 남아 등록에서 빠진다. 그게 맞다.
    // "투썸플레이스"라는 이름으로 등록되면 사람은 그걸 상품명으로 믿고, 무엇과 바꾸는
    // 기프티콘인지 나중에도 알 수 없다.
    const name = rawName && rawName === brand ? '' : rawName;

    // 모델이 상품명을 헷갈렸다고 스스로 말한 경우.
    //
    // 이게 필요한 이유는, 상품명이 틀리는 방식이 조용하기 때문이다. 못 읽으면 빈칸이라
    // 눈에 띄지만, "떠먹는"을 "뚜믹는"으로 읽으면 멀쩡한 이름처럼 카드에 앉는다. 사람은
    // 그걸 보고 맞다고 여기고 넘어간다 — 실제로 그렇게 등록됐다.
    //
    // 값 자체는 모델의 자기 신고라 그대로 믿을 것은 못 된다. 다만 두 가지에 쓴다.
    //   1) 화면 — 헷갈렸다고 한 건만 "확인해주세요"를 붙인다. 전부 붙이면 아무도 안 본다.
    //   2) 다음 결정 — 헷갈림이 몇 %나 나오는지가 곧 하이쿠를 계속 쓸지의 근거다.
    //      이게 없으면 "투썸 한 건이 틀렸다"는 인상만 갖고 3배 비싼 모델을 고르게 된다.
    //
    // 빈칸은 헷갈림으로 치지 않는다. 그건 이미 카드가 "못 읽었어요"로 말하고 있다.
    const nameUncertain = Boolean(name) && parsed.nameConfidence === '헷갈림';

    return new Response(
      JSON.stringify({
        promptVersion: PROMPT_VERSION,
        name: name || null,
        nameUncertain,
        // 상품명이 인쇄된 사진 번호. 화면 쪽이 그 한 장을 다시 물어볼 때 쓴다.
        // 이름을 못 읽었으면 다시 물어봐야 확인할 것이 없다.
        nameImage:
          name && Number.isInteger(parsed.nameImage) && parsed.nameImage >= 1 && parsed.nameImage <= imageBlocks.length
            ? parsed.nameImage
            : null,
        brand: brand || null,
        amount: amount ? Number(amount) : null,
        expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiresAt || '') ? parsed.expiresAt : null,
        category: categories.includes(parsed.category) ? parsed.category : '기타',
        code: digits(parsed.code) || null,
        // 금액이 없으면 금액권일 수 없다. 깎아 나갈 값이 없으면 잔액이라는 개념이 성립하지 않는다.
        isVoucher: Boolean(parsed.isVoucher) && Boolean(amount),
        thumbnail: parseThumbnail(parsed.thumbnail, imageBlocks.length),
      }),
      { headers: jsonHeaders }
    );
  } catch (err) {
    // 여기 오는 것은 우리가 예상하지 못한 오류다. 그 말을 그대로 화면에 올리면
    // 사용자는 영어 스택 조각을 읽게 된다. 자세한 것은 로그에 남기고, 화면에는
    // 무엇을 할 수 있는지만 말한다.
    console.error('analyze-gifticon 실패', err);
    return new Response(JSON.stringify({ error: '이미지를 읽지 못했어요. 잠시 뒤에 다시 시도해주세요.' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
