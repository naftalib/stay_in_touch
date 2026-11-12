export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type FamilyRole = 'admin' | 'grandparent' | 'member'
export type MemberStatus = 'active' | 'removed'
export type SpaceKind = 'general' | 'member'

export interface Database {
  public: {
    Tables: {
      families: {
        Row: {
          id: string
          name: string
          created_by: string
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_by: string
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_by?: string
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          id: string
          family_id: string
          user_id: string
          role: FamilyRole
          label: string
          status: MemberStatus
          invited_by: string | null
          removed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          user_id: string
          role: FamilyRole
          label: string
          status?: MemberStatus
          invited_by?: string | null
          removed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          user_id?: string
          role?: FamilyRole
          label?: string
          status?: MemberStatus
          invited_by?: string | null
          removed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      spaces: {
        Row: {
          id: string
          family_id: string
          kind: SpaceKind
          owner_member_id: string | null
          title: string
          sort_order: number
          archived_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          kind: SpaceKind
          owner_member_id?: string | null
          title: string
          sort_order?: number
          archived_at?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          kind?: SpaceKind
          owner_member_id?: string | null
          title?: string
          sort_order?: number
          archived_at?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          space_id: string
          family_id: string
          author_member_id: string
          body: string
          reply_to_id: string | null
          edited_at: string | null
          deleted_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          space_id: string
          family_id: string
          author_member_id: string
          body: string
          reply_to_id?: string | null
          edited_at?: string | null
          deleted_at?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          space_id?: string
          family_id?: string
          author_member_id?: string
          body?: string
          reply_to_id?: string | null
          edited_at?: string | null
          deleted_at?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          display_name: string
          avatar_key: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name: string
          avatar_key?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          avatar_key?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      unread_counts: {
        Args: { p_family_id: string }
        Returns: { space_id: string; unread_count: number }[]
      }
      mark_space_read: {
        Args: { p_space_id: string }
        Returns: undefined
      }
      space_audience: {
        Args: { p_space_id: string }
        Returns: {
          user_id: string
          display_name: string
          label: string
          role: FamilyRole
        }[]
      }
    }
    Enums: {
      family_role: FamilyRole
      member_status: MemberStatus
      space_kind: SpaceKind
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Message = Tables<'messages'>
export type Space = Tables<'spaces'>
export type FamilyMember = Tables<'family_members'>
export type Profile = Tables<'profiles'>
export type Family = Tables<'families'>
