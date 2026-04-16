import Papa from 'papaparse'
import { from, type ColumnTable } from 'arquero'

export type TableSet = {
  products: ColumnTable
  customers: ColumnTable
  policies: ColumnTable
  coverages: ColumnTable
  lossRatio: ColumnTable
  investments: ColumnTable
  holdings: ColumnTable
  nav: ColumnTable
  risk: ColumnTable
  benchmarks: ColumnTable
  transactions: ColumnTable
}

type FileSpec = { key: keyof TableSet; path: string }

const FILES: FileSpec[] = [
  { key: 'products', path: '/data/products_catalog.csv' },
  { key: 'customers', path: '/data/customer_profiles.csv' },
  { key: 'policies', path: '/data/policy_headers.csv' },
  { key: 'coverages', path: '/data/policy_coverages.csv' },
  { key: 'lossRatio', path: '/data/loss_ratio_timeseries.csv' },
  { key: 'investments', path: '/data/investment_products.csv' },
  { key: 'holdings', path: '/data/customer_holdings.csv' },
  { key: 'nav', path: '/data/nav_timeseries.csv' },
  { key: 'risk', path: '/data/risk_profiles.csv' },
  { key: 'benchmarks', path: '/data/market_benchmarks.csv' },
  { key: 'transactions', path: '/data/transactions.csv' },
]

export async function loadAll(
  onProgress?: (loaded: number, total: number, current: string) => void,
): Promise<TableSet> {
  const entries: Array<[keyof TableSet, ColumnTable]> = []
  for (let i = 0; i < FILES.length; i++) {
    const { key, path } = FILES[i]
    onProgress?.(i, FILES.length, path)
    const text = await fetch(path).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`)
      return r.text()
    })
    const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    const parsed = Papa.parse<Record<string, any>>(cleaned, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    })
    entries.push([key, from(parsed.data)])
  }
  onProgress?.(FILES.length, FILES.length, 'done')
  return Object.fromEntries(entries) as TableSet
}
