'use client'

import { useState, type ReactNode } from 'react'
import type { CharId } from '@/lib/types'
import Portrait, { CAST_UI } from './Portrait'
import Captions from './Captions'

const CAST_ORDER: CharId[] = ['gojo', 'sukuna', 'toji', 'choso', 'nanami', 'geto']
// Gentle arc: edge characters sit higher, center characters lower.
const ARC_OFFSETS = [0, 16, 28, 28, 16, 0]

type StageProps = {
  speaking: CharId | null
  caption: { speaker?: string; text: string } | null
  narration?: string | null
  onPortraitSelect?: (id: CharId) => void
  children?: ReactNode
  debug?: ReactNode
}

export default function Stage({
  speaking,
  caption,
  narration,
  onPortraitSelect,
  children,
  debug,
}: StageProps) {
  const [bgOk, setBgOk] = useState(true)

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Warm sunset gradient — always renders, sits under the image. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #1e1b4b 0%, #7c2d5e 35%, #c2410c 65%, #f59e0b 90%, #fbbf24 100%)',
        }}
      />
      {bgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/images/bg-villa.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setBgOk(false)}
        />
      )}
      {/* Darkening vignette so UI stays readable over any background. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />

      {/* Narration strip — on-screen only, never spoken by a character. */}
      {narration && (
        <div className="absolute inset-x-0 top-6 flex justify-center px-6">
          <p className="max-w-2xl rounded-xl bg-black/45 px-5 py-3 text-center text-sm italic leading-relaxed text-amber-100/90 backdrop-blur">
            {narration}
          </p>
        </div>
      )}

      {/* Cast arc across the lower-middle. */}
      <div className="absolute inset-x-0 bottom-40 flex items-end justify-center gap-3 px-4 sm:gap-6">
        {CAST_ORDER.map((id, i) => (
          <div
            key={id}
            style={{ transform: `translateY(${ARC_OFFSETS[i]}px)` }}
            className={onPortraitSelect ? 'cursor-pointer' : undefined}
            onClick={() => onPortraitSelect?.(id)}
            title={onPortraitSelect ? `private call with ${CAST_UI[id].name}` : undefined}
          >
            <Portrait
              id={id}
              name={CAST_UI[id].name}
              accent={CAST_UI[id].accent}
              speaking={speaking === id}
            />
          </div>
        ))}
      </div>

      {/* Caption bar, bottom-center. */}
      <div className="absolute inset-x-0 bottom-6">
        <Captions caption={caption} accent={speaking ? CAST_UI[speaking].accent : undefined} />
      </div>

      {/* Conversation status slot, bottom-center above the captions. */}
      <div className="absolute inset-x-0 bottom-24 flex justify-center">{children}</div>

      {/* Slot for DebugPanel. */}
      {debug}
    </div>
  )
}
