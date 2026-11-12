import { Navigate, Route, Routes } from 'react-router'
import AuthCallbackPage from '../auth/AuthCallbackPage.tsx'
import RequireAuth from '../auth/RequireAuth.tsx'
import SignInPage from '../auth/SignInPage.tsx'
import { FamilyGate, FamilyPicker } from '../family/FamilyProvider.tsx'
import AppShell from '../shell/AppShell.tsx'
import FamilyHomePage from '../spaces/FamilyHomePage.tsx'
import SpacePage from '../spaces/SpacePage.tsx'
import NotFoundPage from './NotFoundPage.tsx'

export default function AppRoutes() {
  return (
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        <Route element={<RequireAuth />}>
          <Route index element={<FamilyPicker />} />

          <Route path="/f/:familyId" element={<FamilyGate />}>
            <Route element={<AppShell />}>
              <Route index element={<FamilyHomePage />} />
              <Route path="s/:spaceId/:tab" element={<SpacePage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
  )
}
