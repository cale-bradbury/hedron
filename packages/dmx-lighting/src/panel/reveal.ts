export const fixtureElementId = (fixtureId: string) => `dmx-fixture-${fixtureId}`
export const mappingElementId = (mappingId: string) => `dmx-mapping-${mappingId}`

/** The nearest ancestor that actually scrolls, which is what has to move to show a row. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
  }
  return null
}

/**
 * Scrolls a row to the top of its panel and flashes it, so the jump is obvious. Retries for
 * a few frames, since the row may only exist once the render that opens it has landed.
 */
export function revealElement(elementId: string, attempts = 10): void {
  requestAnimationFrame(() => {
    const element = document.getElementById(elementId)
    if (!element) {
      if (attempts > 0) revealElement(elementId, attempts - 1)
      return
    }

    // Set directly rather than smooth-scrolled, which the panel's own re-renders can cancel.
    const container = scrollParent(element)
    if (container) {
      const offset = element.getBoundingClientRect().top - container.getBoundingClientRect().top
      container.scrollTop += offset - 8
    } else {
      element.scrollIntoView({ block: 'start' })
    }

    element.animate(
      [
        { boxShadow: 'inset 0 0 0 2px rgba(143, 209, 158, 0.9)' },
        { boxShadow: 'inset 0 0 0 2px rgba(143, 209, 158, 0)' },
      ],
      { duration: 1400, easing: 'ease-out' },
    )
  })
}
