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
import { corsFor, limitFromEnv, requireUser, tooManyMessage, withinDailyLimit } from '../_shared/guard.ts';

const MODEL = 'claude-haiku-4-5';
const MAX_IMAGES = 5;

const SYSTEM_PROMPT = `너는 한국 모바일 기프티콘 이미지를 읽어 필요한 정보만 뽑아내는 도구다.

- 이미지에 실제로 보이는 내용만 쓴다. 안 보이면 빈 문자열로 두고, 절대 지어내지 않는다.
- 상품명은 화면에서 가장 크게 인쇄된 상품 이름이다. 브랜드 로고 옆 장식 글자, 안내 문구,
  버튼 글자("선물하기", "사용하기" 등)는 상품명이 아니다.
- 상호는 그 기프티콘을 쓸 수 있는 브랜드다(예: BBQ, 스타벅스, GS25). 브랜드가 공식적으로
  쓰는 표기를 그대로 쓴다(bbq가 아니라 BBQ).
- 금액은 "금액권/권종"처럼 상품 자체의 가격이 인쇄돼 있을 때만 숫자로 적는다.
  결제 금액, 할인 금액, 배송비는 금액이 아니다.
- 여러 장이 들어오면 같은 기프티콘을 여러 각도에서 찍은 것으로 보고 하나로 합쳐서 답한다.`;

function buildSchema(categories: string[]) {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', description: '상품명. 못 찾으면 빈 문자열' },
      brand: { type: 'string', description: '상호(브랜드). 못 찾으면 빈 문자열' },
      amount: { type: 'string', description: '금액. 숫자만(쉼표 없이). 인쇄돼 있지 않으면 빈 문자열' },
      expiresAt: { type: 'string', description: '유효기간. YYYY-MM-DD 형식. 못 찾으면 빈 문자열' },
      category: { type: 'string', enum: categories, description: '가장 알맞은 분류. 애매하면 기타' },
      code: {
        type: 'string',
        description: '바코드 아래 인쇄된 번호. 숫자만(공백·하이픈 제거). 안 보이면 빈 문자열',
      },
    },
    required: ['name', 'brand', 'amount', 'expiresAt', 'category', 'code'],
    additionalProperties: false,
  };
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
    const usage = await withinDailyLimit(guard.admin, guard.user.id, 'analyze', limitFromEnv('ANALYZE_DAILY_LIMIT', 30));
    if (!usage.allowed) {
      return new Response(JSON.stringify({ error: tooManyMessage(usage.used, usage.limit) }), {
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
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: buildSchema(categories) } },
      messages: [
        {
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: '이 기프티콘의 정보를 뽑아줘.' }],
        },
      ],
    });

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

    const parsed = JSON.parse(textBlock.text);
    const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
    const amount = digits(parsed.amount);

    return new Response(
      JSON.stringify({
        name: parsed.name || null,
        brand: parsed.brand || null,
        amount: amount ? Number(amount) : null,
        expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiresAt || '') ? parsed.expiresAt : null,
        category: categories.includes(parsed.category) ? parsed.category : '기타',
        code: digits(parsed.code) || null,
      }),
      { headers: jsonHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '이미지 인식에 실패했어요.';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});
