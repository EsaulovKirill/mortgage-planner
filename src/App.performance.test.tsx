import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('schedule rendering performance', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
    })
  })

  it('does not render rows for collapsed schedule years', () => {
    const html = renderToStaticMarkup(<App />)
    const renderedRows = html.match(/<tr/g)?.length ?? 0

    expect(renderedRows).toBeLessThan(30)
  })
})
