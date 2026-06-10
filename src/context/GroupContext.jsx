import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const GroupContext = createContext({})

export function GroupProvider({ children }) {
  const { user } = useAuth()
  const [userGroups, setUserGroups] = useState([])
  const [activeGroup, setActiveGroup] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      fetchUserGroups()
    } else {
      setUserGroups([])
      setActiveGroup(null)
    }
  }, [user])

  async function fetchUserGroups() {
    setLoading(true)
    const { data, error } = await supabase
      .from('group_members')
      .select('role, groups(id, name)')
      .eq('user_id', user.id)

    if (!error && data) {
      setUserGroups(data.map(m => ({ ...m.groups, role: m.role })))
    }
    setLoading(false)
  }

  function selectGroup(group) {
    setActiveGroup(group)
  }

  const isAdmin = activeGroup?.role === 'admin'

  return (
    <GroupContext.Provider value={{ userGroups, activeGroup, loading, selectGroup, fetchUserGroups, isAdmin }}>
      {children}
    </GroupContext.Provider>
  )
}

export const useGroup = () => useContext(GroupContext)
