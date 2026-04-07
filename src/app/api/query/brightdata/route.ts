import { NextResponse } from 'next/server';
import { getRecentQueries, getAggregate, getStats } from '../../../../../lib/db'

export async function GET() {
  try {
    const recent = getRecentQueries(20);
    const aggregate = getAggregate();
    const stats = getStats();
    return NextResponse.json({ recent, aggregate, stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, recent: [], aggregate: null, stats: [] });
  }
}
