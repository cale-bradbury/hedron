import React from 'react'
import { Button, ReorderableList } from '@hedron-gl/ui-core'
import { s } from './styles'
import { WELL_KNOWN_FIELDS } from '@/fields'
import type { ChannelSlot } from '@/types'

/** Offered in the slot dropdown; a profile may still name any field it likes. */
const SLOT_FIELDS = WELL_KNOWN_FIELDS

const CHANNEL_COLORS: Record<string, string> = {
  red: '#9b2e2e',
  green: '#2e7a2e',
  blue: '#2e2e9b',
  white: '#707070',
  amber: '#8a5a00',
  uv: '#4b2e7a',
  cyan: '#2e7a7a',
  magenta: '#7a2e7a',
  yellow: '#7a7a2e',
  intensity: '#8a6e00',
  dimmer: '#8a6e00',
}

interface AddSlotEntry {
  slotType: string // field name | 'null' | 'absolute'
  absVal: string
  scale: string
  bits: string
}

const DEFAULT_ADD_SLOT: AddSlotEntry = { slotType: 'red', absVal: '0', scale: '', bits: '8' }

function buildSlot(entry: AddSlotEntry): ChannelSlot {
  if (entry.slotType === 'null') return null
  if (entry.slotType === 'absolute') {
    return { absolute: Math.min(255, Math.max(0, parseInt(entry.absVal, 10) || 0)) }
  }
  const field = entry.slotType
  const scale = parseFloat(entry.scale)
  const hasScale = !isNaN(scale) && entry.scale.trim() !== ''

  if (entry.bits === 'coarse' || entry.bits === 'fine') {
    return { field, bits: 16 as const, part: entry.bits, ...(hasScale ? { scale } : {}) }
  }
  if (hasScale) return { field, scale }
  return field
}

export interface SlotEditorProps {
  label: string
  slots: ChannelSlot[]
  onChange: (slots: ChannelSlot[]) => void
}

/** Reorderable list of channel slots, plus the row that appends a new one. */
export function SlotEditor({ label, slots, onChange }: SlotEditorProps) {
  const [add, setAdd] = React.useState<AddSlotEntry>(DEFAULT_ADD_SLOT)
  const update = (patch: Partial<AddSlotEntry>) => setAdd((prev) => ({ ...prev, ...patch }))
  const isField = SLOT_FIELDS.includes(add.slotType)

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={s.fieldLabel}>{label}</div>
      <ReorderableList
        items={slots}
        onMove={(from: number, to: number) => {
          const next = [...slots]
          const [removed] = next.splice(from, 1)
          next.splice(to, 0, removed)
          onChange(next)
        }}
        onRemove={(index: number) => onChange(slots.filter((_, i) => i !== index))}
        renderItem={(slot: ChannelSlot, index: number) => (
          <SlotRow
            slot={slot}
            onUpdate={(newSlot) => onChange(slots.map((c, i) => (i === index ? newSlot : c)))}
          />
        )}
      />
      <div style={s.addSlotRow}>
        <select
          value={add.slotType}
          onChange={(e) => update({ slotType: e.target.value })}
          style={{ ...s.select, flex: '0 0 auto' }}
        >
          {SLOT_FIELDS.map((field) => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
          <option value="absolute">absolute</option>
          <option value="null">null (pad)</option>
        </select>

        {isField && (
          <select
            value={add.bits}
            onChange={(e) => update({ bits: e.target.value })}
            style={{ ...s.select, flex: '0 0 auto' }}
          >
            <option value="8">8-bit</option>
            <option value="coarse">16-bit coarse</option>
            <option value="fine">16-bit fine</option>
          </select>
        )}

        {add.slotType === 'absolute' && (
          <input
            type="number"
            min={0}
            max={255}
            value={add.absVal}
            onChange={(e) => update({ absVal: e.target.value })}
            placeholder="0–255"
            style={{ ...s.numInput, width: 68 }}
          />
        )}

        {isField && (
          <>
            <span style={{ fontSize: '0.78em', opacity: 0.45 }}>× scale</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={add.scale}
              onChange={(e) => update({ scale: e.target.value })}
              placeholder="optional"
              style={{ ...s.numInput, width: 72 }}
            />
          </>
        )}

        <Button
          type="primary"
          size="slim"
          iconName="add"
          onClick={() => onChange([...slots, buildSlot(add)])}
        >
          Add slot
        </Button>
      </div>
    </div>
  )
}

interface SlotRowProps {
  slot: ChannelSlot
  onUpdate: (slot: ChannelSlot) => void
}

export function SlotRow({ slot, onUpdate }: SlotRowProps) {
  if (slot === null) {
    return <span style={{ fontSize: '0.8em', fontStyle: 'italic', opacity: 0.5 }}>null (pad)</span>
  }

  if (typeof slot === 'string') {
    return (
      <>
        <span style={{ ...s.chip, background: CHANNEL_COLORS[slot] ?? '#444' }}>{slot}</span>
        <span style={s.dimLabel}>× scale</span>
        <input
          key={`str-${slot}`}
          type="number"
          placeholder="none"
          defaultValue=""
          min={0}
          step={0.01}
          onBlur={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && e.target.value.trim() !== '') onUpdate({ field: slot, scale: v })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          style={{ ...s.numInput, width: 56 }}
        />
      </>
    )
  }

  if ('absolute' in slot) {
    return (
      <>
        <span style={{ ...s.chip, background: '#5a5020' }}>absolute</span>
        <input
          key={`abs-${slot.absolute}`}
          type="number"
          defaultValue={slot.absolute}
          min={0}
          max={255}
          onBlur={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v)) onUpdate({ absolute: Math.min(255, Math.max(0, v)) })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          style={{ ...s.numInput, width: 64 }}
        />
      </>
    )
  }

  // { field, scale?, bits?, part? }
  const wide = slot.bits === 16 ? { bits: 16 as const, part: slot.part } : {}
  return (
    <>
      <span style={{ ...s.chip, background: CHANNEL_COLORS[slot.field] ?? '#444' }}>
        {slot.field}
      </span>
      {slot.bits === 16 && (
        <span style={{ ...s.chip, background: '#2f4858' }}>16 {slot.part ?? 'coarse'}</span>
      )}
      <span style={s.dimLabel}>× scale</span>
      <input
        key={`field-${slot.field}-${slot.scale}`}
        type="number"
        defaultValue={slot.scale ?? 1}
        min={0}
        step={0.01}
        onBlur={(e) => {
          if (e.target.value.trim() === '') {
            onUpdate(slot.bits === 16 ? { field: slot.field, ...wide } : slot.field)
            return
          }
          const v = parseFloat(e.target.value)
          if (isNaN(v)) return
          if (v === 1 && slot.bits !== 16) onUpdate(slot.field)
          else onUpdate({ field: slot.field, ...wide, ...(v === 1 ? {} : { scale: v }) })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        style={{ ...s.numInput, width: 56 }}
      />
    </>
  )
}
