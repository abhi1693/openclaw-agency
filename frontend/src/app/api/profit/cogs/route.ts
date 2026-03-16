import { NextResponse } from 'next/server'
import { fetchBackend } from '../../amazon/_backend'

export interface CostItem {
  sku: string
  asin: string
  productName: string
  unitCost: number
  shippingToPort: number
  freight: number
  customs: number
  dutyRate: number
  lastMile: number
  prep: number
  otherCost: number
  totalLandedCost: number
  currency: string
  updatedAt: string
}

export async function GET() {
  try {
    const resp = await fetchBackend('/api/v1/amazon/profit/cogs')
    if (!resp.ok) throw new Error(`Backend responded ${resp.status}`)
    const data = await resp.json()
    // Normalize snake_case → camelCase for frontend compatibility
    const items: CostItem[] = (data.items || []).map((r: Record<string, unknown>) => ({
      sku: r.sku,
      asin: r.asin,
      productName: r.product_name,
      unitCost: Number(r.unit_cost ?? 0),
      shippingToPort: Number(r.shipping_to_port ?? 0),
      freight: Number(r.freight ?? 0),
      customs: Number(r.customs ?? 0),
      dutyRate: Number(r.duty_rate ?? 0),
      lastMile: Number(r.last_mile ?? 0),
      prep: Number(r.prep ?? 0),
      otherCost: Number(r.other_cost ?? 0),
      totalLandedCost: Number(r.total_landed_cost ?? 0),
      currency: r.currency as string ?? 'USD',
      updatedAt: r.updated_at as string ?? new Date().toISOString(),
    }))
    return NextResponse.json({ items })
  } catch (err) {
    console.error('[cogs] GET error:', err)
    return NextResponse.json({ items: [] })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as { items: CostItem[] }
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    // Convert camelCase → snake_case for backend
    const backendPayload = body.items.map((item: CostItem) => ({
      sku: item.sku,
      asin: item.asin ?? '',
      product_name: item.productName ?? '',
      unit_cost: item.unitCost ?? 0,
      shipping_to_port: item.shippingToPort ?? 0,
      freight: item.freight ?? 0,
      customs: item.customs ?? 0,
      duty_rate: item.dutyRate ?? 0,
      last_mile: item.lastMile ?? 0,
      prep: item.prep ?? 0,
      other_cost: item.otherCost ?? 0,
      total_landed_cost: item.totalLandedCost ?? 0,
      currency: item.currency ?? 'USD',
    }))
    const resp = await fetchBackend('/api/v1/amazon/profit/cogs', {
      method: 'PUT',
      body: JSON.stringify(backendPayload),
    })
    if (!resp.ok) throw new Error(`Backend responded ${resp.status}`)
    return NextResponse.json({ ok: true, count: body.items.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
