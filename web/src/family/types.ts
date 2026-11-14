import type { Family, FamilyMember, FamilyRole } from '../lib/database.helpers.ts'

export type ActiveMembership = FamilyMember & {
  family: Pick<Family, 'id' | 'name'>
}

export type MembershipContext = {
  membership: ActiveMembership
  role: FamilyRole
  memberId: string
  familyId: string
  userId: string
}
