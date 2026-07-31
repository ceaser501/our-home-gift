import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Supabase 환경변수(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)가 설정되지 않았어요.');
}

export const supabase = createClient(url, anonKey);

export const GIFTICON_TABLE = 'gifticons';
export const IMAGE_BUCKET = 'gifticon-images';
