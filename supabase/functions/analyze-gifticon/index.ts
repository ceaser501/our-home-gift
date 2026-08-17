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

const MODEL = 'claude-haiku-4-5';
const MAX_IMAGES = 5;

// 프롬프트를 고칠 때마다 올린다. 답과 함께 돌려줘서, 테스트 빌드 화면에 그대로 찍힌다.
//
// 이게 없으면 "고쳤는데 왜 그대로냐"를 가릴 방법이 없다. 함수를 안 올린 것인지, 올렸는데
// 안 먹은 것인지, 캐시가 옛 답을 준 것인지 — 셋 다 화면에서는 똑같아 보인다. 실제로 그걸
// 못 가려서 같은 자리를 여러 번 헤맸다.
const PROMPT_VERSION = '2026-08-17-쿠폰안쪽';

const SYSTEM_PROMPT = `너는 한국 모바일 기프티콘 이미지를 읽어 필요한 정보만 뽑아내는 도구다.

- 이미지에 실제로 보이는 내용만 쓴다. 안 보이면 빈 문자열로 두고, 절대 지어내지 않는다.
- 상품명은 화면에서 가장 크게 인쇄된 상품 이름이다. 브랜드 로고 옆 장식 글자, 안내 문구,
  버튼 글자("선물하기", "사용하기" 등)는 상품명이 아니다.
- 상호는 그 기프티콘을 쓸 수 있는 브랜드다(예: BBQ, 스타벅스, GS25). 브랜드가 공식적으로
  쓰는 표기를 그대로 쓴다(bbq가 아니라 BBQ).
  - 한 화면에 한글 이름과 영문 로고가 같이 있으면 **한글을 쓴다**(TWOSOME PLACE가 아니라
    투썸플레이스, STARBUCKS가 아니라 스타벅스). 같은 브랜드가 어떤 날은 한글로 어떤 날은
    영문으로 들어오면 목록에서 두 브랜드처럼 갈라진다. 한글 이름이 아예 없는 브랜드
    (BBQ, GS25 같은)만 영문 그대로 둔다.
- **상품명 자리에 상호를 적지 않는다.** 상품명을 못 읽겠으면 상호를 대신 넣지 말고 빈
  문자열로 둔다. 상호와 똑같은 값이 상품명에 들어가면, 사람은 그걸 상품명으로 믿고 그대로
  등록한다 — 무엇과 바꾸는 기프티콘인지 영영 알 수 없게 된다. 비워두면 사람이 직접
  적을 기회라도 남는다.
- 금액은 "금액권/권종"처럼 상품 자체의 가격이 인쇄돼 있을 때만 숫자로 적는다.
  결제 금액, 할인 금액, 배송비는 금액이 아니다.
- 유효기간은 **그 날짜가 기한이라고 적혀 있을 때만** 쓴다. "유효기간", "사용기한",
  "교환기한", "○○까지" 같은 말이 붙어 있어야 한다.
  - 라벨 없이 놓인 날짜는 비워둔다. 선물한 날, 주문한 날, 메모를 쓴 날, 화면을 찍은 날이
    그렇게 들어온다. 실제로 앱 화면을 찍은 캡처에서 메모 옆 날짜가 유효기간으로 들어가
    등록되자마자 D-Day가 된 일이 있었다.
  - "선물주문일", "구매일", "구매자 취소 가능 기간"은 유효기간이 아니다.
  - **쿠폰 안에 적힌 날짜만 쓴다.** 상품명·바코드와 한 카드에 담겨 발행사가 인쇄한
    글자여야 한다. 그 카드 바깥은 쿠폰이 말하는 것이 아니라 그것을 보여주는 앱이 말하는
    것이다 — 목록 줄, 화면 구석에 작게 붙은 배지("D-Day", "○일 남음"), 상단바, 메모.
    거기 "○○까지"가 적혀 있어도 쓰지 않는다.
    실제로 앱 목록 캡처의 빨간 배지("D-Day · 2026.08.17까지")가 기한으로 들어왔다.
    그 값은 그 앱이 먼저 잘못 읽어 그려놓은 것일 수도 있어서, 되읽으면 틀린 값이 굳는다.
  - 여러 기프티콘이 나열된 화면에서도 읽지 않는다. 거기 적힌 날짜는 옆 칸 것일 수 있고,
    어느 것이 이 상품 것인지 그 화면만 봐서는 알 수 없다.
  - 기한이 틀리면 알림이 엉뚱한 날에 오고 정작 만료되는 날에는 아무 말이 없다. 빈칸은
    사람이 채울 수 있지만 틀린 날짜는 아무도 안 고친다. 애매하면 비워둔다.
- isVoucher는 이것이 "금액권"인지다. 정해진 상품 하나와 바꾸는 교환권(아메리카노 T,
  치킨 세트)이 아니라, 적힌 금액만큼 값을 치르는 데 쓰는 상품권이면 true다.
  상품명에 "금액권", "상품권", "○○원권", "기프트카드"가 들어가거나, 상품명 자리에
  금액만 적혀 있으면 금액권으로 본다. 애매하면 false로 둔다 — 교환권을 금액권으로
  잘못 보면 쓸 때마다 금액을 묻게 되어 번거롭다.
- 여러 장이 들어오면 같은 기프티콘을 여러 각도에서 찍은 것으로 보고 하나로 합쳐서 답한다.
- thumbnail은 목록에 작게 보여줄 "상품 이미지"의 위치다. 기프티콘 화면 한가운데에 상품을
  보여주는 그림이 한 장 있는데(치킨 사진, 음료 사진, 상품권 그림 등), 그 그림 한 장이
  차지한 네모를 그대로 고른다.
  - 그림이 가진 배경까지 포함해서 그림의 테두리에 맞춘다. 예를 들어 노란 바탕 위에 치킨과
    콜라가 놓인 그림이면, 치킨과 콜라만이 아니라 노란 네모 전체가 답이다. 그 바탕색이
    브랜드를 알아보게 해주고, 오려내면 모양이 어색해진다.
  - 대신 그림 바깥은 넣지 않는다. 상품명·브랜드·유효기간 같은 글자, 버튼("선물하기",
    "주문하기"), 바코드와 그 아래 번호, 앱 상단 막대, 폰 상태표시줄은 모두 제외한다.
  - 특히 두 가지를 조심한다. 그림이 흰 바탕 한가운데 놓여 있으면 그 흰 여백은 그림이
    아니므로 빼고 색이 있는 부분의 테두리에 맞춘다. 그림 바로 아래에 작게 적힌 브랜드
    이름(예: 그림 밑의 "BBQ")도 글자이므로 빼고, 그림이 끝나는 선에서 자른다.
  - 화면 전체나 그에 가까운 넓은 영역을 고르지 않는다. 그럴 바에는 비운다.
  - 상품 이미지가 없거나 어디인지 확실하지 않으면 image를 0으로 둔다(대충 찍는 것보다 낫다).`;

function buildSchema(categories: string[]) {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: '상품명. 못 찾으면 빈 문자열' },
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
    required: ['name', 'brand', 'amount', 'expiresAt', 'category', 'code', 'isVoucher', 'thumbnail'],
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
    const usage = await withinDailyLimit(
      guard.admin,
      guard.user.id,
      'analyze',
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

    const { images, categories } = await req.json();
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
    const response = await client.messages.create({
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

    // 응답을 받았으면(성공이든 거절이든) 토큰 요금은 이미 나갔으니 여기서 적는다.
    await logAiUsage(guard.admin, 'analyze', MODEL, response.usage);

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

    return new Response(
      JSON.stringify({
        promptVersion: PROMPT_VERSION,
        name: name || null,
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
