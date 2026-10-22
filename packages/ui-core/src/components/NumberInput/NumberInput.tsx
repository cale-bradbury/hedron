import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import css from './NumberInput.module.css'

export type NumberInputHandle = {
  updateValue: (value: number) => void
  focus?: () => void
}

export interface NumberInputProps extends React.HTMLAttributes<HTMLDivElement> {
  onValueChange: (val: number) => void
}

export const NumberInput = forwardRef<NumberInputHandle, NumberInputProps>(function NumberInput(
  { onValueChange, ...props },
  ref,
) {
  const currVal = useRef<number>(0)
  const shownText = useRef<string>('')
  const numberInput = useRef<HTMLInputElement>(null!)

  const updateTextValue = useCallback((value: number) => {
    shownText.current = value.toFixed(2)
    numberInput.current.value = shownText.current
  }, [])

  /** The typed value, or null when the box still shows the rounded display of the real one. */
  const editedValue = useCallback((): number | null => {
    const text = numberInput.current.value
    if (text === shownText.current) return null
    const value = parseFloat(text)
    return isNaN(value) ? null : value
  }, [])

  const updateValue = useCallback(
    (value: number) => {
      updateTextValue(value)

      currVal.current = value
    },
    [updateTextValue],
  )

  const onInputSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      // Committing the display unchanged would round the real value to two decimals.
      const value = editedValue()
      if (value !== null) {
        updateValue(value)
        onValueChange(value)
      }
    },
    [updateValue, onValueChange, editedValue],
  )

  const onInputBlur = useCallback(() => {
    updateTextValue(currVal.current)
  }, [updateTextValue])

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Tab') {
        // Submit value on Tab, but only if it was actually edited
        const value = editedValue()
        if (value !== null) {
          updateValue(value)
          onValueChange(value)
        }
        // Let Tab propagate for focus change
      } else if (e.key === 'Escape') {
        // Reset to last value and blur
        updateTextValue(currVal.current)
        numberInput.current.blur()
        e.preventDefault()
      }
    },
    [onValueChange, updateValue, updateTextValue, editedValue],
  )

  const onInputFocus = useCallback(() => {
    numberInput.current.select()
  }, [])

  useImperativeHandle(ref, () => {
    return { updateValue, focus: () => numberInput.current.focus() }
  }, [updateValue])

  return (
    <div className={css.wrapper} {...props}>
      <form onSubmit={onInputSubmit} noValidate>
        <input
          type="number"
          className={css.textBox}
          ref={numberInput}
          onBlur={onInputBlur}
          onFocus={onInputFocus}
          onKeyDown={onInputKeyDown}
        />
      </form>
    </div>
  )
})
