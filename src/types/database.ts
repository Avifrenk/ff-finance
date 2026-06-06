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
          role: 'wallet' | 'monthly_budget'
          monthly_amount: number | null
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
          role?: 'wallet' | 'monthly_budget'
          monthly_amount?: number | null
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
          role?: 'wallet' | 'monthly_budget'
          monthly_amount?: number | null
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
          is_essential: boolean
          parent_id: string | null
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
          is_essential?: boolean
          parent_id?: string | null
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
          is_essential?: boolean
          parent_id?: string | null
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
          is_debt_settlement: boolean
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
          is_debt_settlement?: boolean
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
          is_debt_settlement?: boolean
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
          auto_amount_per_income: number
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
          auto_amount_per_income?: number
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
          auto_amount_per_income?: number
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
      cryptocurrencies: {
        Row: {
          id: string
          symbol: string
          coingecko_id: string
          name: string
          decimals: number
          icon: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          symbol: string
          coingecko_id: string
          name: string
          decimals?: number
          icon?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          symbol?: string
          coingecko_id?: string
          name?: string
          decimals?: number
          icon?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      crypto_holdings: {
        Row: {
          id: string
          profile_id: string
          coin_id: string
          custodian: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          coin_id: string
          custodian: string
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          coin_id?: string
          custodian?: string
          created_at?: string
        }
        Relationships: []
      }
      crypto_transactions: {
        Row: {
          id: string
          holding_id: string
          kind: 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'fee' | 'airdrop'
          amount: number
          price_per_unit_base: number | null
          fee_base: number
          occurred_at: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          holding_id: string
          kind: 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'fee' | 'airdrop'
          amount: number
          price_per_unit_base?: number | null
          fee_base?: number
          occurred_at: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          holding_id?: string
          kind?: 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'fee' | 'airdrop'
          amount?: number
          price_per_unit_base?: number | null
          fee_base?: number
          occurred_at?: string
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      crypto_prices: {
        Row: {
          id: string
          coin_id: string
          quote_code: string
          price: number
          as_of: string
          source: string
          fetched_at: string
        }
        Insert: {
          id?: string
          coin_id: string
          quote_code: string
          price: number
          as_of: string
          source?: string
          fetched_at?: string
        }
        Update: {
          id?: string
          coin_id?: string
          quote_code?: string
          price?: number
          as_of?: string
          source?: string
          fetched_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          id: string
          profile_id: string
          title: string
          body: string
          url: string | null
          dedup_key: string | null
          created_at: string
          sent_at: string | null
        }
        Insert: {
          id?: string
          profile_id: string
          title: string
          body: string
          url?: string | null
          dedup_key?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Update: {
          id?: string
          profile_id?: string
          title?: string
          body?: string
          url?: string | null
          dedup_key?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      shopping_items: {
        Row: {
          id: string
          household_id: string
          title: string
          added_by: string
          checked_at: string | null
          checked_by: string | null
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          title: string
          added_by: string
          checked_at?: string | null
          checked_by?: string | null
          deleted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          title?: string
          added_by?: string
          checked_at?: string | null
          checked_by?: string | null
          deleted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ai_receipt_scans: {
        Row: {
          id: string
          household_id: string
          author_profile_id: string
          storage_path: string
          status: 'pending' | 'parsed' | 'failed' | 'applied'
          parsed_json: Record<string, unknown> | null
          applied_operation_id: string | null
          tokens_in: number | null
          tokens_out: number | null
          cost_usd: number | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          author_profile_id: string
          storage_path: string
          status: 'pending' | 'parsed' | 'failed' | 'applied'
          parsed_json?: Record<string, unknown> | null
          applied_operation_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          cost_usd?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          author_profile_id?: string
          storage_path?: string
          status?: 'pending' | 'parsed' | 'failed' | 'applied'
          parsed_json?: Record<string, unknown> | null
          applied_operation_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          cost_usd?: number | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          id: string
          profile_id: string
          household_id: string
          role: 'user' | 'assistant'
          content: string
          tokens_in: number | null
          tokens_out: number | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          household_id: string
          role: 'user' | 'assistant'
          content: string
          tokens_in?: number | null
          tokens_out?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          household_id?: string
          role?: 'user' | 'assistant'
          content?: string
          tokens_in?: number | null
          tokens_out?: number | null
          created_at?: string
        }
        Relationships: []
      }
      flight_routes: {
        Row: {
          id: number
          owner_chat_id: number
          origin: string
          destination: string
          depart_date: string
          return_date: string | null
          status: 'active' | 'archived'
          created_at: string
          max_transfers: number | null
          airlines: string | null
          airlines_mode: 'only' | 'except' | null
          household_id: string | null
          created_by_profile_id: string | null
        }
        Insert: {
          id?: number
          owner_chat_id: number
          origin: string
          destination: string
          depart_date: string
          return_date?: string | null
          status?: 'active' | 'archived'
          created_at?: string
          max_transfers?: number | null
          airlines?: string | null
          airlines_mode?: 'only' | 'except' | null
          household_id?: string | null
          created_by_profile_id?: string | null
        }
        Update: {
          id?: number
          owner_chat_id?: number
          origin?: string
          destination?: string
          depart_date?: string
          return_date?: string | null
          status?: 'active' | 'archived'
          created_at?: string
          max_transfers?: number | null
          airlines?: string | null
          airlines_mode?: 'only' | 'except' | null
          household_id?: string | null
          created_by_profile_id?: string | null
        }
        Relationships: []
      }
      flight_observations: {
        Row: {
          id: number
          route_id: number
          price: number
          currency: string
          airline: string
          transfers: number
          link: string
          observed_at: string
        }
        Insert: {
          id?: number
          route_id: number
          price: number
          currency: string
          airline?: string
          transfers?: number
          link?: string
          observed_at?: string
        }
        Update: {
          id?: number
          route_id?: number
          price?: number
          currency?: string
          airline?: string
          transfers?: number
          link?: string
          observed_at?: string
        }
        Relationships: []
      }
      flight_alerts: {
        Row: {
          id: number
          route_id: number
          price: number
          average: number
          drop_pct: number
          sent_at: string
        }
        Insert: {
          id?: number
          route_id: number
          price: number
          average: number
          drop_pct: number
          sent_at?: string
        }
        Update: {
          id?: number
          route_id?: number
          price?: number
          average?: number
          drop_pct?: number
          sent_at?: string
        }
        Relationships: []
      }
      flight_telegram_links: {
        Row: {
          profile_id: string
          chat_id: number
          created_at: string
        }
        Insert: {
          profile_id: string
          chat_id: number
          created_at?: string
        }
        Update: {
          profile_id?: string
          chat_id?: number
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
          p_is_debt_settlement?: boolean
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
      convert_to_base: {
        Args: {
          p_amount: number
          p_from_currency: string
          p_base_currency: string
          p_on_date: string
        }
        Returns: number | null
      }
      apply_auto_goal_contributions: {
        Args: { p_operation_id: string }
        Returns: number
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
