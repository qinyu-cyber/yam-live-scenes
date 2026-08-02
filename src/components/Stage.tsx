'use client'

import { useState, type ReactNode } from 'react'
import type { CharId } from '@/lib/types'
import Portrait, { CAST_UI } from './Portrait'
import Captions from './Captions'

const CAST_ORDER: CharId[] = ['gojo', 'sukuna', 'toji', 'choso', 'nanami', 'geto']

type StageProps = {
  speaking: CharId | null
  caption: { speaker?: string; text: string } | null
  narration?: string | null
  /** Relationship meter shown in the top bar. */
  hearts: number
  /** Beat position within the current scene — drives the caption pips. */
  progress?: { i: number; total: number } | null
  onPortraitSelect?: (id: CharId) => void
  children?: ReactNode
  debug?: ReactNode
}

export default function Stage({
  speaking,
  caption,
  narration,
  hearts,
  progress,
  onPortraitSelect,
  children,
  debug,
}: StageProps) {
  const [bgOk, setBgOk] = useState(true)

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Deep-violet night gradient — always renders, sits under the image. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #0b0716 0%, #241a4d 40%, #3b2470 70%, #5b3aa0 100%)',
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

      {/* Reality-show top bar: REC badge, scene chip, relationship hearts. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-black/70 px-4 py-3 backdrop-blur-sm">
        <span className="flex items-center gap-2 text-sm font-bold tracking-[0.25em] text-red-500">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          REC
        </span>
        <span className="rounded-full border border-white/10 bg-white/10 px-4 py-1 text-sm text-white/90">
          Night 1 · The Villa
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-[#42152b] px-3.5 py-1 text-sm font-semibold text-rose-200">
          <span className="text-rose-400">♥</span>
          {hearts}
        </span>
      </div>

      {/* Narration strip — on-screen only, never spoken by a character. */}
      {narration && (
        <div className="absolute inset-x-0 top-16 flex justify-center px-6">
          <p className="max-w-2xl rounded-xl bg-black/45 px-5 py-3 text-center text-sm italic leading-relaxed text-violet-100/90 backdrop-blur">
            {narration}
          </p>
        </div>
      )}

      {/* Standee row: full-height cutouts on one ground line at the bottom of
          the backdrop; the dialogue card overlays their legs, VN-style. */}
      <div className="absolute inset-x-0 bottom-0 flex h-[85vh] items-end justify-center gap-1 px-4 sm:gap-3">
        {CAST_ORDER.map((id) => (
          <div
            key={id}
            className={`h-full ${onPortraitSelect ? 'cursor-pointer' : ''}`}
            onClick={() => onPortraitSelect?.(id)}
            title={onPortraitSelect ? `private call with ${CAST_UI[id].name}` : undefined}
          >
            <Portrait
              id={id}
              name={CAST_UI[id].name}
              accent={CAST_UI[id].accent}
              speaking={speaking === id}
              dimmed={speaking !== null && speaking !== id}
            />
          </div>
        ))}
      </div>

      {/* Dialogue card, bottom-center. */}
      <div className="absolute inset-x-0 bottom-6">
        <Captions caption={caption} progress={progress} />
      </div>

      {/* Conversation status slot, bottom-center above the captions. */}
      <div className="absolute inset-x-0 bottom-32 flex justify-center">{children}</div>

      {/* Slot for DebugPanel. */}
      {debug}
    </div>
  )
}
