// 상품의 현재 판매가를 웹 검색으로 찾는다. 두 곳에서 쓴다.
//   - search-price: 등록 화면의 "가격 검색" 버튼(지금은 화면에서 꺼져 있다)
//   - admin-stats(resource=price-estimates): 관리자 통계의 "예상 금액 산출"
//
// 처음에는 search-price 안에 있었다. 관리자 산출이 같은 일을 하게 되면서 떼어냈다 —
// 프롬프트가 두 벌이면 한쪽만 고쳐지고 두 숫자가 다른 기준으로 나온다.

import Anthropic from 'npm:@anthropic-ai/sdk@0.115.0';

export const PRICE_MODEL = 'claude-haiku-4-5';
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

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export type PriceResult = {
  amount: number | null;
  source: string | null;
  query: string;
  spent: { input_tokens: number; output_tokens: number };
  webSearches: number;
};

export async function findPrice(apiKey: string, brand: string | null, name: string): Promise<PriceResult> {
  const query = [brand, name].filter(Boolean).join(' ').trim();
  const client = new Anthropic({ apiKey });
  const request = {
    model: PRICE_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [WEB_SEARCH_TOOL],
  };

  // 한 번의 가격 검색이 pause_turn 때문에 여러 요청으로 나뉠 수 있어서, 토큰과 웹 검색
  // 횟수를 응답마다 모아 두었다가 끝나고 한 줄로 적는다(관리자 대시보드의 비용 계산용).
  const spent = { input_tokens: 0, output_tokens: 0 };
  let webSearches = 0;
  // deno-lint-ignore no-explicit-any
  const tally = (res: any) => {
    spent.input_tokens += res.usage?.input_tokens ?? 0;
    spent.output_tokens += res.usage?.output_tokens ?? 0;
    webSearches += res.usage?.server_tool_use?.web_search_requests ?? 0;
  };

  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: 'user', content: `"${query}"의 현재 판매가를 찾아줘.` }];
  // deno-lint-ignore no-explicit-any
  let response: any = await client.messages.create({ ...request, messages } as any);
  tally(response);

  // 검색이 한 번에 안 끝나면 pause_turn으로 잠시 멈춘다. 지금까지의 답을 그대로 붙여
  // 다시 요청하면 서버가 이어서 진행한다("계속해줘" 같은 말을 덧붙이면 안 된다).
  for (let i = 0; i < MAX_CONTINUATIONS && response.stop_reason === 'pause_turn'; i++) {
    messages.push({ role: 'assistant', content: response.content });
    // deno-lint-ignore no-explicit-any
    response = await client.messages.create({ ...request, messages } as any);
    tally(response);
  }

  const text = response.content
    // deno-lint-ignore no-explicit-any
    .filter((block: any) => block.type === 'text')
    // deno-lint-ignore no-explicit-any
    .map((block: any) => block.text)
    .join('\n');

  const parsed = extractJson(text);
  const amount = Number(String(parsed?.amount ?? '').replace(/\D/g, ''));

  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    source: parsed?.source || null,
    query,
    spent,
    webSearches,
  };
}
