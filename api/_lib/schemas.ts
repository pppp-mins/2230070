export const ROUTER_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: [
        'product_lookup',
        'segment_analysis',
        'loss_ratio_trend',
        'investment_analysis',
        'cross_analysis',
        'refuse',
      ],
    },
    required_researchers: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['product', 'policy', 'loss_ratio', 'investment'],
      },
    },
    reject: { type: 'boolean' },
    reject_reason: { type: 'string' },
    rewritten_query: { type: 'string' },
  },
  required: ['intent', 'required_researchers', 'reject', 'rewritten_query'],
}

export const RESEARCHER_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'no_data', 'refuse'] },
    answer: { type: 'string' },
    metrics: { type: 'object' },
    evidence_rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          row_index: { type: 'integer' },
          fields: { type: 'object' },
        },
        required: ['source', 'row_index', 'fields'],
      },
    },
    chart_hint: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bar', 'line', 'pie', 'none'] },
        x: { type: 'string' },
        y: { type: 'string' },
        series: { type: 'array', items: { type: 'string' } },
      },
      required: ['type'],
    },
    notes: { type: 'string' },
  },
  required: ['status', 'answer', 'metrics', 'evidence_rows', 'chart_hint'],
}

export const EDITOR_SCHEMA = {
  type: 'object',
  properties: {
    final_answer: { type: 'string' },
    tone: { type: 'string', enum: ['friendly', 'apologetic', 'informative'] },
    chart_spec: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['bar', 'line', 'pie', 'none'] },
        title: { type: 'string' },
        x_field: { type: 'string' },
        y_field: { type: 'string' },
        data: { type: 'array', items: { type: 'object' } },
      },
      required: ['type', 'data'],
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          row_index: { type: 'integer' },
          highlight: { type: 'string' },
          fields: { type: 'object' },
        },
        required: ['source', 'row_index', 'highlight', 'fields'],
      },
    },
    followup_suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['final_answer', 'tone', 'chart_spec', 'citations'],
}
