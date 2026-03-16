import { fetchBackend } from '../../amazon/_backend'

export async function GET() {
  const res = await fetchBackend('/api/v1/amazon/refunds/summary')
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[refunds/summary] backend error', res.status, text.slice(0, 200))
    throw new Error(`Backend ${res.status}`)
  }
  const data = await res.json()
  // Map snake_case → camelCase for frontend compatibility
  return Response.json({
    pendingAmount: data.pending_amount ?? 0,
    claimableCount: data.claimable_count ?? 0,
    recoveredAmount: data.recovered_amount ?? 0,
    submittedCount: data.submitted_count ?? 0,
    auditDate: data.audit_date ?? null,
    totalRefunds: data.total_refunds ?? 0,
  })
}
