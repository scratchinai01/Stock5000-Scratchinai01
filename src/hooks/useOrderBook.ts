import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimOrder } from '../../server-lib/orderEngine';
import type { AssetCategory, OrderAction } from '../types/market';
import type { OrderIntent, PriceType, TimeInForce } from '../utils/orderRules';

export type ClientOrder = SimOrder;

export interface ClaimedFill {
  orderId: string;
  fillId: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  action: OrderAction;
  intent: OrderIntent;
  positionId: string | null;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  at: number;
  reason: string;
  multiplier: number;
  marginRequirement: number | null;
  rationale: string;
}

export interface OrderRequest {
  symbol: string;
  name: string;
  category: AssetCategory;
  action: OrderAction;
  intent: OrderIntent;
  positionId?: string | null;
  priceType: PriceType;
  tif: TimeInForce;
  limitPrice?: number | null;
  quantity: number;
  rationale?: string;
  multiplier: number;
  marginRequirement?: number | null;
}

const POLL_MS = 5000;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

/** 委託簿：送單、刪改單、輪詢委託狀態、領取成交回報 */
export function useOrderBook(profileId: string | null, studentName: string, onFills: (fills: ClaimedFill[]) => void) {
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const onFillsRef = useRef(onFills);
  onFillsRef.current = onFills;

  const sync = useCallback(async () => {
    if (!profileId || busy.current) return;
    busy.current = true;
    try {
      const claim = await postJson('/api/orders/claim', { profileId });
      if (Array.isArray(claim.fills) && claim.fills.length > 0) onFillsRef.current(claim.fills);
      const res = await fetch(`/api/orders?profileId=${encodeURIComponent(profileId)}`);
      if (res.ok) {
        const j = await res.json();
        setOrders(j.orders || []);
        setError(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      busy.current = false;
    }
  }, [profileId]);

  useEffect(() => {
    setOrders([]);
    if (!profileId) return;
    sync();
    const t = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') sync();
    }, POLL_MS);
    const onVis = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [profileId, sync]);

  const submit = useCallback(
    async (req: OrderRequest): Promise<{ order?: ClientOrder; error?: string }> => {
      if (!profileId) return { error: '請先登入' };
      try {
        const j = await postJson('/api/orders', { ...req, profileId, studentName });
        await sync();
        return { order: j.order };
      } catch (e: any) {
        return { error: e.message };
      }
    },
    [profileId, studentName, sync]
  );

  const cancel = useCallback(
    async (id: string): Promise<{ order?: ClientOrder; error?: string }> => {
      try {
        const j = await postJson(`/api/orders/${id}/cancel`, { profileId });
        await sync();
        return { order: j.order };
      } catch (e: any) {
        return { error: e.message };
      }
    },
    [profileId, sync]
  );

  const modify = useCallback(
    async (id: string, patch: { limitPrice?: number; quantity?: number }): Promise<{ order?: ClientOrder; error?: string }> => {
      try {
        const j = await postJson(`/api/orders/${id}/modify`, { profileId, ...patch });
        await sync();
        return { order: j.order };
      } catch (e: any) {
        return { error: e.message };
      }
    },
    [profileId, sync]
  );

  return { orders, error, submit, cancel, modify, refresh: sync };
}
