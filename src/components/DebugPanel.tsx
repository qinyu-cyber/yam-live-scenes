'use client'

import { useState } from 'react'
import type { CharId, EngineState, RelScores, Stance } from '@/lib/types'
import { CAST_UI } from './Portrait'

const STATE_COLORS: Record<EngineState, string> = {
  idle: '#71717a',
  playing: '#22c55e',
  listening: '#38bdf8',
  thinking: '#f59e0b',
}

const CAST_ORDER: CharId[] = ['gojo', 'sukuna', 'toji', 'choso', 'nanami', 'geto']
const REL_MAX = 10 // bar scale: values clamped to +/- this

type DebugPanelProps = {
  state: EngineState
  stance: Stance | null
  emotion: string | null
  rel: RelScores
  timings: Record<string, number> | null
  branch: 'live' | 'preauthored' | null
}

export default function DebugPanel({ state, stance, emotion, rel, timings, branch }: DebugPanelProps) {
  const [open, setOpen] = useState(true)

  return (
    <div className="absolute right-3 top-3 z-40 w-64 rounded-xl border border-white/10 bg-black/70 font-mono text-[11px] text-white/80 shadow-xl backdrop-blur-md">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left font-bold uppercase tracking-wider text-white/60"
      >
        <span>debug</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          <Row label="state">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: STATE_COLORS[state] }}
              />
              {state}
            </span>
          </Row>
          <Row label="emotion">{emotion ?? '—'}</Row>
          <Row label="stance">{stance ?? '—'}</Row>
          <Row label="branch">
            <span style={{ color: branch === 'live' ? '#22c55e' : branch ? '#f59e0b' : undefined }}>
              {branch ?? '—'}
            </span>
          </Row>

          <div className="mt-1 border-t border-white/10 pt-1.5 text-white/40">rel</div>
          {CAST_ORDER.map((id) => {
            const v = rel[id] ?? 0
            const pct = Math.min(Math.abs(v) / REL_MAX, 1) * 50
            return (
              <div key={id} className="flex items-center gap-2">
                <span className="w-14 truncate text-white/60">{id}</span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="absolute top-0 h-full"
                    style={{
                      left: v < 0 ? `${50 - pct}%` : '50%',
                      width: `${pct}%`,
                      backgroundColor: v < 0 ? '#ef4444' : CAST_UI[id].accent,
                    }}
                  />
                  <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
                </div>
                <span className="w-8 text-right tabular-nums">
                  {v > 0 ? `+${v}` : v}
                </span>
              </div>
            )
          })}

          <div className="mt-1 border-t border-white/10 pt-1.5 text-white/40">timings (ms)</div>
          {timings ? (
            Object.entries(timings).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="truncate text-white/60">{k}</span>
                <span className="tabular-nums">{Math.round(v)}</span>
              </div>
            ))
          ) : (
            <span className="text-white/40">—</span>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/40">{label}</span>
      <span className="truncate">{children}</span>
    </div>
  )
}
