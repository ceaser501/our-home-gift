import { supabase, GIFTICON_TABLE, IMAGE_BUCKET } from './supabaseClient';

function withImageUrls(row) {
  if (!row) return row;
  const paths = row.image_paths || [];
  const image_urls = paths.map((path) => supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
  return { ...row, image_urls, image_url: image_urls[0] || null };
}

async function uploadImages(files) {
  const uploaded = [];
  try {
    for (const file of files) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
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

export async function createGifticon(fields, files = []) {
  const image_paths = files.length ? await uploadImages(files) : [];

  const { data, error } = await supabase
    .from(GIFTICON_TABLE)
    .insert({
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
      status: 'unused',
    })
    .select()
    .single();

  if (error) {
    if (image_paths.length) await removeImages(image_paths);
    throw new Error(error.message);
  }
  return withImageUrls(data);
}

export async function updateGifticon(id, fields, imageChanges = {}) {
  const { addFiles = [], removePaths = [] } = imageChanges;
  const updates = { ...fields, updated_at: new Date().toISOString() };

  if ('amount' in updates) {
    updates.amount = updates.amount === '' || updates.amount === undefined || updates.amount === null ? null : Number(updates.amount);
  }

  let newPaths = [];
  if (addFiles.length || removePaths.length) {
    const { data: existing } = await supabase.from(GIFTICON_TABLE).select('image_paths').eq('id', id).single();
    const currentPaths = existing?.image_paths || [];
    newPaths = addFiles.length ? await uploadImages(addFiles) : [];
    updates.image_paths = currentPaths.filter((p) => !removePaths.includes(p)).concat(newPaths);
  }

  const { data, error } = await supabase.from(GIFTICON_TABLE).update(updates).eq('id', id).select().single();

  if (error) {
    if (newPaths.length) await removeImages(newPaths);
    throw new Error(error.message);
  }

  if (removePaths.length) await removeImages(removePaths);
  return withImageUrls(data);
}

export async function deleteGifticon(id) {
  const { data: existing } = await supabase.from(GIFTICON_TABLE).select('image_paths').eq('id', id).single();

  const { error } = await supabase.from(GIFTICON_TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);

  if (existing?.image_paths?.length) await removeImages(existing.image_paths);
}
