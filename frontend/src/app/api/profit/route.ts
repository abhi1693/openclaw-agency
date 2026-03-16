import { NextResponse } from 'next/server'
import { fetchBackend } from '../amazon/_backend'

export interface ProfitItem {
  sku?: string
  asin?: string
  productName?: string
  revenue: number
  unitsSold?: number
  landedCost?: number
  fbaFee?: number
  referralFee?: number
  adSpend?: number
  netProfit?: number
  profitMargin?: number
}

export async function GET() {
  try {
    const resp = await fetchBackend('/api/v1/amazon/profit')
    if (!resp.ok) throw new Error(`Backend responded ${resp.status}`)
    const data = await resp.json()
    // Normalize snake_case → camelCase for frontend compatibility
    return NextResponse.json({
      summary: {
        totalRevenue: Number(data.summary?.total_revenue ?? 0),
        totalCost: Number(data.summary?.total_cost ?? 0),
        totalProfit: Number(data.summary?.total_profit ?? 0),
        profitMargin: Number(data.summary?.profit_margin ?? 0),
        totalAdSpend: Number(data.summary?.total_ad_spend ?? 0),
        tacos: Number(data.summary?.tacos ?? 0),
        organicRatio: Number(data.summary?.organic_ratio ?? 0),
      },
      items: (data.items || []).map((i: Record<string, unknown>) => ({
        sku: i.sku,
        asin: i.asin,
        productName: i.product_name,
        revenue: Number(i.revenue ?? 0),
        unitsSold: i.units_sold,
        landedCost: Number(i.landed_cost ?? 0),
        fbaFee: Number(i.fba_fee ?? 0),
        referralFee: Number(i.referral_fee ?? 0),
        adSpend: Number(i.ad_spend ?? 0),
        netProfit: Number(i.net_profit ?? 0),
        profitMargin: Number(i.profit_margin ?? 0),
      })),
      cachedAt: data.synced_at ?? new Date().toISOString(),
      fromCache: false,
      warnings: data.warnings,
    })
  } catch (err) {
    console.error('[profit] GET error:', err)
    return NextResponse.json({
      summary: { totalRevenue: 0, totalCost: 0, totalProfit: 0, profitMargin: 0, totalAdSpend: 0, tacos: 0, organicRatio: 0 },
      items: [],
      cachedAt: new Date().toISOString(),
      fromCache: false,
      warnings: ['Failed to fetch from backend'],
    })
  }
}

export async function POST() {
  try {
    const resp = await fetchBackend('/api/v1/amazon/profit/refresh', { method: 'POST' })
    if (!resp.ok) throw new Error(`Backend responded ${resp.status}`)
    // After refresh, return updated profit data
    const profitResp = await fetchBackend('/api/v1/amazon/profit')
    const data = await profitResp.json()
    return NextResponse.json({
      summary: {
        totalRevenue: Number(data.summary?.total_revenue ?? 0),
        totalCost: Number(data.summary?.total_cost ?? 0),
        totalProfit: Number(data.summary?.total_profit ?? 0),
        profitMargin: Number(data.summary?.profit_margin ?? 0),
        totalAdSpend: Number(data.summary?.total_ad_spend ?? 0),
        tacos: Number(data.summary?.tacos ?? 0),
        organicRatio: Number(data.summary?.organic_ratio ?? 0),
      },
      items: (data.items || []).map((i: Record<string, unknown>) => ({
        sku: i.sku,
        asin: i.asin,
        productName: i.product_name,
        revenue: Number(i.revenue ?? 0),
        unitsSold: i.units_sold,
        landedCost: Number(i.landed_cost ?? 0),
        fbaFee: Number(i.fba_fee ?? 0),
        referralFee: Number(i.referral_fee ?? 0),
        adSpend: Number(i.ad_spend ?? 0),
        netProfit: Number(i.net_profit ?? 0),
        profitMargin: Number(i.profit_margin ?? 0),
      })),
      cachedAt: new Date().toISOString(),
      fromCache: false,
      warnings: data.warnings,
    })
  } catch (err) {
    console.error('[profit] POST error:', err)
    return NextResponse.json({
      summary: { totalRevenue: 0, totalCost: 0, totalProfit: 0, profitMargin: 0, totalAdSpend: 0, tacos: 0, organicRatio: 0 },
      items: [],
      cachedAt: new Date().toISOString(),
      fromCache: false,
      warnings: ['Force refresh failed'],
    })
  }
}
