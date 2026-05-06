import React from 'react'
import c from './ReorderableList.module.css'
import { Button } from '@components/Button/Button'

export interface ReorderableListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  /** Called with (fromIndex, toIndex) when the user moves an item. */
  onMove: (fromIndex: number, toIndex: number) => void
  /** Called with the index of the item to remove. */
  onRemove: (index: number) => void
  className?: string
}

export function ReorderableList<T extends unknown>({
  items,
  renderItem,
  onMove,
  onRemove,
  className,
}: ReorderableListProps<T>) {
  return (
    <div className={`${c.list}${className ? ` ${className}` : ''}`}>
      {items.length === 0 && <div className={c.empty}>No slots — add one below</div>}
      {items.map((item, idx) => (
        <div key={idx} className={c.row}>
          <div className={c.moveButtons}>
            <Button
              type="ghost"
              size="slim"
              iconName="arrow_upward"
              disabled={idx === 0}
              onClick={() => onMove(idx, idx - 1)}
              aria-label="Move up"
            />
            <Button
              type="ghost"
              size="slim"
              iconName="arrow_downward"
              disabled={idx === items.length - 1}
              onClick={() => onMove(idx, idx + 1)}
              aria-label="Move down"
            />
          </div>
          <div className={c.content}>{renderItem(item, idx)}</div>
          <Button
            type="ghost"
            size="slim"
            iconName="remove"
            onClick={() => onRemove(idx)}
            aria-label="Remove"
          />
        </div>
      ))}
    </div>
  )
}
