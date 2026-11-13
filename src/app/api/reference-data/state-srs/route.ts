import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const dataEngine = (process.env.DATA_ENGINE || 'sheets').toLowerCase().trim();
    if (dataEngine === 'firestore') {
      try {
        const { getFirestoreDb } = await import('@/lib/server/credentialRegistry');
        const db = await getFirestoreDb();
        const stateParam = req.nextUrl.searchParams.get('state');
        let query: any = db.collection('state_sub_recipients').where('status', '==', 'ACTIVE');
        if (stateParam) {
          query = query.where('state', '==', stateParam);
        }
        const snap = await query.get();
        const data = (snap.docs || [])
          .map((doc: any) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

        return NextResponse.json(
          {
            status: 'success',
            data: data || [],
          },
          {
            status: 200,
            headers: {
              'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
            },
          }
        );
      } catch (err: any) {
        console.warn('[state-srs] Firestore read error:', err?.message || err);
        return NextResponse.json({ status: 'success', data: [] }, { status: 200 });
      }
    }

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

    // If Supabase is configured, fetch active State Sub-Recipients from database
    if (supabaseUrl && serviceRoleKey) {
      const stateParam = req.nextUrl.searchParams.get('state');
      let queryUrl = `${supabaseUrl}/rest/v1/state_sub_recipients?status=eq.ACTIVE&select=id,code,name,state,status&order=name.asc`;
      if (stateParam) {
        queryUrl += `&state=eq.${encodeURIComponent(stateParam)}`;
      }

      const res = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(
          {
            status: 'success',
            data: data || [],
          },
          {
            status: 200,
            headers: {
              'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
            },
          }
        );
      }
      console.warn('[state-srs] Supabase REST error:', res.status, await res.text());
    }

    // Default empty list if unconfigured or table empty (waiting for user seed)
    return NextResponse.json(
      {
        status: 'success',
        data: [],
      },
      {
        status: 200,
      }
    );
  } catch (err: any) {
    console.error('[state-srs] Unhandled error:', err);
    return NextResponse.json({ status: 'success', data: [] }, { status: 200 });
  }
}
