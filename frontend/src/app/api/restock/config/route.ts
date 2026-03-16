import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '../../amazon/_backend';

export interface RestockConfigItem {
  asin: string;
  leadTimeDays: number;
  fbaPrepDays: number;
  safetyStockDays: number;
}

export async function GET() {
  try {
    const resp = await fetchBackend('/api/v1/amazon/restock/config');
    if (!resp.ok) throw new Error(`Backend responded ${resp.status}`);
    const data = await resp.json() as Array<Record<string, unknown>>;
    // Normalize snake_case → camelCase
    const config: RestockConfigItem[] = data.map((r) => ({
      asin: r.asin as string,
      leadTimeDays: r.lead_time_days as number ?? 30,
      fbaPrepDays: r.fba_prep_days as number ?? 7,
      safetyStockDays: r.safety_stock_days as number ?? 14,
    }));
    return NextResponse.json(config);
  } catch (err) {
    console.error('[restock/config] GET error:', err);
    return NextResponse.json([]);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as RestockConfigItem[];
    // Convert camelCase → snake_case for backend
    const backendPayload = body.map((item) => ({
      asin: item.asin,
      lead_time_days: item.leadTimeDays ?? 30,
      fba_prep_days: item.fbaPrepDays ?? 7,
      safety_stock_days: item.safetyStockDays ?? 14,
    }));
    const resp = await fetchBackend('/api/v1/amazon/restock/config', {
      method: 'PUT',
      body: JSON.stringify(backendPayload),
    });
    if (!resp.ok) throw new Error(`Backend responded ${resp.status}`);
    const data = await resp.json() as Array<Record<string, unknown>>;
    const config: RestockConfigItem[] = data.map((r) => ({
      asin: r.asin as string,
      leadTimeDays: r.lead_time_days as number ?? 30,
      fbaPrepDays: r.fba_prep_days as number ?? 7,
      safetyStockDays: r.safety_stock_days as number ?? 14,
    }));
    return NextResponse.json(config);
  } catch (err) {
    console.error('[restock/config] PUT error:', err);
    return NextResponse.json([], { status: 500 });
  }
}
