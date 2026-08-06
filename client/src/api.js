import { supabase, GIFTICON_TABLE, IMAGE_BUCKET } from './supabaseClient';
import { LEGACY_CATEGORIES, normalizeCategory } from './constants';

// 이미지 저장소가 비공개라, 사진을 보려면 그때그때 시간 제한이 붙은 주소를 발급받아야 한다.
// 예전에는 주소가 고정이라 한 번 새면 영원히 열려 있었다(바코드가 찍힌 사진이라 곧 돈이다).
//
// 한 시간이면 앱을 열어 쓰는 동안은 넉넉하다. 그보다 오래 열어둬서 주소가 만료돼도,
// 앱이 다시 화면에 나올 때 목록을 새로 읽으므로(App.jsx의 visibilitychange) 저절로 낫는다.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function imagePathsOf(row) {
  return [...(row?.image_paths || []), row?.barcode_image_path, row?.thumb_image_path].filter(Boolean);
}

// 여러 장을 한 번에 서명받는다. 한 장씩 부르면 목록 한 번 여는 데 수십 번을 왕복한다.
async function signImagePaths(paths) {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  // 사진을 못 불러오는 것과 기프티콘을 못 보는 것은 다르다. 여기서 던지면 사진 하나 때문에
  // 목록 전체가 안 뜬다. 주소 없이 돌려주면 사진 자리만 비고 나머지는 그대로 보인다.
  if (error) return new Map();

  return new Map((data || []).filter((item) => item?.signedUrl).map((item) => [item.path, item.signedUrl]));
}

// image_urls는 image_paths와 자리를 맞춰 둔다(못 받은 자리는 null). 수정 화면이 두 배열을
// 같은 번호로 짝지어 쓰기 때문에, 실패한 것을 빼서 줄이면 엉뚱한 사진이 지워진다.
function attachImageUrls(row, urls) {
  const image_urls = (row.image_paths || []).map((path) => urls.get(path) ?? null);
  return {
    ...row,
    category: normalizeCategory(row.category),
    image_urls,
    image_url: image_urls.find(Boolean) || null,
    barcode_image_url: row.barcode_image_path ? (urls.get(row.barcode_image_path) ?? null) : null,
    // 목록 썸네일. 상품 사진을 못 잘라낸 것(그리고 이 기능이 생기기 전에 올린 것)은
    // 값이 없으니, 쓰는 쪽에서 image_url로 대신한다.
    thumb_image_url: row.thumb_image_path ? (urls.get(row.thumb_image_path) ?? null) : null,
  };
}

async function withImageUrls(row) {
  if (!row) return row;
  return attachImageUrls(row, await signImagePaths(imagePathsOf(row)));
}

async function withImageUrlsMany(rows) {
  const urls = await signImagePaths(rows.flatMap(imagePathsOf));
  return rows.map((row) => attachImageUrls(row, urls));
}

async function uploadImages(familyId, files) {
  const uploaded = [];
  try {
    for (const file of files) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${familyId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);
      uploaded.push(path);
    }
    return uploaded;
  } catch (err) {
    if (uploaded.length) await removeImages(uploaded);
    throw err;
  }
}

export async function removeImages(paths) {
  if (!paths || paths.length === 0) return;
  await supabase.storage.from(IMAGE_BUCKET).remove(paths);
}

// 검색어를 PostgREST의 or() 문법에 안전하게 끼워 넣는다.
// 값에 점·쉼표·괄호·띄어쓰기가 들어가면(예: "황올반+BBQ양념반+콜라1.25L") 따옴표로 감싸지
// 않는 한 필터 문법이 깨져서 검색이 아무것도 안 걸리거나 엉뚱하게 동작한다.
// 큰따옴표와 역슬래시는 그 따옴표 자체를 깨뜨리므로 지운다.
// (%와 _는 LIKE의 와일드카드로 남겨둔다. 검색어에 거의 안 쓰이고, 들어와도 더 넓게 찾을 뿐이다.)
function searchFilter(term) {
  const escaped = term.trim().replace(/["\\]/g, '');
  const pattern = `"%${escaped}%"`;
  return `name.ilike.${pattern},brand.ilike.${pattern},memo.ilike.${pattern}`;
}

export async function listGifticons(params = {}) {
  let query = supabase
    .from(GIFTICON_TABLE)
    .select('*')
    // 한 사람이 여러 가족에 속할 수 있어서 반드시 지금 보는 가족으로 걸러야 한다.
    // RLS는 "내가 속한 가족의 것"까지 모두 허용하므로, 이게 없으면 다른 가족 것이 섞인다.
    .eq('family_id', params.familyId)
    // 가족에서 나간 사람의 기프티콘은 목록에 넣지 않는다.
    .is('hidden_at', null)
    .order('created_at', { ascending: false });

  if (params.category) {
    // 합쳐진 카테고리를 고를 때는 예전 이름으로 저장된 것도 같이 보여준다.
    const legacyKeys = Object.keys(LEGACY_CATEGORIES).filter((old) => LEGACY_CATEGORIES[old] === params.category);
    query = legacyKeys.length
      ? query.in('category', [params.category, ...legacyKeys])
      : query.eq('category', params.category);
  }
  if (params.status) query = query.eq('status', params.status);
  if (params.search?.trim()) query = query.or(searchFilter(params.search));

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return withImageUrlsMany(data);
}

// 사용 내역(누가 어떤 기프티콘을 언제 썼는지). 가족에서 나간 사람이 쓴 것도 남는다.
export async function listUsageHistory(familyId) {
  const { data, error } = await supabase
    .from(GIFTICON_TABLE)
    .select('id, name, brand, amount, owner, used_at, used_by_name, updated_at')
    .eq('family_id', familyId)
    .eq('status', 'used')
    .order('used_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// 금액권을 쓴 만큼 깎는다. 잔액이 남으면 상태는 그대로 두고(아직 쓸 수 있는 돈이다),
// 0이 되는 순간에만 사용완료로 넘긴다.
//
// 쓴 금액을 더하는 계산을 화면이 아니라 여기서 하는 이유: 두 사람이 거의 동시에 썼을 때
// 화면이 들고 있던 옛 잔액으로 덮어쓰면 한 번 쓴 것이 사라진다. 지금 저장된 값을 다시
// 읽어와 그 위에 더한다.
export async function spendVoucher(familyId, id, { spent, user, userName }) {
  const { data: before, error: readError } = await supabase
    .from(GIFTICON_TABLE)
    .select('amount, spent_amount')
    .eq('id', id)
    .single();
  if (readError) throw new Error(readError.message);

  const face = Number(before?.amount || 0);
  // 액면가를 넘겨 쓸 수는 없다. 남은 것보다 크게 넣으면 남은 만큼만 쓴 것으로 본다.
  const nextSpent = Math.min(face, Number(before?.spent_amount || 0) + Number(spent));
  const done = nextSpent >= face;

  const { data, error } = await supabase
    .from(GIFTICON_TABLE)
    .update({
      spent_amount: nextSpent,
      status: done ? 'used' : 'unused',
      used_at: done ? new Date().toISOString().slice(0, 10) : null,
      used_by: done ? user : null,
      used_by_name: done ? userName : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return withImageUrls(data);
}

// 결산에 쓸 최소한의 값만 가져온다. 사용 내역(listUsageHistory)은 이미 쓴 것만 주는데,
// 결산은 "받은 것 중 얼마나 썼나"를 봐야 해서 안 쓴 것과 지나간 것까지 있어야 한다.
// 사진 주소는 서명이 붙어 비싸니 부르지 않는다 — 숫자를 세는 데는 필요 없다.
export async function listGifticonStats(familyId) {
  const { data, error } = await supabase
    .from(GIFTICON_TABLE)
    .select('id, amount, status, expires_at, created_at, is_voucher, spent_amount')
    .eq('family_id', familyId)
    .is('hidden_at', null);
  if (error) throw new Error(error.message);
  return data || [];
}

// 같은 바코드/QR 값을 가진 기프티콘이 이미 등록돼 있는지 확인한다(중복 등록 방지 안내용).
export async function findGifticonByCode(familyId, code, excludeId) {
  if (!code) return null;
  let query = supabase.from(GIFTICON_TABLE).select('id, name').eq('family_id', familyId).eq('code', code).limit(1);
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

export async function createGifticon(familyId, fields, files = [], crops = {}) {
  const image_paths = files.length ? await uploadImages(familyId, files) : [];

  // 올린 사진에서 잘라낸 것들(바코드·상품 사진)까지 모아둔다. 중간에 실패하면 여기 담긴
  // 것만 지우면 되니, 저장에 실패했는데 파일만 남는 일이 없다.
  const uploaded = [...image_paths];
  let barcode_image_path = null;
  let thumb_image_path = null;
  try {
    if (crops.barcodeCropFile) {
      [barcode_image_path] = await uploadImages(familyId, [crops.barcodeCropFile]);
      uploaded.push(barcode_image_path);
    }
    if (crops.thumbCropFile) {
      [thumb_image_path] = await uploadImages(familyId, [crops.thumbCropFile]);
      uploaded.push(thumb_image_path);
    }
  } catch (err) {
    if (uploaded.length) await removeImages(uploaded);
    throw err;
  }

  const { data, error } = await supabase
    .from(GIFTICON_TABLE)
    .insert({
      family_id: familyId,
      name: fields.name,
      category: fields.category || '기타',
      brand: fields.brand || null,
      amount: fields.amount === '' || fields.amount === undefined ? null : Number(fields.amount),
      owner: fields.owner || null,
      code: fields.code || null,
      code_type: fields.code_type || null,
      expires_at: fields.expires_at || null,
      memo: fields.memo || null,
      // 메모를 쓴 사람. 메모가 없으면 남기지 않는다 — 빈 메모에 작성자만 붙어 있으면
      // 나중에 "누가 지웠나"로 읽힌다.
      memo_by: fields.memo ? fields.memo_by || null : null,
      memo_by_name: fields.memo ? fields.memo_by_name || null : null,
      memo_at: fields.memo ? new Date().toISOString() : null,
      // 등록한 사람. 가족에서 나갈 때 이 사람의 기프티콘을 감추는 기준이 된다.
      created_by: fields.created_by || null,
      image_paths,
      barcode_image_path,
      thumb_image_path,
      status: 'unused',
    })
    .select()
    .single();

  if (error) {
    if (uploaded.length) await removeImages(uploaded);
    throw new Error(error.message);
  }
  return withImageUrls(data);
}

export async function updateGifticon(familyId, id, fields, imageChanges = {}) {
  const { addFiles = [], removePaths = [], barcodeCropFile = null, thumbCropFile = null } = imageChanges;
  const updates = { ...fields, updated_at: new Date().toISOString() };

  if ('amount' in updates) {
    updates.amount = updates.amount === '' || updates.amount === undefined || updates.amount === null ? null : Number(updates.amount);
  }

  // 메모 작성자는 화면이 보낸 값을 그대로 쓰지 않는다. 메모가 실제로 바뀌었을 때만 갈아끼운다.
  // 금액만 고치려고 저장했을 뿐인데 메모 작성자까지 바뀌면, 쓰지도 않은 사람 이름이 붙는다.
  const memoAuthor = { by: fields.memo_by ?? null, name: fields.memo_by_name ?? null };
  delete updates.memo_by;
  delete updates.memo_by_name;

  if ('memo' in updates) {
    const { data: before } = await supabase.from(GIFTICON_TABLE).select('memo').eq('id', id).single();
    const nextMemo = updates.memo || null;
    if ((before?.memo || null) !== nextMemo) {
      updates.memo_by = nextMemo ? memoAuthor.by : null;
      updates.memo_by_name = nextMemo ? memoAuthor.name : null;
      updates.memo_at = nextMemo ? new Date().toISOString() : null;
    }
  }

  // uploaded: 이번에 새로 올린 것(저장이 실패하면 지운다)
  // replaced: 새것으로 갈아치워 쓸모없어진 예전 것(저장이 성공해야 지운다)
  const uploaded = [];
  const replaced = [...removePaths];

  if (addFiles.length || removePaths.length || barcodeCropFile || thumbCropFile) {
    const { data: existing } = await supabase
      .from(GIFTICON_TABLE)
      .select('image_paths, barcode_image_path, thumb_image_path')
      .eq('id', id)
      .single();

    if (addFiles.length || removePaths.length) {
      const currentPaths = existing?.image_paths || [];
      const newPaths = addFiles.length ? await uploadImages(familyId, addFiles) : [];
      uploaded.push(...newPaths);
      updates.image_paths = currentPaths.filter((p) => !removePaths.includes(p)).concat(newPaths);
    }

    // 잘라낸 것들은 새로 만들어졌을 때만 갈아끼운다. 사진을 한 장 더 붙였는데 거기서
    // 바코드나 상품 사진을 못 찾았다고 멀쩡한 예전 것을 지우면, 있던 게 사라진다.
    if (barcodeCropFile) {
      if (existing?.barcode_image_path) replaced.push(existing.barcode_image_path);
      [updates.barcode_image_path] = await uploadImages(familyId, [barcodeCropFile]);
      uploaded.push(updates.barcode_image_path);
    }

    if (thumbCropFile) {
      if (existing?.thumb_image_path) replaced.push(existing.thumb_image_path);
      [updates.thumb_image_path] = await uploadImages(familyId, [thumbCropFile]);
      uploaded.push(updates.thumb_image_path);
    }
  }

  const { data, error } = await supabase.from(GIFTICON_TABLE).update(updates).eq('id', id).select().single();

  if (error) {
    if (uploaded.length) await removeImages(uploaded);
    throw new Error(error.message);
  }

  if (replaced.length) await removeImages(replaced);
  return withImageUrls(data);
}

// 기프티콘 이미지를 서버로 보내 상품명·상호·금액·유효기간을 받아온다.
// (모델 API 키가 브라우저에 노출되면 안 되므로 Edge Function을 거친다.)
export async function analyzeGifticonImages(images, categories) {
  const { data, error } = await supabase.functions.invoke('analyze-gifticon', {
    body: { images, categories },
  });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || '이미지 인식에 실패했어요.');
  }
  return data;
}

export async function searchPrice({ brand, name }) {
  const { data, error } = await supabase.functions.invoke('search-price', {
    body: { brand, name },
  });
  if (error) {
    // supabase-js는 함수가 non-2xx를 돌려주면 "Edge Function returns a non-2xx status code"라는
    // 뭉뚱그린 메시지만 주고, 우리 함수가 실제로 응답한 { error: '...' } 본문은 안 보여준다.
    // error.context가 원본 Response라서 그 안의 진짜 메시지를 직접 꺼내온다.
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || '가격 검색에 실패했어요.');
  }
  return data;
}

// 현재 위치 주변에서 이 브랜드의 매장을 가까운 순으로 찾아온다.
// (카카오 API 키가 브라우저에 노출되면 안 되므로 Edge Function을 거친다.)
export async function searchNearbyStores({ query, lat, lng }) {
  const { data, error } = await supabase.functions.invoke('search-places', {
    body: { query, lat, lng },
  });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || '주변 매장을 찾지 못했어요.');
  }
  return data.stores || [];
}

// 내 위치에서 매장까지 가는 길(좌표 목록·거리·소요시간).
// mode: 'car'는 카카오 길찾기, 'walk'는 티맵 보행자 경로에서 받아온다.
export async function fetchRoute({ mode, origin, destination }) {
  const { data, error } = await supabase.functions.invoke('search-places', {
    body: { mode: mode === 'walk' ? 'walk' : 'route', origin, destination },
  });
  const detail = error ? await error.context?.json?.().catch(() => null) : null;
  const message = detail?.error || data?.error || (error ? error.message : null);

  // 길찾기를 모르는 옛 함수는 이 요청을 매장 검색으로 읽고 "브랜드 이름이 없다"고 답한다.
  // 그대로 보여주면 원인을 짐작할 수 없어서, 무엇을 해야 하는지로 바꿔준다.
  if (message?.includes('브랜드 이름')) {
    throw new Error('길찾기가 서버에 아직 반영되지 않았어요. search-places 함수를 다시 배포해주세요.');
  }
  if (message) throw new Error(message);
  return data;
}

export async function deleteGifticon(id) {
  const { data: existing } = await supabase
    .from(GIFTICON_TABLE)
    .select('image_paths, barcode_image_path, thumb_image_path')
    .eq('id', id)
    .single();

  const { error } = await supabase.from(GIFTICON_TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);

  const paths = imagePathsOf(existing);
  if (paths.length) await removeImages(paths);
}

// 운영자 공지. 아직 시작 안 된 글은 RLS가 걸러주고, 여기서는 끝난 글만 더 걸러낸다.
// 끝난 글까지 받아오는 이유: "지난 공지"로 모아 보여줘야 해서다. 화면에서 나눠 쓴다.
export async function listNotices() {
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .order('starts_at', { ascending: false })
    .limit(30);
  // 공지를 못 불러오는 것과 기프티콘을 못 보는 것은 다르다. 공지는 없어도 앱이 돌아가야
  // 하므로 던지지 않고 빈 목록으로 넘긴다(테이블을 아직 안 만든 경우도 여기로 온다).
  if (error) return [];
  return data || [];
}

// 가족이 기프티콘을 쓰거나 올린 기록. 폰을 울릴 일은 아니라 푸시로는 보내지 않고
// 앱 안에서만 쌓아뒀다가, 헤더의 종을 누르면 보여준다.
export async function listActivities(familyId) {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })
    .limit(50);
  // 활동 기록을 못 읽는 것과 기프티콘을 못 보는 것은 다르다. 없어도 앱은 돌아가야 한다
  // (테이블을 아직 안 만든 경우도 여기로 온다).
  if (error) return [];
  return data || [];
}

// 내가 이 가족의 알림을 어디까지 봤는지. 아직 한 번도 안 열었으면 null이 온다.
export async function getActivityLastRead(familyId) {
  const { data, error } = await supabase
    .from('activity_reads')
    .select('last_read_at')
    .eq('family_id', familyId)
    .maybeSingle();
  if (error) return null;
  return data?.last_read_at || null;
}

export async function markActivitiesRead(familyId, userId) {
  const { error } = await supabase
    .from('activity_reads')
    .upsert({ user_id: userId, family_id: familyId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,family_id' });
  if (error) throw new Error(error.message);
}

export async function savePushSubscription({ userId, familyId, subscription }) {
  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      family_id: familyId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw new Error(error.message);
}

// 실제 발송과 같은 길(서버 → 저장된 구독 목록 → 웹푸시)로 알림을 한 번 보내본다.
// 알림을 꺼둔 상태면 보낼 곳이 없어서 아무것도 오지 않는다(그게 확인하려는 것).
export async function sendTestNotification() {
  const { data, error } = await supabase.functions.invoke('send-test-notification');
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || '알림 테스트에 실패했어요.');
  }
  return data;
}

// 이 브라우저의 구독이 실제로 "보내는 목록"에 들어 있는지. 알림 버튼의 켜짐/꺼짐은
// 브라우저에 구독이 있는지가 아니라 이 목록에 있는지로 판단해야 실제 동작과 어긋나지 않는다.
export async function hasPushSubscription(endpoint) {
  const { count, error } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('endpoint', endpoint);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// 알림을 끌 때는 이 계정으로 등록된 구독을 전부 지운다.
// 앱을 다시 설치하거나 브라우저가 구독을 갱신하면 주소(endpoint)가 새로 생기는데,
// 지금 주소 하나만 지우면 예전 주소가 목록에 남아 그쪽으로 알림이 계속 갔다.
export async function deleteMyPushSubscriptions(userId) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// ⚠️ 테스트 전용: 가족/구성원/기프티콘/이미지/가입계정을 전부 지운다.
export async function resetAllData() {
  const { data, error } = await supabase.functions.invoke('reset-all-data', {
    body: { token: import.meta.env.VITE_RESET_TOKEN },
  });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || '초기화에 실패했어요.');
  }
  return data;
}

// "이건 내가 쓸게" 표시. 한 사람만 찜할 수 있어서, 이미 다른 사람이 찜해뒀으면
// { ok: false, claimed_by_name } 이 돌아온다.
//
// 찜은 잠금이 아니라 표시다. 찜해둔 것도 다른 사람이 바코드를 열고 쓸 수 있다.
// 잠그면 찜해둔 사람이 잊었을 때 아무도 못 쓰게 되는데, 그게 막으려던 것보다 나쁘다.
export async function claimGifticon(id) {
  const { data, error } = await supabase.rpc('claim_gifticon', { gid: id });
  if (error) throw new Error(error.message || '찜하지 못했어요.');
  return data;
}

export async function releaseGifticon(id) {
  const { error } = await supabase.rpc('release_gifticon', { gid: id });
  if (error) throw new Error(error.message || '찜을 풀지 못했어요.');
}
