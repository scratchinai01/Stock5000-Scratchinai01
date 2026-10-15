import { useEffect, useState } from 'react';
import { getFxInfo, subscribeFx, type FxInfo } from '../utils/fx';

/** 目前的美元兌新台幣匯率（伺服器更新時畫面會跟著變） */
export function useFx(): FxInfo {
  const [v, setV] = useState(getFxInfo());
  useEffect(() => {
    setV(getFxInfo());
    return subscribeFx(setV);
  }, []);
  return v;
}
