import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'success',
      version: '3.0.0',
      districts: ['Pune', 'Mumbai Suburban', 'Thane', 'Solapur', 'Nashik', 'Nagpur'],
      orphanStatuses: [
        'None',
        'Maternal Orphan',
        'Paternal Orphan',
        'Double Orphan (Both Parents Deceased)',
        'Single Parent with Vulnerability',
      ],
      rationCardTypes: ['BPL', 'AAY (Antyodaya)', 'APL', 'None'],
      schoolTypes: ['Government', 'Government-Aided', 'Private', 'Non-Formal'],
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    }
  );
}
