import { NextRequest, NextResponse } from 'next/server';
import { nativeFetch } from '../../../../lib/native';
import { brightdataFetch } from '../../../../lib/brightdata';
import { saveQueryResult } from '../../../../lib/db'

export async function POST(req: NextRequest) {
  try {
    
    console.log('[API] Incoming POST /api/query'); // NEW

    const { target, query, mode } = await req.json();

    console.log('[API] Parsed body:', { target, query, mode }); // NEW

    // const { target = 'reddit' } = body;

    if (!['reddit', 'amazon', 'linkedin'].includes(target)) {
      console.log('[API] Invalid target:', target); // NEW
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
    }

    console.log('[API] Dispatching parallel fetches...'); // NEW

    const [native, brightdata] = await Promise.all([
      nativeFetch(target, query, mode), // NEW (pass query + mode)
      brightdataFetch(target, query, mode), // NEW (pass query + mode)
    ]);

    console.log('[API] Native result summary:', {
      status: native.status,
      items: native.items_count,
      duration: native.duration_ms,
    }); // NEW

    console.log('[API] BrightData result summary:', {
      status: brightdata.status,
      items: brightdata.items_count,
      duration: brightdata.duration_ms,
    }); // NEW

    // Persist to SQLite
    try {
      console.log('[API] Saving result to DB...'); // NEW

      saveQueryResult({
        query_type: 'comparison',
        target,
        native_status: native.status,
        native_data: native.data,
        native_error: native.error,
        native_duration_ms: native.duration_ms,
        brightdata_status: brightdata.status,
        brightdata_data: brightdata.data,
        brightdata_error: brightdata.error,
        brightdata_duration_ms: brightdata.duration_ms,
      });

      console.log('[API] DB save success'); // NEW

    } catch (dbErr) {
      console.error('DB save error (non-fatal):', dbErr);
    }

    console.log('[API] Returning response to frontend'); // NEW

    return NextResponse.json({
      target,
      query, // NEW (return for visibility)
      mode,  // NEW (return for visibility)
      timestamp: new Date().toISOString(),
      native,
      brightdata,
    });

  } catch (err: any) {

    console.error('[API] Fatal error:', err); // NEW

    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}