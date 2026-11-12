import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import AuthCallbackPage from '../auth/AuthCallbackPage.tsx'
import RequireAuth from '../auth/RequireAuth.tsx'
import SignInPage from '../auth/SignInPage.tsx'
import { FamilyGate, FamilyPicker } from '../family/FamilyProvider.tsx'
import AppShell from '../shell/AppShell.tsx'
import FamilyHomePage from '../spaces/FamilyHomePage.tsx'
import MembersPage from '../spaces/MembersPage.tsx'
import SettingsPage from '../spaces/SettingsPage.tsx'
import SpaceThreadPage from '../spaces/SpaceThreadPage.tsx'

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        <Route element={<RequireAuth />}>
          <Route index element={<FamilyPicker />} />

          <Route path="/f/:familyId" element={<FamilyGate />}>
            <Route element={<AppShell />}>
              <Route index element={<FamilyHomePage />} />
              <Route path="spaces/:spaceId" element={<SpaceThreadPage />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
