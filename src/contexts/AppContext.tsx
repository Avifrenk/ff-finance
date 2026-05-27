import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../hooks/useSession'
import {
  AppContext,
  type AppContextValue,
  type Household,
  type HouseholdMemberWithProfile,
  type Profile,
  type ViewMode,
} from './useApp'

const VIEW_MODE_KEY = 'ff:viewMode'

function loadViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'personal'
  const v = window.localStorage.getItem(VIEW_MODE_KEY)
  return v === 'household' ? 'household' : 'personal'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const sessionState = useSession()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<HouseholdMemberWithProfile[]>([])
  const [viewMode, setViewModeState] = useState<ViewMode>(loadViewMode)
  const [bootstrapping, setBootstrapping] = useState(false)

  const setViewMode = useCallback((m: ViewMode) => {
    setViewModeState(m)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_MODE_KEY, m)
    }
  }, [])

  const loadAll = useCallback(async (userId: string) => {
    setBootstrapping(true)
    try {
      const { data: profileRow, error: profileErr } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, locale')
        .eq('id', userId)
        .maybeSingle()
      if (profileErr) throw profileErr
      setProfile(profileRow ?? null)

      const { data: membership, error: membershipErr } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('profile_id', userId)
        .maybeSingle()
      if (membershipErr) throw membershipErr

      if (!membership) {
        setHousehold(null)
        setMembers([])
        return
      }

      const { data: householdRow, error: householdErr } = await supabase
        .from('households')
        .select('id, name, owner_id, base_currency')
        .eq('id', membership.household_id)
        .single()
      if (householdErr) throw householdErr
      setHousehold(householdRow)

      const { data: memberRows, error: membersErr } = await supabase
        .from('household_members')
        .select('profile_id, role')
        .eq('household_id', householdRow.id)
      if (membersErr) throw membersErr

      const memberIds = (memberRows ?? []).map((r) => r.profile_id)
      const { data: profileRows, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', memberIds)
      if (profilesErr) throw profilesErr

      const nameById = new Map<string, string | null>(
        (profileRows ?? []).map((p) => [p.id, p.display_name]),
      )

      setMembers(
        (memberRows ?? []).map((r) => ({
          profile_id: r.profile_id,
          role: r.role,
          display_name: nameById.get(r.profile_id) ?? null,
        })),
      )
    } finally {
      setBootstrapping(false)
    }
  }, [])

  useEffect(() => {
    if (sessionState.status === 'authenticated') {
      // Это data-fetch на изменение сессии — легитимный useEffect-сценарий.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadAll(sessionState.session.user.id).catch((e) => {
        console.error('Failed to bootstrap profile/household', e)
      })
    } else if (sessionState.status === 'anonymous') {
      setProfile(null)
      setHousehold(null)
      setMembers([])
    }
  }, [sessionState, loadAll])

  const refresh = useCallback(async () => {
    if (sessionState.status === 'authenticated') {
      await loadAll(sessionState.session.user.id)
    }
  }, [sessionState, loadAll])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const status: AppContextValue['status'] =
    sessionState.status === 'loading' ||
    (sessionState.status === 'authenticated' && bootstrapping && !profile)
      ? 'loading'
      : sessionState.status

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      session: sessionState.status === 'authenticated' ? sessionState.session : null,
      profile,
      household,
      members,
      viewMode,
      setViewMode,
      refresh,
      signOut,
    }),
    [status, sessionState, profile, household, members, viewMode, setViewMode, refresh, signOut],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
