import { supabase, GIFTICON_TABLE, IMAGE_BUCKET } from './supabaseClient';
import { LEGACY_CATEGORIES, normalizeCategory } from './constants';

function withImageUrls(row) {
  if (!row) return row;
  const paths = row.image_paths || [];
  const image_urls = paths.map((path) => supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
  const barcode_image_url = row.barcode_image_path
    ? supabase.storage.from(IMAGE_BUCKET).getPublicUrl(row.barcode_image_path).data.publicUrl
    : null;
  return { ...row, category: normalizeCategory(row.category), image_urls, image_url: image_urls[0] || null, barcode_image_url };
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

async function removeImages(paths) {
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
  return data.map(withImageUrls);
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

// 같은 바코드/QR 값을 가진 기프티콘이 이미 등록돼 있는지 확인한다(중복 등록 방지 안내용).
export async function findGifticonByCode(familyId, code, excludeId) {
  if (!code) return null;
  let query = supabase.from(GIFTICON_TABLE).select('id, name').eq('family_id', familyId).eq('code', code).limit(1);
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

export async function createGifticon(familyId, fields, files = [], barcodeCropFile = null) {
  const image_paths = files.length ? await uploadImages(familyId, files) : [];

  let barcode_image_path = null;
  try {
    if (barcodeCropFile) {
      [barcode_image_path] = await uploadImages(familyId, [barcodeCropFile]);
    }
  } catch (err) {
    if (image_paths.length) await removeImages(image_paths);
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
      // 등록한 사람. 가족에서 나갈 때 이 사람의 기프티콘을 감추는 기준이 된다.
      created_by: fields.created_by || null,
      image_paths,
      barcode_image_path,
      status: 'unused',
    })
    .select()
    .single();

  if (error) {
    const cleanup = barcode_image_path ? [...image_paths, barcode_image_path] : image_paths;
    if (cleanup.length) await removeImages(cleanup);
    throw new Error(error.message);
  }
  return withImageUrls(data);
}

export async function updateGifticon(familyId, id, fields, imageChanges = {}) {
  const { addFiles = [], removePaths = [], barcodeCropFile = null } = imageChanges;
  const updates = { ...fields, updated_at: new Date().toISOString() };

  if ('amount' in updates) {
    updates.amount = updates.amount === '' || updates.amount === undefined || updates.amount === null ? null : Number(updates.amount);
  }

  let newPaths = [];
  let oldBarcodeImagePath = null;

  if (addFiles.length || removePaths.length || barcodeCropFile) {
    const { data: existing } = await supabase
      .from(GIFTICON_TABLE)
      .select('image_paths, barcode_image_path')
      .eq('id', id)
      .single();

    if (addFiles.length || removePaths.length) {
      const currentPaths = existing?.image_paths || [];
      newPaths = addFiles.length ? await uploadImages(familyId, addFiles) : [];
      updates.image_paths = currentPaths.filter((p) => !removePaths.includes(p)).concat(newPaths);
    }

    if (barcodeCropFile) {
      oldBarcodeImagePath = existing?.barcode_image_path || null;
      [updates.barcode_image_path] = await uploadImages(familyId, [barcodeCropFile]);
    }
  }

  const { data, error } = await supabase.from(GIFTICON_TABLE).update(updates).eq('id', id).select().single();

  if (error) {
    const cleanup = updates.barcode_image_path ? [...newPaths, updates.barcode_image_path] : newPaths;
    if (cleanup.length) await removeImages(cleanup);
    throw new Error(error.message);
  }

  const cleanupOld = oldBarcodeImagePath ? [...removePaths, oldBarcodeImagePath] : removePaths;
  if (cleanupOld.length) await removeImages(cleanupOld);
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

export async function deleteGifticon(id) {
  const { data: existing } = await supabase
    .from(GIFTICON_TABLE)
    .select('image_paths, barcode_image_path')
    .eq('id', id)
    .single();

  const { error } = await supabase.from(GIFTICON_TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);

  const paths = [...(existing?.image_paths || [])];
  if (existing?.barcode_image_path) paths.push(existing.barcode_image_path);
  if (paths.length) await removeImages(paths);
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
