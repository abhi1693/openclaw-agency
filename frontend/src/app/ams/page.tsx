'use client'

import { useCallback, useEffect, useState } from 'react'

type Dataset = {
  id: string
  description: string
  queue_name: string
  sqs_arn: string
}

type AmsConfig = {
  profile_id: string
  datasets: Dataset[]
}

type Subscription = {
  subscriptionId: string
  dataSetId?: string
  status?: string
  destination?: {
    sqsQueue?: { sqsQueueArn?: string }
  }
  notes?: string
}

type ConsumerStats = {
  total_received?: number
  total_processed?: number
  total_errors?: number
  last_poll?: string | null
  queue_stats?: Record<string, { received: number; processed: number; errors: number; last_poll: string | null }>
}

type AmsStatus = {
  configured_datasets?: string[]
  consumer?: ConsumerStats
}

function statusBadge(status?: string) {
  const s = (status || '').toLowerCase()
  if (s === 'active' || s === 'enabled') {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
  }
  if (s === 'pending') {
    return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Pending</span>
  }
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{status || 'Unknown'}</span>
}

export default function AmsPage() {
  const [config, setConfig] = useState<AmsConfig | null>(null)
  const [subs, setSubs] = useState<Subscription[]>([])
  const [amsStatus, setAmsStatus] = useState<AmsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cfgRes, statusRes] = await Promise.all([
        fetch('/api/ams/config'),
        fetch('/api/ams/status'),
      ])
      const cfg: AmsConfig = await cfgRes.json()
      const st: AmsStatus = await statusRes.json()
      setConfig(cfg)
      setAmsStatus(st)

      if (cfg.profile_id) {
        const subsRes = await fetch(`/api/ams/subscriptions?profile_id=${encodeURIComponent(cfg.profile_id)}`)
        const subsData = await subsRes.json()
        setSubs(subsData.subscriptions || [])
      }
    } catch {
      setError('Failed to load AMS data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleCreate = async (dataset: Dataset) => {
    if (!config?.profile_id) return
    setCreating(dataset.id)
    setError(null)
    try {
      const res = await fetch('/api/ams/subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          profile_id: config.profile_id,
          dataset_id: dataset.id,
          sqs_arn: dataset.sqs_arn,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.detail || data?.message || 'Create failed')
      } else {
        showToast(`Created subscription for ${dataset.id}`)
        await fetchAll()
      }
    } catch {
      setError('Create subscription failed')
    } finally {
      setCreating(null)
    }
  }

  const handleDelete = async (sub: Subscription) => {
    if (!config?.profile_id) return
    if (!confirm(`Delete subscription for ${sub.dataSetId || sub.subscriptionId}?`)) return
    setDeleting(sub.subscriptionId)
    setError(null)
    try {
      const res = await fetch(
        `/api/ams/subscriptions/${sub.subscriptionId}?profile_id=${encodeURIComponent(config.profile_id)}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data?.detail || data?.message || 'Delete failed')
      } else {
        showToast(`Deleted subscription ${sub.subscriptionId}`)
        await fetchAll()
      }
    } catch {
      setError('Delete subscription failed')
    } finally {
      setDeleting(null)
    }
  }

  // Map subscriptionId → subscription for quick lookup by dataset
  const subByDataset = new Map<string, Subscription>()
  for (const s of subs) {
    if (s.dataSetId) subByDataset.set(s.dataSetId, s)
  }

  const stats = amsStatus?.consumer?.queue_stats || {}

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-800">AMS 流数据订阅</h1>
        <p className="mt-1 text-sm text-slate-500">
          Amazon Marketing Stream — 实时广告数据推送到 SQS
          {config?.profile_id && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
              profile: {config.profile_id}
            </span>
          )}
        </p>
      </div>

      {toast && (
        <div className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
          {toast}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          {/* Dataset subscription cards */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">数据集订阅状态</h2>
            {(config?.datasets || []).map((ds) => {
              const sub = subByDataset.get(ds.id)
              const qStats = stats[ds.queue_name]
              return (
                <div key={ds.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-medium text-slate-800">{ds.id}</span>
                      {sub ? statusBadge(sub.status || 'active') : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">未订阅</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{ds.description}</p>
                    {sub && (
                      <p className="mt-1 font-mono text-[11px] text-slate-400">
                        ID: {sub.subscriptionId}
                      </p>
                    )}
                    {qStats && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        收到 {qStats.received} · 处理 {qStats.processed} · 错误 {qStats.errors}
                        {qStats.last_poll && ` · 最后轮询 ${new Date(qStats.last_poll).toLocaleTimeString()}`}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 shrink-0">
                    {sub ? (
                      <button
                        onClick={() => handleDelete(sub)}
                        disabled={deleting === sub.subscriptionId}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                      >
                        {deleting === sub.subscriptionId ? '删除中…' : '删除订阅'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCreate(ds)}
                        disabled={creating === ds.id || !config?.profile_id || !ds.sqs_arn}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
                        title={!ds.sqs_arn ? 'AWS_ACCOUNT_ID not configured' : undefined}
                      >
                        {creating === ds.id ? '创建中…' : '创建订阅'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Unrecognized subscriptions */}
          {subs.filter(s => !s.dataSetId || !subByDataset.has(s.dataSetId) || !config?.datasets.find(d => d.id === s.dataSetId)).length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">其他订阅</h2>
              {subs.filter(s => !config?.datasets.find(d => d.id === s.dataSetId)).map(s => (
                <div key={s.subscriptionId} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3">
                  <div>
                    <span className="font-mono text-xs text-slate-600">{s.subscriptionId}</span>
                    {s.dataSetId && <span className="ml-2 text-xs text-slate-500">{s.dataSetId}</span>}
                    {s.status && statusBadge(s.status)}
                  </div>
                  <button
                    onClick={() => handleDelete(s)}
                    disabled={deleting === s.subscriptionId}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                  >
                    {deleting === s.subscriptionId ? '删除中…' : '删除'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Consumer stats summary */}
          {amsStatus?.consumer && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">消费者状态</h2>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: '总接收', value: amsStatus.consumer.total_received ?? 0 },
                  { label: '已处理', value: amsStatus.consumer.total_processed ?? 0 },
                  { label: '错误', value: amsStatus.consumer.total_errors ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-2xl font-semibold text-slate-800">{value}</div>
                    <div className="text-xs text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={fetchAll}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              刷新
            </button>
          </div>
        </>
      )}
    </div>
  )
}
