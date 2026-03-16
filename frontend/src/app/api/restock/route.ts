import { NextResponse } from 'next/server';
import { fetchBackend } from '../amazon/_backend';

export async function GET() {
  try {
    const resp = await fetchBackend('/api/v1/amazon/restock');
    if (!resp.ok) throw new Error(`Backend responded ${resp.status}`);
    const data = await resp.json();
    // Normalize snake_case → camelCase for frontend compatibility
    return NextResponse.json({
      items: (data.items || []).map((i: Record<string, unknown>) => ({
        asin: i.asin,
        productName: i.product_name,
        currentStock: i.current_stock,
        dailySales: i.daily_sales,
        daysUntilStockout: i.days_until_stockout,
        reorderQty: i.reorder_qty,
        urgency: i.urgency,
        lastUpdated: i.last_updated,
      })),
      summary: data.summary ?? { critical: 0, warning: 0, ok: 0 },
    });
  } catch (err) {
    console.error('[restock] GET error:', err);
    return NextResponse.json({ items: [], summary: { critical: 0, warning: 0, ok: 0 } });
  }
}
