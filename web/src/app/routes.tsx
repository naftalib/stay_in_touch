import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import AuthCallbackPage from '../auth/AuthCallbackPage.tsx'
import RequireAuth from '../auth/RequireAuth.tsx'
import SignInPage from '../auth/SignInPage.tsx'
import InvitePage from '../auth/InvitePage.tsx'
import MembersPage from '../spaces/MembersPage.tsx'
import SpacesAdminPage from '../spaces/SpacesAdminPage.tsx'
import { FamilyGate, FamilyPicker } from '../family/FamilyProvider.tsx'
import AppShell from '../shell/AppShell.tsx'
import FamilyHomePage from '../spaces/FamilyHomePage.tsx'
import SpacePage from '../spaces/SpacePage.tsx'
import NotFoundPage from './NotFoundPage.tsx'
import InstallHelpPage from '../pwa/InstallHelpPage.tsx'
import NotificationSettingsPage from '../pwa/NotificationSettingsPage.tsx'

function InviteTokenScope() {
  const location = useLocation()
  useEffect(() => {
    const path = location.pathname
    const keep =
      path === '/invite' || path === '/sign-in' || path.startsWith('/auth/')
    if (!keep) sessionStorage.removeItem('stay-invite-token')
  }, [location.pathname])
  return null
}

export default function AppRoutes() {
  return (
      <>
      <InviteTokenScope />
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/install" element={<InstallHelpPage />} />
          <Route index element={<FamilyPicker />} />

          <Route path="/f/:familyId" element={<FamilyGate />}>
            <Route element={<AppShell />}>
              <Route index element={<FamilyHomePage />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="spaces" element={<SpacesAdminPage />} />
              <Route path="notifications" element={<NotificationSettingsPage />} />
              <Route path="s/:spaceId/:tab" element={<SpacePage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
      </>
  )
}
