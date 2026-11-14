import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base.css'
import AppProviders from './app/AppProviders.tsx'
import AppRoutes from './app/routes.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </StrictMode>,
)
