import { getSupabase } from "../lib/supabase.ts";

type PostArgs = {
  p_space_id: string;
  p_body: string;
  p_media_ids: string[];
  p_reply_to_id?: string;
};

export async function postMessageWithPhotos(args: PostArgs): Promise<string> {
  const supabase = getSupabase();
  const rpc = supabase.rpc.bind(supabase) as (
    fn: "post_message_with_photos",
    args: PostArgs,
  ) => Promise<{ data: string | null; error: { message: string } | null }>;
  const { data, error } = await rpc("post_message_with_photos", args);
  if (error) throw error;
  if (!data) throw new Error("Could not post the photos.");
  return data;
}
