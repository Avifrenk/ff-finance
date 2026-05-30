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
          base_currency: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          base_currency?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          base_currency?: string
          created_at?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          symbol: string
          name: string
          decimals: number
        }
        Insert: {
          code: string
          symbol: string
          name: string
          decimals?: number
        }
        Update: {
          code?: string
          symbol?: string
          name?: string
          decimals?: number
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          base_code: string
          quote_code: string
          rate: number
          as_of: string
          source: string
          fetched_at: string
        }
        Insert: {
          base_code: string
          quote_code: string
          rate: number
          as_of: string
          source?: string
          fetched_at?: string
        }
        Update: {
          base_code?: string
          quote_code?: string
          rate?: number
          as_of?: string
          source?: string
          fetched_at?: string
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
          transfer_id: string | null
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
          transfer_id?: string | null
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
          transfer_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      operation_schedules: {
        Row: {
          id: string
          household_id: string
          account_id: string
          category_id: string | null
          author_profile_id: string
          kind: 'expense' | 'income'
          amount: number
          cadence_rule: string
          next_run_at: string
          last_run_at: string | null
          is_active: boolean
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
          cadence_rule: string
          next_run_at: string
          last_run_at?: string | null
          is_active?: boolean
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
          cadence_rule?: string
          next_run_at?: string
          last_run_at?: string | null
          is_active?: boolean
          note?: string | null
          is_private?: boolean
          created_at?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          id: string
          household_id: string
          from_account_id: string
          to_account_id: string
          amount: number
          occurred_at: string
          note: string | null
          author_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          from_account_id: string
          to_account_id: string
          amount: number
          occurred_at?: string
          note?: string | null
          author_profile_id: string
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          from_account_id?: string
          to_account_id?: string
          amount?: number
          occurred_at?: string
          note?: string | null
          author_profile_id?: string
          created_at?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          id: string
          household_id: string
          category_id: string
          month: string
          amount: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          category_id: string
          month: string
          amount: number
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          category_id?: string
          month?: string
          amount?: number
          created_by?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          id: string
          household_id: string
          owner_profile_id: string
          name: string
          target_amount: number
          target_date: string | null
          visibility: 'personal' | 'shared'
          auto_percent_of_income: number
          icon: string | null
          color: string | null
          is_archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          owner_profile_id: string
          name: string
          target_amount: number
          target_date?: string | null
          visibility?: 'personal' | 'shared'
          auto_percent_of_income?: number
          icon?: string | null
          color?: string | null
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          owner_profile_id?: string
          name?: string
          target_amount?: number
          target_date?: string | null
          visibility?: 'personal' | 'shared'
          auto_percent_of_income?: number
          icon?: string | null
          color?: string | null
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      goal_contributions: {
        Row: {
          id: string
          goal_id: string
          amount: number
          occurred_at: string
          author_profile_id: string
          source: 'manual' | 'auto'
          source_operation_id: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          goal_id: string
          amount: number
          occurred_at?: string
          author_profile_id: string
          source?: 'manual' | 'auto'
          source_operation_id?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          goal_id?: string
          amount?: number
          occurred_at?: string
          author_profile_id?: string
          source?: 'manual' | 'auto'
          source_operation_id?: string | null
          note?: string | null
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
      create_transfer: {
        Args: {
          p_from_account_id: string
          p_to_account_id: string
          p_amount: number
          p_occurred_at?: string
          p_note?: string | null
          p_to_amount?: number | null
        }
        Returns: string
      }
      compute_next_run_at: {
        Args: { p_cadence_rule: string; p_from_date: string }
        Returns: string
      }
      tick_schedules: {
        Args: Record<string, never>
        Returns: number
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
