import { NextResponse } from 'next/server';
import { fetchAndParseTodayEmails } from '@/lib/gmail';
import { saveRow } from '@/lib/storage';

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  console.log(`Cron running for ${today}`);

  try {
    const row = await fetchAndParseTodayEmails(today);
    if (!row) {
      console.log('No email data found for today.');
      return NextResponse.json({ success: false, message: 'No emails found', date: today });
    }
    await saveRow(row);
    console.log('Row saved:', row);
    return NextResponse.json({ success: true, date: today, row });
  } catch (err: any) {
    console.error('Cron error:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
