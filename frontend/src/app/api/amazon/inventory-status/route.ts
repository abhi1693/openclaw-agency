import { NextResponse } from 'next/server'
import { fetchBackend } from '../_backend'

export async function GET() {
  try {
    const resp = await fetchBackend('/api/v1/amazon/inventory/status')
    if (!resp.ok) throw new Error(`Backend responded ${resp.status}`)
    const data = await resp.json()

    const s = data.summary ?? {}
    const items = (data.items || []).map((item: Record<string, unknown>) => ({
      sku: item.sku,
      fnsku: item.fn_sku ?? '',
      asin: item.asin ?? '',
      productName: item.product_name ?? item.sku,
      condition: item.condition ?? '',
      yourPrice: 0,
      afnListingExists: '',
      afnWarehouseQuantity: item.total_supply ?? 0,
      afnFulfillableQuantity: item.available ?? 0,
      afnUnsellableQuantity: 0,
      afnReservedQuantity: item.reserved ?? 0,
      afnTotalQuantity: item.total_supply ?? 0,
      afnInboundWorkingQuantity: item.inbound ?? 0,
      afnInboundShippedQuantity: 0,
      afnInboundReceivingQuantity: 0,
      afnResearchingQuantity: 0,
      afnReservedFutureSupply: 0,
      afnFutureSupplyBuyable: 0,
      perUnitVolume: 0,
    }))

    return NextResponse.json({
      reportType: 'GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA',
      totalSkus: s.total_skus ?? items.length,
      summary: {
        totalFulfillable: s.total_fulfillable ?? 0,
        totalReserved: s.total_reserved ?? 0,
        totalUnsellable: s.total_unsellable ?? 0,
        totalWarehouse: s.total_warehouse ?? 0,
        totalInboundWorking: s.total_inbound ?? 0,
        totalInboundShipped: 0,
        totalInboundReceiving: 0,
        totalResearching: 0,
      },
      items,
      cachedAt: data.last_synced_at ?? new Date().toISOString(),
      fromCache: false,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[inventory-status] error:', msg)
    return NextResponse.json({
      error: true,
      errorMessage: msg.slice(0, 300),
      reportType: 'GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA',
      totalSkus: 0,
      summary: {
        totalFulfillable: 0, totalReserved: 0, totalUnsellable: 0, totalWarehouse: 0,
        totalInboundWorking: 0, totalInboundShipped: 0, totalInboundReceiving: 0, totalResearching: 0,
      },
      items: [],
    })
  }
}

export async function POST() {
  // Trigger inventory sync then return updated status
  try {
    await fetchBackend('/api/v1/amazon/restock/sync', { method: 'POST' })
  } catch (_) { /* ignore sync errors */ }
  return GET()
}
