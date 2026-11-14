export const queryKeys = {
  families: () => ['families'] as const,
  memberships: () => ['memberships'] as const,
  members: (familyId: string) => ['members', familyId] as const,
  spaces: (familyId: string) => ['spaces', familyId] as const,
  audience: (spaceId: string) => ['audience', spaceId] as const,
  messages: (spaceId: string) => ['messages', spaceId] as const,
  message: (id: string) => ['message', id] as const,
  unread: (familyId: string) => ['unread', familyId] as const,
  profile: (userId: string) => ['profile', userId] as const,
}
