/**
 * Circular avatar: shows the user's uploaded profile picture when available,
 * otherwise colored initials (deterministic per name so everyone gets a
 * stable look). Used in the sidebar, header, profile modal and user lists.
 */
export function initialsOf(name?: string | null): string {
  return (name ?? 'S')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

const PALETTE = [
  'bg-blue-700',
  'bg-emerald-600',
  'bg-violet-600',
  'bg-rose-600',
  'bg-amber-600',
  'bg-cyan-700',
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  /** Pixel size of the circle. */
  size?: number;
  className?: string;
  /** Extra classes for the img element (e.g. object-contain for logos). */
  imgClassName?: string;
}

export default function Avatar({ name, src, size = 40, className = '', imgClassName = 'object-cover' }: AvatarProps) {
  const fontSize = Math.max(9, Math.round(size * 0.38));
  const showFallback = !src || src.startsWith('__broken__');

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-full flex-shrink-0 ${
        showFallback ? colorFor(name ?? 'S') + ' text-white font-semibold' : 'bg-gray-100'
      } ${className}`}
      style={{ width: size, height: size, fontSize }}
    >
      {showFallback ? (
        initialsOf(name)
      ) : (
        <img
          src={src ?? undefined}
          alt={name ? `${name}'s photo` : 'Profile photo'}
          className={`absolute inset-0 w-full h-full ${imgClassName}`}
          onError={(e) => {
            // Broken/expired URL → hide image, fall back to initials.
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
    </span>
  );
}
