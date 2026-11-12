import type { Database } from './database.types.ts'

export type FamilyRole = Database['public']['Enums']['family_role']
export type MemberStatus = Database['public']['Enums']['member_status']
export type SpaceKind = Database['public']['Enums']['space_kind']

type PublicTables = Database['public']['Tables']

export type Family = PublicTables['families']['Row']
export type FamilyMember = PublicTables['family_members']['Row']
export type Space = PublicTables['spaces']['Row']
export type Message = PublicTables['messages']['Row']
export type Profile = PublicTables['profiles']['Row']
