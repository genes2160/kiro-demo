import { NextResponse } from 'next/server';
import { getRecentQueries, getAggregate, getStats } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [recent, aggregate, stats] = await Promise.all([
      Promise.resolve(getRecentQueries(20)),
      Promise.resolve(getAggregate()),
      Promise.resolve(getStats()),
    ]);

    return NextResponse.json({ recent, aggregate, stats });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, recent: [], aggregate: null, stats: [] },
      { status: 200 }
    );
  }
}