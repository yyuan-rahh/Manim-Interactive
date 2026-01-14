import React, { useEffect, useRef } from 'react'
import 'mathlive'
// CSS is imported globally in `src/main.jsx` so math renders consistently on canvas too.

/**
 * Desmos-like math editor powered by MathLive.
 *
 * Stores/returns LaTeX string (no AST).
 * Implements the key behavior:
 * - typing "/" wraps the previous group into \\frac{group}{\\placeholder{}}
 * - arrows navigate in/out of placeholders/groups (MathLive handles this)
 * - if user types immediately after creating a fraction (without arrowing),
 *   the typed character is inserted back into the numerator (as requested).
 */
export default function DesmosMathField({ value, onChange, placeholder = '' }) {
  const mfRef = useRef(null)
  const suppressSyncRef = useRef(false)
  const fractionJustCreatedRef = useRef(false)

  useEffect(() => {
    const mf = mfRef.current
    if (!mf) return

    // Configure MathLive for "math editor" behavior
    mf.setOptions?.({
      smartFence: true,
      smartSuperscript: true,
      smartMode: false,
      virtualKeyboardMode: 'off',
      // Common Desmos-like shortcuts
      inlineShortcuts: {
        sqrt: '\\\\sqrt',
        sin: '\\\\sin',
        cos: '\\\\cos',
        tan: '\\\\tan',
        csc: '\\\\csc',
        sec: '\\\\sec',
        cot: '\\\\cot',
        pi: '\\\\pi',
        theta: '\\\\theta',
        alpha: '\\\\alpha',
        beta: '\\\\beta',
        gamma: '\\\\gamma',
        ln: '\\\\ln',
        log: '\\\\log',
      },
    })

    const emit = () => {
      const next = mf.getValue('latex') || ''
      onChange?.(next)
    }

    const onInput = () => {
      suppressSyncRef.current = true
      emit()
      // allow external sync again after this tick
      setTimeout(() => {
        suppressSyncRef.current = false
      }, 0)
    }

    const isTextKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return false
      if (e.key.length !== 1) return false
      // allow ASCII only
      return e.key.charCodeAt(0) <= 127
    }

    const onKeyDown = (e) => {
      // Clear the "fraction just created" mode if user navigates
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        fractionJustCreatedRef.current = false
        return
      }

      if (e.key === '/') {
        e.preventDefault()
        e.stopPropagation()

        // Select the previous group (single symbol, parenthesized group, etc.)
        mf.executeCommand('moveToPreviousChar')
        mf.executeCommand('selectGroup')

        const selLatex = mf.getValue(mf.selection, 'latex') || ''
        const numerator = selLatex || ''
        const fracLatex = `\\\\frac{${numerator}}{\\\\placeholder{}}`

        mf.executeCommand('insert', fracLatex, {
          insertionMode: 'replaceSelection',
          selectionMode: 'placeholder',
          format: 'latex',
        })

        fractionJustCreatedRef.current = true
        onInput()
        return
      }

      // Special rule requested: if user types immediately after creating a fraction
      // (without using arrows), treat that typed character as part of the numerator.
      if (fractionJustCreatedRef.current && isTextKey(e)) {
        e.preventDefault()
        e.stopPropagation()

        // "Opposite" from denominator placeholder is typically the numerator.
        mf.executeCommand('moveToOpposite')
        mf.executeCommand('typedText', e.key, { focus: false, feedback: false, simulateKeystroke: true })
        fractionJustCreatedRef.current = false
        onInput()
        return
      }
    }

    mf.addEventListener('input', onInput)
    mf.addEventListener('keydown', onKeyDown)

    return () => {
      mf.removeEventListener('input', onInput)
      mf.removeEventListener('keydown', onKeyDown)
    }
  }, [onChange])

  // Keep editor in sync with external value (but don't fight the user's typing)
  useEffect(() => {
    const mf = mfRef.current
    if (!mf) return
    if (suppressSyncRef.current) return
    const current = mf.getValue('latex') || ''
    if ((value || '') !== current) {
      mf.setValue(value || '', { format: 'latex' })
    }
  }, [value])

  return (
    <math-field
      ref={mfRef}
      class="desmos-mathfield"
      placeholder={placeholder}
    />
  )
}


