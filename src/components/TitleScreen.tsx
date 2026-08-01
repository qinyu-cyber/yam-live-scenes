'use client'

import { useState } from 'react'

type TitleScreenProps = {
  onEnter: () => Promise<void> | void
}

export default function TitleScreen({ onEnter }: TitleScreenProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      await onEnter()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #0f0a2e 0%, #4a1d4e 40%, #9a3412 75%, #d97706 100%)',
        }}
      />
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative flex flex-col items-center gap-3 text-center">
        <h1 className="bg-gradient-to-b from-white via-amber-100 to-amber-400 bg-clip-text text-6xl font-black tracking-tight text-transparent drop-shadow-lg sm:text-7xl">
          YAM LIVE SCENES
        </h1>
        <p className="text-lg font-medium text-white/80">
          A scene you&apos;re inside — answer with your voice
        </p>
      </div>

      <div className="relative flex flex-col items-center gap-3">
        <button
          onClick={handleClick}
          disabled={loading}
          className="rounded-full border border-amber-300/40 bg-gradient-to-b from-amber-400 to-orange-600 px-10 py-4 text-xl font-bold text-white shadow-[0_0_40px_rgba(245,158,11,0.5)] transition-transform hover:scale-105 active:scale-95 disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? (
            <span className="flex items-center gap-3">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Entering…
            </span>
          ) : (
            'Enter the Villa'
          )}
        </button>
        <p className="text-xs text-white/60">
          Uses your microphone and speakers — clicking enables audio
        </p>
      </div>
    </div>
  )
}
