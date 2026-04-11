import { supabase } from './supabase';

async function adjustLikeCount(contentId: string, contentType: 'post' | 'project', delta: 1 | -1) {
  const table = contentType === 'post' ? 'posts' : 'projects';
  const { data, error } = await supabase.from(table).select('likecount').eq('id', contentId).single();
  if (error) throw error;
  const next = Math.max(0, (data?.likecount || 0) + delta);
  const { error: upErr } = await supabase.from(table).update({ likecount: next }).eq('id', contentId);
  if (upErr) throw upErr;
}

/**
 * 点赞 / 取消赞。
 * 不再调用 increment_* / decrement_* RPC：若未在 Supabase 创建对应函数会 404，且 Realtime 未开时列表不会刷新。
 */
export const toggleLike = async (userId: string, contentId: string, contentType: 'post' | 'project') => {
  // 不按 contenttype 过滤：旧数据可能为 null，避免重复插入或无法取消
  const { data: existingLike, error: checkError } = await supabase
    .from('likes')
    .select('*')
    .eq('userid', userId)
    .eq('contentid', contentId)
    .maybeSingle();

  if (checkError) throw checkError;

  if (existingLike) {
    const { error: deleteError } = await supabase.from('likes').delete().eq('id', existingLike.id);
    if (deleteError) throw deleteError;
    await adjustLikeCount(contentId, contentType, -1);
    return false;
  }

  const { error: insertError } = await supabase.from('likes').insert([
    {
      userid: userId,
      contentid: contentId,
      contenttype: contentType,
      createdat: Date.now(),
    },
  ]);
  if (insertError) throw insertError;
  await adjustLikeCount(contentId, contentType, 1);
  return true;
};
