import { NextResponse } from 'next/server'
import { fetchBackend } from '@/app/api/amazon/_backend'

export async function GET() {
  const res = await fetchBackend('/api/v1/shipments/dashboard')
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
