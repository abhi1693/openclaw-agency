import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../_backend'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profileId = request.nextUrl.searchParams.get('profile_id') || ''
  try {
    const res = await fetchBackend(
      `/api/v1/ams/subscriptions/${id}?profile_id=${encodeURIComponent(profileId)}`,
      { method: 'DELETE' }
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json(data, { status: res.status })
    }
    return NextResponse.json({ deleted: true, subscriptionId: id })
  } catch (err) {
    console.error('AMS delete subscription error:', err)
    return NextResponse.json({ error: true, message: 'Delete subscription failed' }, { status: 503 })
  }
}
