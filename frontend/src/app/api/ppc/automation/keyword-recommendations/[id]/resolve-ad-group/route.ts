import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  const body = await request.json()
  const resp = await fetch(
    `${backendUrl}/api/v1/ppc/automation/keyword-recommendations/${id}/resolve-ad-group`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  const data = await resp.json()
  return NextResponse.json(data, { status: resp.status })
}
