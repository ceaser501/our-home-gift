import { supabase, GIFTICON_TABLE, IMAGE_BUCKET } from './supabaseClient';

function withImageUrl(row) {
  if (!row) return row;
  const image_url = row.image_path
    ? supabase.storage.from(IMAGE_BUCKET).getPublicUrl(row.image_path).data.publicUrl
    : null;
  return { ...row, image_url };
}

async function uploadImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new Error(`이미지 업로드 실패: ${error.message}`);
  return path;
}

async function removeImage(path) {
  if (!path) return;
  await supabase.storage.from(IMAGE_BUCKET).remove([path]);
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
  return data.map(withImageUrl);
}

export async function createGifticon(fields, file) {
  const image_path = file ? await uploadImage(file) : null;

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
      image_path,
      status: 'unused',
    })
    .select()
    .single();

  if (error) {
    if (image_path) await removeImage(image_path);
    throw new Error(error.message);
  }
  return withImageUrl(data);
}

export async function updateGifticon(id, fields, file) {
  const updates = { ...fields, updated_at: new Date().toISOString() };

  if ('amount' in updates) {
    updates.amount = updates.amount === '' || updates.amount === undefined || updates.amount === null ? null : Number(updates.amount);
  }

  let oldImagePath = null;
  if (file) {
    const { data: existing } = await supabase.from(GIFTICON_TABLE).select('image_path').eq('id', id).single();
    oldImagePath = existing?.image_path || null;
    updates.image_path = await uploadImage(file);
  }

  const { data, error } = await supabase.from(GIFTICON_TABLE).update(updates).eq('id', id).select().single();

  if (error) {
    if (file && updates.image_path) await removeImage(updates.image_path);
    throw new Error(error.message);
  }

  if (oldImagePath) await removeImage(oldImagePath);
  return withImageUrl(data);
}

export async function deleteGifticon(id) {
  const { data: existing } = await supabase.from(GIFTICON_TABLE).select('image_path').eq('id', id).single();

  const { error } = await supabase.from(GIFTICON_TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);

  if (existing?.image_path) await removeImage(existing.image_path);
}
