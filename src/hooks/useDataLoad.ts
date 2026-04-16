import { useEffect } from 'react'
import { loadAll } from '../data/loader'
import { useStore } from '../store'

export function useDataLoad() {
  const setTables = useStore((s) => s.setTables)
  const setDataError = useStore((s) => s.setDataError)
  const setDataProgress = useStore((s) => s.setDataProgress)
  const dataLoaded = useStore((s) => s.dataLoaded)

  useEffect(() => {
    if (dataLoaded) return
    let cancelled = false
    loadAll((loaded, total, current) => {
      if (!cancelled) setDataProgress(loaded, total, current)
    })
      .then((tables) => {
        if (!cancelled) setTables(tables)
      })
      .catch((err) => {
        if (!cancelled) setDataError(String(err?.message || err))
      })
    return () => {
      cancelled = true
    }
  }, [dataLoaded, setTables, setDataError, setDataProgress])
}
