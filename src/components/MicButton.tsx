'use client'

import { useState } from 'react'
import type { EngineState } from '@/lib/types'

type MicButtonProps = {
  state: EngineState
  bargeInEnabled: boolean
  onHoldStart: () => void
  onHoldEnd: () => void
}

export default function MicButton({
  state,
  bargeInEnabled,
  onHoldStart,
  onHoldEnd,
}: MicButtonProps) {
  const [holding, setHolding] = useState(false)
  const enabled = state === 'listening' || (state === 'playing' && bargeInEnabled)
  const label = holding ? 'listening…' : state === 'thinking' ? '…' : 'hold to speak'

  const down = () => {
    if (!enabled) return
    setHolding(true)
    onHoldStart()
  }
  const up = () => {
    if (!holding) return
    setHolding(false)
    onHoldEnd()
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={!enabled}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full border transition-colors select-none touch-none ${
          holding
            ? 'border-red-400/60 bg-red-500/20'
            : enabled
              ? 'border-white/20 bg-white/10 hover:bg-white/15'
              : 'border-white/10 bg-white/5 opacity-40'
        }`}
      >
        {(holding || state === 'listening') && (
          <span className="absolute inset-0 animate-ping rounded-full border border-white/30" />
        )}
        <svg
          viewBox="0 0 24 24"
          className={`h-6 w-6 ${holding ? 'text-red-300' : 'text-white/80'}`}
          fill="currentColor"
        >
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V20h2v-2.07A7 7 0 0 0 19 11h-2Z" />
        </svg>
      </button>
      <span className="text-xs tracking-wide text-white/50">{label}</span>
    </div>
  )
}
