import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('버튼을 누르면 표시된 카운트가 증가한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    const counter = screen.getByRole('button', { name: 'Count is 0' })
    await user.click(counter)

    expect(counter).toHaveAccessibleName('Count is 1')
  })
})
