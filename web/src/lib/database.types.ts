export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          details: NonNullable<Json>;
          family_id: string;
          id: string;
          target: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          family_id: string;
          id?: string;
          target?: string | null;
          updated_at?: string;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          family_id?: string;
          id?: string;
          target?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      families: {
        Row: {
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "families_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      family_members: {
        Row: {
          created_at: string;
          family_id: string;
          id: string;
          invited_by: string | null;
          label: string;
          removed_at: string | null;
          role: Database["public"]["Enums"]["family_role"];
          status: Database["public"]["Enums"]["member_status"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          family_id: string;
          id?: string;
          invited_by?: string | null;
          label: string;
          removed_at?: string | null;
          role: Database["public"]["Enums"]["family_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          family_id?: string;
          id?: string;
          invited_by?: string | null;
          label?: string;
          removed_at?: string | null;
          role?: Database["public"]["Enums"]["family_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_user_id: string | null;
          create_space: boolean;
          created_at: string;
          email: string;
          expires_at: string;
          family_id: string;
          id: string;
          invited_by: string;
          label: string;
          role: Database["public"]["Enums"]["family_role"];
          status: Database["public"]["Enums"]["invitation_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_user_id?: string | null;
          create_space?: boolean;
          created_at?: string;
          email: string;
          expires_at: string;
          family_id: string;
          id?: string;
          invited_by: string;
          label: string;
          role: Database["public"]["Enums"]["family_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          updated_at?: string;
        };
        Update: {
          accepted_user_id?: string | null;
          create_space?: boolean;
          created_at?: string;
          email?: string;
          expires_at?: string;
          family_id?: string;
          id?: string;
          invited_by?: string;
          label?: string;
          role?: Database["public"]["Enums"]["family_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_user_id_fkey";
            columns: ["accepted_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      media: {
        Row: {
          caption: string | null;
          content_type: string;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          duration_s: number | null;
          family_id: string;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["media_kind"];
          message_id: string | null;
          provider: Database["public"]["Enums"]["media_provider"];
          provider_asset_id: string | null;
          r2_key: string;
          size_bytes: number | null;
          space_id: string;
          status: Database["public"]["Enums"]["media_status"];
          thumb_key: string | null;
          updated_at: string;
          uploader_member_id: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          caption?: string | null;
          content_type: string;
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          duration_s?: number | null;
          family_id: string;
          height?: number | null;
          id?: string;
          kind: Database["public"]["Enums"]["media_kind"];
          message_id?: string | null;
          provider?: Database["public"]["Enums"]["media_provider"];
          provider_asset_id?: string | null;
          r2_key: string;
          size_bytes?: number | null;
          space_id: string;
          status?: Database["public"]["Enums"]["media_status"];
          thumb_key?: string | null;
          updated_at?: string;
          uploader_member_id: string;
          width?: number | null;
        };
        Update: {
          caption?: string | null;
          content_type?: string;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          duration_s?: number | null;
          family_id?: string;
          height?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["media_kind"];
          message_id?: string | null;
          provider?: Database["public"]["Enums"]["media_provider"];
          provider_asset_id?: string | null;
          r2_key?: string;
          size_bytes?: number | null;
          space_id?: string;
          status?: Database["public"]["Enums"]["media_status"];
          thumb_key?: string | null;
          updated_at?: string;
          uploader_member_id?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_space_same_family";
            columns: ["family_id", "space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "media_uploader_same_family";
            columns: ["family_id", "uploader_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
        ];
      };
      messages: {
        Row: {
          author_member_id: string;
          body: string;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          edited_at: string | null;
          family_id: string;
          id: string;
          reply_to_id: string | null;
          space_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_member_id: string;
          body: string;
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          family_id: string;
          id?: string;
          reply_to_id?: string | null;
          space_id: string;
          updated_at?: string;
        };
        Update: {
          author_member_id?: string;
          body?: string;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          family_id?: string;
          id?: string;
          reply_to_id?: string | null;
          space_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_author_same_family";
            columns: ["family_id", "author_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "messages_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey";
            columns: ["reply_to_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_space_same_family";
            columns: ["family_id", "space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["family_id", "id"];
          },
        ];
      };
      notification_outbox: {
        Row: {
          created_at: string;
          email_sent_at: string | null;
          id: string;
          push_sent_at: string | null;
          recipient_user_id: string;
          ref_id: string | null;
          space_id: string | null;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email_sent_at?: string | null;
          id?: string;
          push_sent_at?: string | null;
          recipient_user_id: string;
          ref_id?: string | null;
          space_id?: string | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email_sent_at?: string | null;
          id?: string;
          push_sent_at?: string | null;
          recipient_user_id?: string;
          ref_id?: string | null;
          space_id?: string | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_outbox_recipient_user_id_fkey";
            columns: ["recipient_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_outbox_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_prefs: {
        Row: {
          created_at: string;
          email: Database["public"]["Enums"]["email_preference"];
          id: string;
          member_id: string;
          muted_until: string | null;
          push: boolean;
          space_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: Database["public"]["Enums"]["email_preference"];
          id?: string;
          member_id: string;
          muted_until?: string | null;
          push?: boolean;
          space_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: Database["public"]["Enums"]["email_preference"];
          id?: string;
          member_id?: string;
          muted_until?: string | null;
          push?: boolean;
          space_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_prefs_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_prefs_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_key: string | null;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_key?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_key?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          disabled_at: string | null;
          endpoint: string;
          id: string;
          last_used_at: string | null;
          p256dh: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          disabled_at?: string | null;
          endpoint: string;
          id?: string;
          last_used_at?: string | null;
          p256dh: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          disabled_at?: string | null;
          endpoint?: string;
          id?: string;
          last_used_at?: string | null;
          p256dh?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      space_reads: {
        Row: {
          created_at: string;
          last_read_at: string;
          member_id: string;
          space_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          last_read_at: string;
          member_id: string;
          space_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          last_read_at?: string;
          member_id?: string;
          space_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "space_reads_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "space_reads_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      spaces: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          family_id: string;
          id: string;
          kind: Database["public"]["Enums"]["space_kind"];
          owner_member_id: string | null;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          family_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["space_kind"];
          owner_member_id?: string | null;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          family_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["space_kind"];
          owner_member_id?: string | null;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "spaces_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "spaces_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "spaces_owner_same_family";
            columns: ["family_id", "owner_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invite: { Args: { p_invitation_id: string }; Returns: string };
      archive_space: { Args: { p_space_id: string }; Returns: undefined };
      change_member_role: {
        Args: { p_member_id: string; p_role: Database["public"]["Enums"]["family_role"] };
        Returns: undefined;
      };
      create_invitation: {
        Args: {
          p_create_space?: boolean;
          p_email: string;
          p_expires_at?: string;
          p_family_id: string;
          p_label: string;
          p_role: Database["public"]["Enums"]["family_role"];
        };
        Returns: string;
      };
      create_member_space: {
        Args: { p_family_id: string; p_owner_member_id: string; p_title: string };
        Returns: string;
      };
      mark_space_read: { Args: { p_space_id: string }; Returns: undefined };
      nav_child_sibling_labels: {
        Args: { p_family_id: string };
        Returns: { label: string }[];
      };
      remove_member: { Args: { p_member_id: string }; Returns: undefined };
      rename_space: { Args: { p_space_id: string; p_title: string }; Returns: undefined };
      revoke_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      space_audience: {
        Args: { p_space_id: string };
        Returns: {
          display_name: string;
          label: string;
          role: Database["public"]["Enums"]["family_role"];
          user_id: string;
        }[];
      };
      unarchive_space: { Args: { p_space_id: string }; Returns: undefined };
      unread_counts: {
        Args: { p_family_id: string };
        Returns: {
          space_id: string;
          unread_count: number;
        }[];
      };
    };
    Enums: {
      email_preference: "off" | "instant" | "daily";
      family_role: "admin" | "grandparent" | "member";
      invitation_status: "pending" | "accepted" | "revoked" | "expired";
      media_kind: "photo" | "video";
      media_provider: "r2" | "mux";
      media_status: "pending" | "ready" | "failed";
      member_status: "active" | "removed";
      space_kind: "general" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      email_preference: ["off", "instant", "daily"],
      family_role: ["admin", "grandparent", "member"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      media_kind: ["photo", "video"],
      media_provider: ["r2", "mux"],
      media_status: ["pending", "ready", "failed"],
      member_status: ["active", "removed"],
      space_kind: ["general", "member"],
    },
  },
} as const;
