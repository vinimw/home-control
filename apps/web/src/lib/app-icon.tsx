import { ImageResponse } from 'next/og';

/** The app icon: a house on the brand color. `safe` leaves extra margin for maskable (cropped) icons. */
export function appIcon(size: number, safe = false): ImageResponse {
  const house = Math.round(size * (safe ? 0.5 : 0.62));
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#2563eb',
      }}
    >
      <svg
        width={house}
        height={house}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
