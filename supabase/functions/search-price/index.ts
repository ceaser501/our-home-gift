// "가격 검색" 버튼을 눌렀을 때, 상품형 기프티콘(금액이 인쇄돼 있지 않은 것)의
// 현재 판매가를 찾아주는 함수.
//
// 예전에는 네이버 쇼핑 검색 결과 열 개의 중앙값을 썼는데, 쇼핑 검색은 기프티콘 시세를
// 위한 것이 아니라서 상품명으로 검색하면 소스·굿즈·묶음 상품이 섞여 들어왔고 그 중앙값은
// 실제 가격과 상관없는 숫자가 되곤 했다. 그래서 모델에게 웹 검색을 맡기고, 검색 결과를
// 읽어 "이 상품의 판매가"만 골라내도록 바꿨다.
//
// 필요한 비밀값: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import Anthropic from 'npm:@anthropic-ai/sdk@0.115.0';
import { corsFor, limitFromEnv, logAiUsage, requireUser, tooManyMessage, withinDailyLimit } from '../_shared/guard.ts';

const MODEL = 'claude-haiku-4-5';
// 웹 검색 도구는 모델 세대에 따라 쓸 수 있는 버전이 다르다. haiku-4-5는 기본형을 쓴다.
const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 4 };
// 서버 쪽 도구 사용이 한 번에 안 끝나면 pause_turn으로 잠시 멈춘다. 그때 이어서 요청한다.
const MAX_CONTINUATIONS = 3;

const SYSTEM_PROMPT = `너는 한국에서 파는 상품의 현재 판매가를 찾아주는 도구다.

- 웹 검색으로 그 상품의 정가 또는 일반적인 판매가를 확인한다.
- 기프티콘·모바일 상품권으로 판매되는 가격을 우선한다. 중고 거래가, 할인 쿠폰가,
  묶음 상품 가격은 쓰지 않는다.
- 확실하지 않으면 추측하지 말고 금액을 비워 둔다.
- 마지막 답변은 아래 형식의 JSON 하나만 쓴다. 다른 말은 덧붙이지 않는다.
  {"amount": 숫자 또는 null, "source": "근거로 삼은 곳(가게·사이트 이름)"}`;

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // 웹 검색까지 도는 호출이라 한 번이 꽤 비싸다. 로그인한 사람만, 그것도 하루 몇 번까지만.
    const guard = await requireUser(req);
    if (guard.error) {
      return new Response(JSON.stringify({ error: guard.error }), { status: guard.status, headers: jsonHeaders });
    }
    const usage = await withinDailyLimit(
      guard.admin,
      guard.user.id,
      'price',
      limitFromEnv('PRICE_DAILY_LIMIT', 50),
      limitFromEnv('PRICE_TOTAL_DAILY_LIMIT', 800),
    );
    if (!usage.allowed) {
      return new Response(JSON.stringify({ error: tooManyMessage(usage) }), {
        status: 429,
        headers: jsonHeaders,
      });
    }

    const { brand, name } = await req.json();
    if (!name || !String(name).trim()) {
      return new Response(JSON.stringify({ error: '상품명이 필요해요.' }), { status: 400, headers: jsonHeaders });
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: '가격 검색 서버 설정이 아직 완료되지 않았어요.' }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const query = [brand, name].filter(Boolean).join(' ').trim();
    const client = new Anthropic({ apiKey });
    const request = {
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL],
    };

    // 한 번의 가격 검색이 pause_turn 때문에 여러 요청으로 나뉠 수 있어서, 토큰과 웹 검색
    // 횟수를 응답마다 모아 두었다가 끝나고 한 줄로 적는다(관리자 대시보드의 비용 계산용).
    const spent = { input_tokens: 0, output_tokens: 0 };
    let webSearches = 0;
    const tally = (res) => {
      spent.input_tokens += res.usage?.input_tokens ?? 0;
      spent.output_tokens += res.usage?.output_tokens ?? 0;
      webSearches += res.usage?.server_tool_use?.web_search_requests ?? 0;
    };

    const messages = [{ role: 'user', content: `"${query}"의 현재 판매가를 찾아줘.` }];
    let response = await client.messages.create({ ...request, messages });
    tally(response);

    // 검색이 한 번에 안 끝나면 pause_turn으로 잠시 멈춘다. 지금까지의 답을 그대로 붙여
    // 다시 요청하면 서버가 이어서 진행한다("계속해줘" 같은 말을 덧붙이면 안 된다).
    for (let i = 0; i < MAX_CONTINUATIONS && response.stop_reason === 'pause_turn'; i++) {
      messages.push({ role: 'assistant', content: response.content });
      response = await client.messages.create({ ...request, messages });
      tally(response);
    }

    await logAiUsage(guard.admin, 'price', MODEL, spent, webSearches);

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const parsed = extractJson(text);
    const amount = Number(String(parsed?.amount ?? '').replace(/\D/g, ''));

    return new Response(
      JSON.stringify({
        amount: Number.isFinite(amount) && amount > 0 ? amount : null,
        source: parsed?.source || null,
        query,
      }),
      { headers: jsonHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '가격 검색에 실패했어요.';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});
