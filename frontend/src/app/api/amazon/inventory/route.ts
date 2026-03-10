import { NextResponse } from 'next/server'

import { fetchBackend } from '../_backend'

type BackendInventoryResponse = {
  items?: Array<{
    sku: string
    asin?: string | null
    product_name?: string | null
    available?: number
    inbound?: number
    reserved?: number
    status?: string
  }>
  summary?: {
    total?: number
    critical?: number
    low_stock?: number
    overstock?: number
    restock?: number
    healthy?: number
  }
  alerts?: {
    critical?: unknown[]
    low_stock?: unknown[]
    overstock?: unknown[]
    restock?: unknown[]
  }
}

export async function GET() {
  try {
    const response = await fetchBackend('/api/v1/amazon/inventory')
    if (!response.ok) throw new Error(`Backend responded ${response.status}`)
    const data = (await response.json()) as BackendInventoryResponse
    return NextResponse.json({
      ...data,
      summary: {
        total: data.summary?.total ?? 0,
        critical: data.summary?.critical ?? 0,
        lowStock: data.summary?.low_stock ?? 0,
        overstock: data.summary?.overstock ?? 0,
        restock: data.summary?.restock ?? 0,
        healthy: data.summary?.healthy ?? 0,
      },
      items: (data.items || []).map((item) => ({
        sku: item.sku,
        asin: item.asin,
        productName: item.product_name || item.sku,
        available: item.available || 0,
        inbound: item.inbound || 0,
        reserved: item.reserved || 0,
        status: item.status,
      })),
    })
  } catch (err) {
    console.error('Inventory API error:', err)
    return NextResponse.json({ items: [], summary: { total: 0, critical: 0 }, alerts: { critical: [], lowStock: [] }, error: true, mock: true })
  }
}
