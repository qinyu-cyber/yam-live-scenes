'use client'

import { useState } from 'react'
import type { CharId } from '@/lib/types'

// Single source of truth for character display names + accent colors.
export const CAST_UI: Record<CharId, { name: string; accent: string }> = {
  gojo: { name: 'Gojo Satoru', accent: '#38bdf8' },
  sukuna: { name: 'Sukuna', accent: '#dc2626' },
  toji: { name: 'Toji Fushiguro', accent: '#94a3b8' },
  choso: { name: 'Choso', accent: '#a855f7' },
  nanami: { name: 'Nanami Kento', accent: '#f59e0b' },
  geto: { name: 'Geto Suguru', accent: '#8b5cf6' },
}

type PortraitProps = {
  id: CharId
  name: string
  accent: string
  speaking: boolean
  /** Someone ELSE is speaking — VN convention dims the rest of the cast. */
  dimmed: boolean
}

// Standee: the full-body cutout stands directly on the backdrop — no frame.
// The speaker gets an accent glow that follows the PNG's alpha edge.
export default function Portrait({ id, name, accent, speaking, dimmed }: PortraitProps) {
  const [imgOk, setImgOk] = useState(true)

  return (
    <div
      className={`relative h-full origin-bottom transition-transform duration-300 ${
        speaking ? 'scale-105' : ''
      }`}
    >
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/images/portraits/${id}.png`}
          alt={name}
          className="h-full w-auto max-w-none object-contain object-bottom transition-[filter] duration-300"
          style={{
            filter: speaking
              ? `drop-shadow(0 0 20px ${accent}aa) drop-shadow(0 0 56px ${accent}55)`
              : dimmed
                ? 'brightness(0.55)'
                : undefined,
          }}
          onError={() => setImgOk(false)}
        />
      ) : (
        // No art — fall back to the letter card so the slot stays clickable.
        <div
          className="flex h-full w-28 items-center justify-center rounded-2xl border sm:w-32"
          style={{
            borderColor: speaking ? accent : 'rgba(255,255,255,0.15)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.35))',
          }}
        >
          <span
            className="text-6xl font-black"
            style={{ color: accent, textShadow: `0 0 20px ${accent}88` }}
          >
            {name[0]}
          </span>
        </div>
      )}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/50 px-3 py-0.5 text-xs font-semibold tracking-wide text-white/90 backdrop-blur-sm"
        style={speaking ? { borderColor: accent, color: accent } : undefined}
      >
        {name}
      </div>
    </div>
  )
}
