import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  const resp = await fetch(
    `${backendUrl}/api/v1/ppc/automation/campaigns/${campaignId}/ad-groups`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  )
  const data = await resp.json()
  return NextResponse.json(data, { status: resp.status })
}
