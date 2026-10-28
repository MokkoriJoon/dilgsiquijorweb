import { supabase } from './supabase';

/**
 * Profile-picture upload helpers backed by a Supabase Storage bucket.
 *
 * The bucket ("avatars") is PUBLIC — avatar URLs are stored in
 * `profiles.avatar_url` and shown to everyone (sidebar, profile modal,
 * dashboards). Images are compressed client-side (resized + re-encoded to
 * JPEG) before uploading so the bucket stays small and loads fast.
 *
 * Bucket setup & policies live at the bottom of supabase/schema.sql
 * (section 8) — run that script once in the Supabase SQL editor.
 */

export const AVATAR_BUCKET = 'avatars';

/** Longest edge (px) of the stored image — plenty for a 96px avatar circle. */
const MAX_DIMENSION = 512;
/** Re-encoded JPEG quality (0–1). 0.82 ≈ visually lossless at this size. */
const JPEG_QUALITY = 0.82;
/** Reject absurdly large source files outright (e.g. 40 MB raw camera shots). */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export interface AvatarUploadResult {
  /** Public URL to store in `profiles.avatar_url`. */
  url: string;
  /** Bytes uploaded (after compression). */
  bytes: number;
}

/**
 * Resize (keeping aspect ratio) and re-encode an image file to JPEG using a
 * canvas. Falls back to the original file if decoding fails (e.g. SVG or a
 * format the browser cannot rasterize).
 */
async function compressImage(file: File): Promise<Blob> {
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode the image.'));
      el.src = dataUrl;
    });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // White background so transparent PNGs don't turn black in JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY),
    );
    // Only use the compressed version if it actually helps.
    if (blob && blob.size < file.size) return blob;
    return file;
  } catch {
    // Not rasterizable (or canvas unavailable) → upload as-is.
    return file;
  }
}

/**
 * Compress + upload a user's profile picture and return its public URL.
 * Does NOT write to the profiles table — the caller saves the URL together
 * with the rest of the profile edit.
 */
export async function uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, WebP…).');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That image is too large (max 20 MB before compression).');
  }

  const blob = await compressImage(file);

  // One fixed path per user → uploading a new picture replaces the old one
  // (no orphaned files). Cache-bust with a timestamp when displaying.
  const ext = blob === file ? (file.name.split('.').pop() ?? 'jpg').toLowerCase() : 'jpg';
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });

  if (uploadError) {
    throw new Error(
      uploadError.message.includes('bucket')
        ? 'The "avatars" storage bucket does not exist yet. Run supabase/schema.sql in the Supabase SQL editor once to create it.'
        : `Upload failed: ${uploadError.message}`,
    );
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?t=${Date.now()}`, bytes: blob.size };
}

/** Remove the current user's avatar files from the bucket (best-effort). */
export async function deleteAvatars(userId: string): Promise<void> {
  const { data: items } = await supabase.storage
    .from(AVATAR_BUCKET)
    .list(`${userId}`, { limit: 100 });
  const paths = (items ?? []).map((f) => `${userId}/${f.name}`);
  if (paths.length) {
    await supabase.storage.from(AVATAR_BUCKET).remove(paths);
  }
}
