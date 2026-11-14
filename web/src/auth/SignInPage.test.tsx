import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import SignInPage from './SignInPage.tsx'
import { AuthProvider } from './AuthContext.tsx'

function renderSignIn() {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <SignInPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SignInPage', () => {
  it('renders sign-in tabs', () => {
    renderSignIn()
    expect(
      screen.getByRole('tab', { name: 'Sign in with password' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'Email me a sign-in link' }),
    ).toBeInTheDocument()
  })
})
