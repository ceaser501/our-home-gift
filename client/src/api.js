import { supabase, GIFTICON_TABLE, IMAGE_BUCKET } from './supabaseClient';

function withImageUrls(row) {
  if (!row) return row;
  const paths = row.image_paths || [];
  const image_urls = paths.map((path) => supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
  const barcode_image_url = row.barcode_image_path
    ? supabase.storage.from(IMAGE_BUCKET).getPublicUrl(row.barcode_image_path).data.publicUrl
    : null;
  return { ...row, image_urls, image_url: image_urls[0] || null, barcode_image_url };
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

export async function listGifticons(params = {}) {
  let query = supabase.from(GIFTICON_TABLE).select('*').order('created_at', { ascending: false });

  if (params.category) query = query.eq('category', params.category);
  if (params.status) query = query.eq('status', params.status);
  if (params.search) {
    const term = params.search.replace(/[%,]/g, '');
    query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%,memo.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map(withImageUrls);
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

export async function deletePushSubscription(endpoint) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw new Error(error.message);
}
