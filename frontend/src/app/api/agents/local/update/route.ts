import { NextRequest, NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetchBackend('/api/agents/local/update', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
