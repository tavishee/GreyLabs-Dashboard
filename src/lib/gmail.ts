import { google } from 'googleapis';
import * as XLSX from 'xlsx';

const GRAYLABS_SUBJECT = 'Motor Insurance - Voice AI | Intent Report with Lead IDs | Call Audit Report | Paytm Insurance';
const ENSER_SUBJECT    = 'L5 Leads Data';

// UPDATE THESE once you have actual column headers from attachments
const GRAYLABS_COLS = {
  leads_sent:      'PLACEHOLDER_leads_sent',
  leads_received:  'PLACEHOLDER_leads_received',
  leads_dialled:   'PLACEHOLDER_leads_dialled',
  leads_connected: 'PLACEHOLDER_leads_connected',
  leads_qualified: 'PLACEHOLDER_leads_qualified',
};

const ENSER_COLS = {
  leads_sent:      'PLACEHOLDER_cc_leads_sent',
  leads_connected: 'PLACEHOLDER_cc_leads_connected',
  leads_converted: 'PLACEHOLDER_cc_leads_converted',
};

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return client;
}

async function searchAndParse(gmail: any, subject: string, colMap: Record<string, string>) {
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: `subject:"${subject}" newer_than:2d`,
    maxResults: 5,
  });

  const messages = res.data.messages;
  if (!messages || messages.length === 0) {
    console.log(`Email not found: ${subject}`);
    return null;
  }

  // Get the most recent message
  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messages[0].id,
    format: 'full',
  });

  // Find attachment
  const parts = msg.data.payload?.parts || [];
  let attachmentId: string | null = null;
  let filename = '';

  function findAttachment(parts: any[]) {
    for (const part of parts) {
      const name = part.filename?.toLowerCase() || '';
      if ((name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) && part.body?.attachmentId) {
        attachmentId = part.body.attachmentId;
        filename = name;
        return;
      }
      if (part.parts) findAttachment(part.parts);
    }
  }
  findAttachment(parts);

  if (!attachmentId) {
    console.log(`No attachment found in email: ${subject}`);
    return null;
  }

  // Download attachment
  const att = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: messages[0].id,
    id: attachmentId,
  });

  const data = att.data.data; // base64url encoded
  const buffer = Buffer.from(data, 'base64');

  // Parse
  let rows: Record<string, any>[] = [];
  if (filename.endsWith('.csv')) {
    const text = buffer.toString('utf-8');
    rows = parseCSV(text);
  } else {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (raw.length < 2) return null;
    const headers = raw[0].map((h: any) => String(h).trim());
    rows = raw.slice(1).map((row: any[]) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => obj[h] = row[i] ?? '');
      return obj;
    });
  }

  if (!rows.length) return null;

  // Aggregate
  return aggregateRows(rows, colMap);
}

function parseCSV(csv: string): Record<string, any>[] {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  });
}

function aggregateRows(rows: Record<string, any>[], colMap: Record<string, string>) {
  const result: Record<string, number> = {};
  for (const [key, col] of Object.entries(colMap)) {
    if (col.startsWith('PLACEHOLDER')) { result[key] = 0; continue; }
    const first = rows[0][col];
    if (!isNaN(parseFloat(first))) {
      result[key] = rows.reduce((s, r) => s + (parseFloat(r[col]) || 0), 0);
    } else {
      result[key] = rows.filter(r => r[col] && String(r[col]).trim() !== '').length;
    }
  }
  return result;
}

function safeDivide(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 10000) / 10000 : 0;
}

export async function fetchAndParseTodayEmails(dateStr: string) {
  const auth  = getOAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const [grayData, enserData] = await Promise.all([
    searchAndParse(gmail, GRAYLABS_SUBJECT, GRAYLABS_COLS),
    searchAndParse(gmail, ENSER_SUBJECT,    ENSER_COLS),
  ]);

  if (!grayData && !enserData) return null;

  const g = grayData  || { leads_sent:0, leads_received:0, leads_dialled:0, leads_connected:0, leads_qualified:0 };
  const e = enserData || { leads_sent:0, leads_connected:0, leads_converted:0 };

  return {
    date:             dateStr,
    bot_sent:         g.leads_sent,
    bot_received:     g.leads_received,
    bot_dialled:      g.leads_dialled,
    bot_connected:    g.leads_connected,
    bot_qualified:    g.leads_qualified,
    cc_sent:          e.leads_sent,
    cc_connected:     e.leads_connected,
    cc_converted:     e.leads_converted,
    bot_connect_rate: safeDivide(g.leads_connected, g.leads_dialled),
    bot_qualify_rate: safeDivide(g.leads_qualified, g.leads_connected),
    cc_convert_rate:  safeDivide(e.leads_converted, e.leads_connected),
    e2e_rate:         safeDivide(e.leads_converted, g.leads_sent),
  };
}
