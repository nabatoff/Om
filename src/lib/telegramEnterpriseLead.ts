import { getSupabase } from './supabase';

/** Уведомление руководителю о новом лиде в буфере (edge или webhook). */
export async function notifyEnterpriseLeadTelegram(payload: {
  clientName: string;
  bin: string;
  creatorName: string;
}): Promise<void> {
  const text = [
    '🆕 Новый лид в буфере (крупный)',
    `Компания: ${payload.clientName}`,
    `БИН: ${payload.bin}`,
    `Лидоруб: ${payload.creatorName}`,
  ].join('\n');

  const webhook = (import.meta.env.VITE_TELEGRAM_REPORT_WEBHOOK_URL ?? '').trim();
  if (webhook) {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return;
  }

  try {
    await getSupabase().functions.invoke('telegram-enterprise-lead', {
      body: { text, ...payload },
    });
  } catch (e) {
    console.error('[telegram enterprise lead]', e);
  }
}
