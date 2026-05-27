// Ручные типы для Фазы 1.
// После установки Docker можно будет автоматически перегенерить:
//   npx supabase gen types typescript --local > src/types/database.ts
// Пока — поддерживаем вручную, синхронно с supabase/migrations/*.sql.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          locale: string
          created_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          locale?: string
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          locale?: string
          created_at?: string
        }
        Relationships: []
      }
      households: {
        Row: {
          id: string
          name: string
          owner_id: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          created_at?: string
        }
        Relationships: []
      }
      household_members: {
        Row: {
          household_id: string
          profile_id: string
          role: 'owner' | 'partner'
          joined_at: string
        }
        Insert: {
          household_id: string
          profile_id: string
          role: 'owner' | 'partner'
          joined_at?: string
        }
        Update: {
          household_id?: string
          profile_id?: string
          role?: 'owner' | 'partner'
          joined_at?: string
        }
        Relationships: []
      }
      household_invites: {
        Row: {
          id: string
          household_id: string
          email: string | null
          token: string
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          email?: string | null
          token?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          email?: string | null
          token?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          id: string
          household_id: string
          owner_profile_id: string
          name: string
          currency: string
          visibility: 'personal' | 'shared'
          initial_balance: number
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          owner_profile_id: string
          name: string
          currency?: string
          visibility: 'personal' | 'shared'
          initial_balance?: number
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          owner_profile_id?: string
          name?: string
          currency?: string
          visibility?: 'personal' | 'shared'
          initial_balance?: number
          created_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          household_id: string
          name: string
          kind: 'expense' | 'income'
          icon: string | null
          color: string | null
          is_default: boolean
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          kind: 'expense' | 'income'
          icon?: string | null
          color?: string | null
          is_default?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          kind?: 'expense' | 'income'
          icon?: string | null
          color?: string | null
          is_default?: boolean
          created_at?: string
        }
        Relationships: []
      }
      operations: {
        Row: {
          id: string
          household_id: string
          account_id: string
          category_id: string | null
          author_profile_id: string
          kind: 'expense' | 'income'
          amount: number
          occurred_at: string
          note: string | null
          is_private: boolean
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          account_id: string
          category_id?: string | null
          author_profile_id: string
          kind: 'expense' | 'income'
          amount: number
          occurred_at?: string
          note?: string | null
          is_private?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          account_id?: string
          category_id?: string | null
          author_profile_id?: string
          kind?: 'expense' | 'income'
          amount?: number
          occurred_at?: string
          note?: string | null
          is_private?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      accept_invite: {
        Args: { invite_token: string }
        Returns: string
      }
      current_household_id: {
        Args: Record<string, never>
        Returns: string | null
      }
      seed_default_categories: {
        Args: { target_household_id: string }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
