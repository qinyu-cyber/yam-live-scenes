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
}

export default function Portrait({ id, name, accent, speaking }: PortraitProps) {
  const [imgOk, setImgOk] = useState(true)

  return (
    <div
      className={`flex flex-col items-center gap-2 transition-all duration-300 ${
        speaking ? 'scale-110 opacity-100' : 'scale-100 opacity-60'
      }`}
    >
      <div
        className="relative h-40 w-28 overflow-hidden rounded-2xl border backdrop-blur-md transition-shadow duration-300 sm:h-48 sm:w-32"
        style={{
          borderColor: speaking ? accent : 'rgba(255,255,255,0.15)',
          boxShadow: speaking
            ? `0 0 24px ${accent}aa, 0 0 60px ${accent}44`
            : '0 4px 16px rgba(0,0,0,0.4)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.35))',
        }}
      >
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/images/portraits/${id}.png`}
            alt={name}
            className="h-full w-full object-cover object-top"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span
              className="text-6xl font-black"
              style={{ color: accent, textShadow: `0 0 20px ${accent}88` }}
            >
              {name[0]}
            </span>
          </div>
        )}
        {speaking && (
          <div
            className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl"
            style={{ boxShadow: `inset 0 0 24px ${accent}66` }}
          />
        )}
      </div>
      <div
        className="rounded-full border border-white/10 bg-black/50 px-3 py-0.5 text-xs font-semibold tracking-wide text-white/90 backdrop-blur-sm"
        style={speaking ? { borderColor: accent, color: accent } : undefined}
      >
        {name}
      </div>
    </div>
  )
}
