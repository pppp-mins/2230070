import { policyAggregate } from './policy'
import { productAggregate } from './product'
import { lossRatioAggregate } from './lossRatio'
import { investmentAggregate } from './investment'
import type { TableSet } from '../data/loader'
import type { ResearcherId } from '../types/schemas'
import type { AggregatorResult } from './policy'

export function runAggregator(
  id: ResearcherId,
  query: string,
  tables: TableSet,
): AggregatorResult {
  switch (id) {
    case 'product':
      return productAggregate(query, tables)
    case 'policy':
      return policyAggregate(query, tables)
    case 'loss_ratio':
      return lossRatioAggregate(query, tables)
    case 'investment':
      return investmentAggregate(query, tables)
  }
}
