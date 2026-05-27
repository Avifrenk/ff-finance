import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type ViewMode = 'personal' | 'household'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  locale: string
}

export interface Household {
  id: string
  name: string
  owner_id: string
}

export interface HouseholdMemberWithProfile {
  profile_id: string
  role: 'owner' | 'partner'
  display_name: string | null
}

export interface AppContextValue {
  status: 'loading' | 'anonymous' | 'authenticated'
  session: Session | null
  profile: Profile | null
  household: Household | null
  members: HouseholdMemberWithProfile[]
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
