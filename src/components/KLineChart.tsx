import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { CandlestickBar, InstrumentSpec } from '../types/market';
import {
  calculateMA,
  calculateEMA,
  calculateBOLL,
  calculateMACD,
  calculateKD,
  calculateRSI,
  calculateATR,
} from '../utils/indicators';
import {
  Camera,
  Download,
  Check,
  Maximize2,
  Minimize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  FileSpreadsheet,
  AlertTriangle,
  Layers,
  Activity,
  Sliders,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
} from 'lucide-react';
import { getSystemDateStr } from '../utils/dateUtils';

interface KLineChartProps {
  instrument: InstrumentSpec;
  benchmarkDate?: string;
  orderRationale?: string;
  customPrice?: number;
}

export type TimeframePeriod = '1d' | '1w' | '1M' | '1m' | '5m' | '15m' | '30m' | '60m';
export type SubChartType = 'VOL' | 'MACD' | 'KD' | 'RSI';

export const KLineChart: React.FC<KLineChartProps> = ({
  instrument,
  benchmarkDate = getSystemDateStr(),
  orderRationale,
  customPrice,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Timeframe and Indicators state
  const [period, setPeriod] = useState<TimeframePeriod>('1d');
  const [subChart, setSubChart] = useState<SubChartType>('VOL');
  const [showMA, setShowMA] = useState(true);
  const [showEMA, setShowEMA] = useState(false);
  const [showBOLL, setShowBOLL] = useState(false);
  const [showVolume, setShowVolume] = useState(true);

  // Remote data state from 市場資料
  const [bars, setBars] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastDataTime, setLastDataTime] = useState<string>('');
  const [dataReceivedTime, setDataReceivedTime] = useState<string>('');
  const [datasetName, setDatasetName] = useState<string>('TaiwanStockPrice');

  // Chart view & viewport navigation state
  const [visibleCount, setVisibleCount] = useState<number>(45);
  const [panOffset, setPanOffset] = useState<number>(0); // 0 means latest
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);

  // Crosshair & hover state
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // ─────────────────────────────────────────────────────────────
  // 1. Fetch Real Data from 市場資料 Engine (/api/finmind/kline)
  // ─────────────────────────────────────────────────────────────
  const fetchSeq = useRef(0);
  const fetchKLineData = useCallback(async () => {
    // 伺服器剛喚醒（冷啟動）時第一次查詢可能失敗，自動重試，最多 3 次
    const seq = ++fetchSeq.current;
    setIsLoading(true);
    setFetchError(null);
    const url = `/api/finmind/kline?data_id=${encodeURIComponent(instrument.symbol)}&period=${period}`;
    let lastErr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));
      if (seq !== fetchSeq.current) return; // 已換商品或週期
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (seq !== fetchSeq.current) return;
        if (res.ok && json.success && Array.isArray(json.bars) && json.bars.length > 0) {
          setBars(json.bars);
          setLastDataTime(json.last_data_time || '');
          setDataReceivedTime(json.fetch_time || new Date().toLocaleTimeString('zh-TW', { hour12: false }));
          setDatasetName(json.dataset || 'TaiwanStockPrice');
          setPanOffset(0); // reset to latest
          setIsLoading(false);
          return;
        }
        lastErr = json.error || `查無此標的行情數據 (${res.status})`;
      } catch (err: any) {
        lastErr = `連線失敗：${err.message}`;
      }
    }
    if (seq !== fetchSeq.current) return;
    setFetchError(lastErr);
    setBars([]);
    setIsLoading(false);
  }, [instrument.symbol, period]);

  useEffect(() => {
    fetchKLineData();
  }, [fetchKLineData]);

  // Current display price and reference price
  const displayPrice = customPrice !== undefined ? customPrice : instrument.price;
  const prevClose = instrument.prevClose || displayPrice;

  // ─────────────────────────────────────────────────────────────
  // 2. Technical Indicators Calculation
  // ─────────────────────────────────────────────────────────────
  const indicators = useMemo(() => {
    if (bars.length === 0) return null;

    const ma5 = calculateMA(bars, 5);
    const ma20 = calculateMA(bars, 20);
    const ma60 = calculateMA(bars, 60);

    const ema12 = calculateEMA(bars, 12);
    const ema26 = calculateEMA(bars, 26);

    const boll = calculateBOLL(bars, 20, 2);
    const macd = calculateMACD(bars, 12, 26, 9);
    const kd = calculateKD(bars, 9, 3, 3);
    const rsi14 = calculateRSI(bars, 14);

    return { ma5, ma20, ma60, ema12, ema26, boll, macd, kd, rsi14 };
  }, [bars]);

  // Visible bars slice based on zoom & pan
  const visibleRange = useMemo(() => {
    const total = bars.length;
    if (total === 0) return { start: 0, end: 0, slice: [] };

    const count = Math.min(total, Math.max(15, visibleCount));
    const maxOffset = Math.max(0, total - count);
    const clampedOffset = Math.min(maxOffset, Math.max(0, panOffset));

    const end = total - clampedOffset;
    const start = Math.max(0, end - count);

    return {
      start,
      end,
      slice: bars.slice(start, end),
    };
  }, [bars, visibleCount, panOffset]);

  // Selected bar for HUD summary (hovered bar or latest bar)
  const activeBar = useMemo(() => {
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < bars.length) {
      return bars[hoverIndex];
    }
    return bars[bars.length - 1] || null;
  }, [bars, hoverIndex]);

  // Indicators at active bar
  const activeIndicators = useMemo(() => {
    if (!indicators || !activeBar) return null;
    const idx = hoverIndex !== null ? hoverIndex : bars.length - 1;
    if (idx < 0 || idx >= bars.length) return null;

    return {
      ma5: indicators.ma5[idx],
      ma20: indicators.ma20[idx],
      ma60: indicators.ma60[idx],
      bollMid: indicators.boll.mid[idx],
      bollUpper: indicators.boll.upper[idx],
      bollLower: indicators.boll.lower[idx],
      macdDif: indicators.macd.dif[idx],
      macdDem: indicators.macd.dem[idx],
      macdOsc: indicators.macd.osc[idx],
      k: indicators.kd.k[idx],
      d: indicators.kd.d[idx],
      rsi14: indicators.rsi14[idx],
    };
  }, [indicators, activeBar, hoverIndex, bars.length]);

  // ─────────────────────────────────────────────────────────────
  // 3. Canvas Rendering Engine (Multi-Pane Institutional Chart)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 520;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Deep Dark Theme Background
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, width, height);

    if (bars.length === 0) return;

    const { start, end, slice } = visibleRange;
    if (slice.length === 0) return;

    // Layout configuration
    const padTop = 32;
    const padRight = 75;
    const padBottom = 26;
    const padLeft = 10;
    const chartWidth = width - padLeft - padRight;

    // Sub-pane height allocations
    const hasSubPane = showVolume || subChart !== 'VOL';
    const subPaneHeight = hasSubPane ? 110 : 0;
    const mainPaneHeight = height - padTop - padBottom - subPaneHeight - (hasSubPane ? 20 : 0);
    const subPaneTop = height - padBottom - subPaneHeight;

    // Find Price Bounds in visible slice
    let minPrice = Math.min(...slice.map(b => b.low));
    let maxPrice = Math.max(...slice.map(b => b.high));

    // Include indicators in scale if active
    if (showBOLL && indicators) {
      for (let i = start; i < end; i++) {
        if (indicators.boll.upper[i] !== null) maxPrice = Math.max(maxPrice, indicators.boll.upper[i]!);
        if (indicators.boll.lower[i] !== null) minPrice = Math.min(minPrice, indicators.boll.lower[i]!);
      }
    }
    const priceRange = maxPrice - minPrice || 1;
    minPrice -= priceRange * 0.05;
    maxPrice += priceRange * 0.05;
    const adjRange = maxPrice - minPrice;

    // Price to Y converter
    const priceToY = (price: number) => padTop + ((maxPrice - price) / adjRange) * mainPaneHeight;

    // ─── A. Grid Lines & Right Price Scale ───
    ctx.strokeStyle = '#151e2e';
    ctx.lineWidth = 1;
    const rows = 5;
    for (let i = 0; i <= rows; i++) {
      const y = padTop + (mainPaneHeight / rows) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      const pVal = maxPrice - (adjRange / rows) * i;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(pVal >= 1000 ? pVal.toFixed(0) : pVal.toFixed(2), width - padRight + 6, y + 3);
    }

    // ─── B. Horizontal Pinned Reference Lines (昨收 & 現價) ───
    // 昨收線 (Dashed gray)
    if (prevClose >= minPrice && prevClose <= maxPrice) {
      const yPrev = priceToY(prevClose);
      ctx.strokeStyle = '#64748b';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padLeft, yPrev);
      ctx.lineTo(width - padRight, yPrev);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(width - padRight + 2, yPrev - 9, 65, 18);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`昨 ${prevClose}`, width - padRight + 6, yPrev + 4);
    }

    // 最新成交價標籤 (Solid cyan)
    const latestBar = bars[bars.length - 1];
    const currentPriceVal = latestBar ? latestBar.close : displayPrice;
    if (currentPriceVal >= minPrice && currentPriceVal <= maxPrice) {
      const yCurr = priceToY(currentPriceVal);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(padLeft, yCurr);
      ctx.lineTo(width - padRight, yCurr);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = currentPriceVal >= prevClose ? '#ef4444' : '#10b981';
      ctx.fillRect(width - padRight + 2, yCurr - 10, 70, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${currentPriceVal}`, width - padRight + 6, yCurr + 4);
    }

    // ─── C. Bollinger Bands Shading & Lines ───
    const count = slice.length;
    const barSpacing = chartWidth / count;
    const barWidth = Math.max(3, barSpacing * 0.72);

    if (showBOLL && indicators) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < count; i++) {
        const globalIdx = start + i;
        const upper = indicators.boll.upper[globalIdx];
        if (upper !== null) {
          const x = padLeft + i * barSpacing + barSpacing / 2;
          const y = priceToY(upper);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      for (let i = count - 1; i >= 0; i--) {
        const globalIdx = start + i;
        const lower = indicators.boll.lower[globalIdx];
        if (lower !== null) {
          const x = padLeft + i * barSpacing + barSpacing / 2;
          const y = priceToY(lower);
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
      ctx.fill();

      // Draw upper & lower stroke
      ['upper', 'lower', 'mid'].forEach((key, kIdx) => {
        ctx.beginPath();
        let s = false;
        ctx.strokeStyle = kIdx === 2 ? '#38bdf8' : 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1;
        for (let i = 0; i < count; i++) {
          const globalIdx = start + i;
          // @ts-ignore
          const v = indicators.boll[key][globalIdx];
          if (v !== null) {
            const x = padLeft + i * barSpacing + barSpacing / 2;
            const y = priceToY(v);
            if (!s) {
              ctx.moveTo(x, y);
              s = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      });
    }

    // ─── D. Draw Candlesticks ───
    slice.forEach((bar, i) => {
      const x = padLeft + i * barSpacing + barSpacing / 2;
      const isUp = bar.close >= bar.open;
      const color = isUp ? '#ef4444' : '#10b981'; // Taiwan market: Red Up, Green Down

      const yO = priceToY(bar.open);
      const yC = priceToY(bar.close);
      const yH = priceToY(bar.high);
      const yL = priceToY(bar.low);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, yH);
      ctx.lineTo(x, yL);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(yO, yC);
      const bodyH = Math.max(1.5, Math.abs(yC - yO));
      ctx.fillStyle = color;
      ctx.fillRect(x - barWidth / 2, bodyTop, barWidth, bodyH);

      // Time labels along bottom of main pane / sub pane
      if (i % Math.max(1, Math.floor(count / 7)) === 0 || i === count - 1) {
        ctx.fillStyle = '#64748b';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        const label = period.includes('m') ? (bar.time || bar.date.slice(11, 16)) : bar.date.slice(5);
        ctx.fillText(label, x, height - 8);
      }
    });

    // ─── E. Moving Average Lines (MA5, MA20, MA60) ───
    if (showMA && indicators) {
      const maConfigs = [
        { data: indicators.ma5, color: '#facc15', width: 1.5 },
        { data: indicators.ma20, color: '#c084fc', width: 1.5 },
        { data: indicators.ma60, color: '#38bdf8', width: 1.5 },
      ];
      maConfigs.forEach(({ data, color, width: lw }) => {
        ctx.beginPath();
        let s = false;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        for (let i = 0; i < count; i++) {
          const globalIdx = start + i;
          const val = data[globalIdx];
          if (val !== null) {
            const x = padLeft + i * barSpacing + barSpacing / 2;
            const y = priceToY(val);
            if (!s) {
              ctx.moveTo(x, y);
              s = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      });
    }

    // ─── F. Sub-Pane Rendering (VOL, MACD, KD, RSI) ───
    if (hasSubPane) {
      // Sub-pane border & grid
      ctx.strokeStyle = '#151e2e';
      ctx.lineWidth = 1;
      ctx.strokeRect(padLeft, subPaneTop, chartWidth, subPaneHeight);

      // 1. Volume Sub-pane
      if (subChart === 'VOL') {
        const maxVol = Math.max(...slice.map(b => b.volume)) || 1;
        slice.forEach((bar, i) => {
          const x = padLeft + i * barSpacing + barSpacing / 2;
          const isUp = bar.close >= bar.open;
          const vH = (bar.volume / maxVol) * (subPaneHeight - 16);
          const vY = subPaneTop + subPaneHeight - vH;

          ctx.fillStyle = isUp ? 'rgba(239, 68, 68, 0.7)' : 'rgba(16, 185, 129, 0.7)';
          ctx.fillRect(x - barWidth / 2, vY, barWidth, vH);
        });

        // Volume scale label
        ctx.fillStyle = '#64748b';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${(maxVol / 1000).toFixed(1)}k`, width - padRight + 6, subPaneTop + 14);
      }

      // 2. MACD Sub-pane
      else if (subChart === 'MACD' && indicators) {
        const macdSlice = slice.map((_, i) => ({
          dif: indicators.macd.dif[start + i],
          dem: indicators.macd.dem[start + i],
          osc: indicators.macd.osc[start + i],
        }));
        let maxMacd = 0.1;
        macdSlice.forEach(m => {
          if (m.dif !== null) maxMacd = Math.max(maxMacd, Math.abs(m.dif));
          if (m.dem !== null) maxMacd = Math.max(maxMacd, Math.abs(m.dem));
          if (m.osc !== null) maxMacd = Math.max(maxMacd, Math.abs(m.osc));
        });
        const macdZeroY = subPaneTop + subPaneHeight / 2;

        // Zero line
        ctx.strokeStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(padLeft, macdZeroY);
        ctx.lineTo(width - padRight, macdZeroY);
        ctx.stroke();

        // OSC Histogram
        macdSlice.forEach((m, i) => {
          if (m.osc !== null) {
            const x = padLeft + i * barSpacing + barSpacing / 2;
            const h = (m.osc / maxMacd) * (subPaneHeight / 2 - 10);
            ctx.fillStyle = m.osc >= 0 ? '#ef4444' : '#10b981';
            ctx.fillRect(x - barWidth / 2, macdZeroY - (m.osc >= 0 ? h : 0), barWidth, Math.abs(h));
          }
        });

        // DIF (White) & DEM (Yellow)
        ['dif', 'dem'].forEach((key, kIdx) => {
          ctx.beginPath();
          ctx.strokeStyle = kIdx === 0 ? '#ffffff' : '#facc15';
          ctx.lineWidth = 1.2;
          let s = false;
          macdSlice.forEach((m, i) => {
            // @ts-ignore
            const v = m[key];
            if (v !== null) {
              const x = padLeft + i * barSpacing + barSpacing / 2;
              const y = macdZeroY - (v / maxMacd) * (subPaneHeight / 2 - 10);
              if (!s) {
                ctx.moveTo(x, y);
                s = true;
              } else {
                ctx.lineTo(x, y);
              }
            }
          });
          ctx.stroke();
        });
      }

      // 3. KD Sub-pane (9, 3, 3)
      else if (subChart === 'KD' && indicators) {
        const kdSlice = slice.map((_, i) => ({
          k: indicators.kd.k[start + i],
          d: indicators.kd.d[start + i],
        }));

        // 80 & 20 reference lines
        const y80 = subPaneTop + ((100 - 80) / 100) * subPaneHeight;
        const y20 = subPaneTop + ((100 - 20) / 100) * subPaneHeight;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.strokeRect(padLeft, y80, chartWidth, 0.5);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.strokeRect(padLeft, y20, chartWidth, 0.5);

        // K (Yellow) & D (Purple)
        ['k', 'd'].forEach((key, kIdx) => {
          ctx.beginPath();
          ctx.strokeStyle = kIdx === 0 ? '#facc15' : '#c084fc';
          ctx.lineWidth = 1.5;
          let s = false;
          kdSlice.forEach((item, i) => {
            // @ts-ignore
            const v = item[key];
            if (v !== null) {
              const x = padLeft + i * barSpacing + barSpacing / 2;
              const y = subPaneTop + ((100 - v) / 100) * subPaneHeight;
              if (!s) {
                ctx.moveTo(x, y);
                s = true;
              } else {
                ctx.lineTo(x, y);
              }
            }
          });
          ctx.stroke();
        });
      }

      // 4. RSI Sub-pane (14)
      else if (subChart === 'RSI' && indicators) {
        const rsiSlice = slice.map((_, i) => indicators.rsi14[start + i]);
        const y70 = subPaneTop + ((100 - 70) / 100) * subPaneHeight;
        const y30 = subPaneTop + ((100 - 30) / 100) * subPaneHeight;
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.strokeRect(padLeft, y70, chartWidth, 0.5);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.strokeRect(padLeft, y30, chartWidth, 0.5);

        ctx.beginPath();
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.5;
        let s = false;
        rsiSlice.forEach((v, i) => {
          if (v !== null) {
            const x = padLeft + i * barSpacing + barSpacing / 2;
            const y = subPaneTop + ((100 - v) / 100) * subPaneHeight;
            if (!s) {
              ctx.moveTo(x, y);
              s = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();
      }
    }

    // ─── G. Crosshair (十字游標) & Tooltip ───
    if (mousePos && hoverIndex !== null) {
      const sliceIdx = hoverIndex - start;
      if (sliceIdx >= 0 && sliceIdx < slice.length) {
        const xCross = padLeft + sliceIdx * barSpacing + barSpacing / 2;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(xCross, padTop);
        ctx.lineTo(xCross, height - padBottom);
        ctx.stroke();

        // Horizontal line across main pane if within bounds
        if (mousePos.y >= padTop && mousePos.y <= padTop + mainPaneHeight) {
          ctx.beginPath();
          ctx.moveTo(padLeft, mousePos.y);
          ctx.lineTo(width - padRight, mousePos.y);
          ctx.stroke();

          // Pinned Price Tag on right scale
          const crossPrice = maxPrice - ((mousePos.y - padTop) / mainPaneHeight) * adjRange;
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(width - padRight + 2, mousePos.y - 9, 70, 18);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(crossPrice.toFixed(1), width - padRight + 6, mousePos.y + 4);
        }
        ctx.setLineDash([]);
      }
    }
  }, [bars, visibleRange, period, subChart, showMA, showBOLL, showVolume, indicators, prevClose, displayPrice, mousePos, hoverIndex]);

  // ─────────────────────────────────────────────────────────────
  // 4. Interactive Mouse Handlers (Crosshair, Pan, Zoom)
  // ─────────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

    // Drag / Pan logic
    if (isDragging) {
      const dx = x - dragStartX;
      const { slice } = visibleRange;
      const barSpacing = (rect.width - 85) / Math.max(1, slice.length);
      const barsShift = Math.round(dx / barSpacing);
      setPanOffset(Math.max(0, dragStartOffset - barsShift));
      return;
    }

    // Crosshair target bar calculation
    const padLeft = 10;
    const padRight = 75;
    const chartWidth = rect.width - padLeft - padRight;
    const { start, slice } = visibleRange;
    if (slice.length === 0) return;

    const barSpacing = chartWidth / slice.length;
    const sliceIndex = Math.floor((x - padLeft) / barSpacing);

    if (sliceIndex >= 0 && sliceIndex < slice.length) {
      setHoverIndex(start + sliceIndex);
    } else {
      setHoverIndex(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartOffset(panOffset);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setMousePos(null);
    setHoverIndex(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      // Zoom in
      setVisibleCount(prev => Math.max(15, prev - 4));
    } else {
      // Zoom out
      setVisibleCount(prev => Math.min(bars.length, prev + 4));
    }
  };

  const handleDoubleClick = () => {
    setVisibleCount(45);
    setPanOffset(0);
  };

  // ─────────────────────────────────────────────────────────────
  // 5. Tool Actions (Export CSV, Copy Screenshot, PPT PNG)
  // ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (bars.length === 0) return;
    const headers = ['Date', 'Time', 'Open', 'High', 'Low', 'Close', 'Volume', 'Amount'];
    const rows = bars.map(b => [b.date, b.time || '13:30', b.open, b.high, b.low, b.close, b.volume, b.amount || '']);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Kline_${instrument.symbol}_${period}_${getSystemDateStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadScreenshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 1200;
    exportCanvas.height = 760;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Dark canvas background
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, 1200, 760);

    // Title banner
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(30, 20, 1140, 75);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(30, 20, 1140, 75);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillText(`國立臺北大學 國際財務金融博士班 · 專業台股量化看盤憑證`, 50, 52);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px monospace';
    ctx.fillText(
      `標的: ${instrument.name} (${instrument.symbol}) | 週期: ${period} | 基準價: NT$ ${displayPrice.toLocaleString()} | 時間: ${lastDataTime || benchmarkDate}`,
      50,
      78
    );

    // Render chart
    ctx.drawImage(canvas, 30, 105, 1140, 550);

    // Audit footer
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(30, 665, 1140, 75);
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(30, 665, 1140, 75);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText(`● 資料來源: 官方資料庫 (${datasetName})`, 50, 690);
    ctx.fillText(`● 數據審計: 100% 官方真實成交與報價數據 (Mock Data: OFF)`, 50, 710);
    ctx.fillText(`● 授權說明: 遵循 規範，專供學術報告與實務配置分析使用`, 50, 730);

    const dataUrl = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `Kline_Professional_Chart_${instrument.symbol}_${period}_${benchmarkDate}.png`;
    link.href = dataUrl;
    link.click();

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const handleCopyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async blob => {
        if (!blob) return;
        // @ts-ignore
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // ─────────────────────────────────────────────────────────────
  // 6. Component Presentation JSX
  // ─────────────────────────────────────────────────────────────
  const isUp = activeBar ? activeBar.close >= (activeBar.prevClose || activeBar.open) : true;
  const changeVal = activeBar ? (activeBar.change !== undefined ? activeBar.change : activeBar.close - (activeBar.prevClose || activeBar.open)) : 0;
  const changePct = activeBar ? (activeBar.changePercent !== undefined ? activeBar.changePercent : ((changeVal / (activeBar.prevClose || activeBar.open)) * 100)) : 0;

  return (
    <div
      ref={containerRef}
      className={`bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col font-sans transition-all duration-200 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none p-4' : 'p-4 sm:p-5'
      }`}
    >
      {/* ─── 1. Professional Institutional Ticker Header (兩行式看盤資訊列) ─── */}
      <div className="border-b border-slate-800 pb-3 space-y-2">
        {/* Row 1: Symbol, Big Price, Change, Market Status Tag */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs font-mono font-black rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
              {instrument.symbol}
            </span>
            <h2 className="font-black text-lg sm:text-xl text-white tracking-tight">
              {instrument.name}
            </h2>
            <div className="flex items-baseline gap-2">
              <span className={`font-mono font-black text-xl sm:text-2xl ${isUp ? 'text-rose-400' : 'text-emerald-400'}`}>
                NT$ {(activeBar ? activeBar.close : displayPrice).toLocaleString()}
              </span>
              <span className={`font-mono font-bold text-xs sm:text-sm flex items-center ${isUp ? 'text-rose-400' : 'text-emerald-400'}`}>
                {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {changeVal >= 0 ? '+' : ''}{changeVal.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* Market Session & Data Mode Badge */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-700 text-[11px] font-mono font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              {period.includes('m') ? '盤中分K資料' : '歷史收盤分析'}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              資料來源：<b className="text-slate-200">市場資料</b>
            </span>
          </div>
        </div>

        {/* Row 2: Comprehensive Market Micro-metrics (開/高/低/昨收/量/額/振幅) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800/80">
          <div>今開 <b className="text-slate-200">{activeBar ? activeBar.open : '--'}</b></div>
          <div>最高 <b className="text-rose-400">{activeBar ? activeBar.high : '--'}</b></div>
          <div>最低 <b className="text-emerald-400">{activeBar ? activeBar.low : '--'}</b></div>
          <div>昨收 <b className="text-slate-200">{activeBar ? (activeBar.prevClose || prevClose) : prevClose}</b></div>
          <div>成交量 <b className="text-amber-300">{activeBar ? activeBar.volume.toLocaleString() : '--'} {instrument.category === 'futures' ? '口' : '張'}</b></div>
          <div>成交金額 <b className="text-slate-200">{activeBar && activeBar.amount ? `NT$ ${(activeBar.amount / 100000000).toFixed(2)} 億` : '--'}</b></div>
          <div>振幅 <b className="text-sky-300">{activeBar ? (((activeBar.high - activeBar.low) / (activeBar.prevClose || activeBar.open)) * 100).toFixed(2) : '0.00'}%</b></div>
          {activeBar && (
            <div className="ml-auto text-slate-400 text-[11px]">
              時間：<b className="text-cyan-300">{activeBar.datetime || activeBar.date}</b>
            </div>
          )}
        </div>
      </div>

      {/* ─── 2. Professional Toolbar (週期切換 / 主副圖切換 / 功能按鈕) ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-800 text-xs">
        {/* Period Switcher Buttons */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto">
          {(
            [
              { id: '1d', label: '日K' },
              { id: '1w', label: '週K' },
              { id: '1M', label: '月K' },
              { id: '1m', label: '1分' },
              { id: '5m', label: '5分' },
              { id: '15m', label: '15分' },
              { id: '30m', label: '30分' },
              { id: '60m', label: '60分' },
            ] as const
          ).map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                period === p.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Main Chart Overlay Indicators Toggles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowMA(!showMA)}
            className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
              showMA ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            MA(5/20/60)
          </button>
          <button
            onClick={() => setShowBOLL(!showBOLL)}
            className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
              showBOLL ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            BOLL(20,2)
          </button>

          <div className="w-px h-5 bg-slate-800 mx-1" />

          {/* Sub-chart Selector Toggles */}
          {(['VOL', 'MACD', 'KD', 'RSI'] as SubChartType[]).map(sc => (
            <button
              key={sc}
              onClick={() => setSubChart(sc)}
              className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                subChart === sc
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {sc === 'VOL' ? '成交量' : sc}
            </button>
          ))}
        </div>

        {/* Right Side Tools: Zoom, Reset, Export, Screenshot, Fullscreen */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => setVisibleCount(c => Math.max(15, c - 8))}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
            title="放大K棒"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setVisibleCount(c => Math.min(bars.length, c + 8))}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
            title="縮小K棒"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDoubleClick}
            className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-mono text-[11px] cursor-pointer"
            title="重設縮放與平移"
          >
            重設
          </button>
          <button
            onClick={handleExportCSV}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 cursor-pointer"
            title="匯出 CSV 歷史行情"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCopyImage}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-800 cursor-pointer"
            title="複製到剪貼簿"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Camera className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownloadScreenshot}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs cursor-pointer shadow-sm flex items-center gap-1"
            title="下載 PPT 存證卡 (PNG)"
          >
            {downloadSuccess ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            <span>下載憑證</span>
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
            title={isFullscreen ? '退出全螢幕' : '全螢幕看盤'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ─── 3. Indicator Value Legend Bar (即時數值顯示列) ─── */}
      <div className="flex items-center justify-between text-[11px] font-mono px-2 py-1 bg-slate-900/40 border-b border-slate-800/60 overflow-x-auto">
        <div className="flex items-center gap-3">
          {showMA && activeIndicators && (
            <>
              <span className="text-yellow-400">MA5: <b>{activeIndicators.ma5 ?? '--'}</b></span>
              <span className="text-purple-400">MA20: <b>{activeIndicators.ma20 ?? '--'}</b></span>
              <span className="text-sky-400">MA60: <b>{activeIndicators.ma60 ?? '--'}</b></span>
            </>
          )}
          {showBOLL && activeIndicators && (
            <>
              <span className="text-cyan-300">BOLL中: <b>{activeIndicators.bollMid ?? '--'}</b></span>
              <span className="text-cyan-400">上軌: <b>{activeIndicators.bollUpper ?? '--'}</b></span>
              <span className="text-cyan-400">下軌: <b>{activeIndicators.bollLower ?? '--'}</b></span>
            </>
          )}
        </div>

        {/* Sub-chart values */}
        <div className="flex items-center gap-3">
          {subChart === 'MACD' && activeIndicators && (
            <>
              <span className="text-white">DIF: <b>{activeIndicators.macdDif ?? '--'}</b></span>
              <span className="text-yellow-400">DEM: <b>{activeIndicators.macdDem ?? '--'}</b></span>
              <span className={activeIndicators.macdOsc && activeIndicators.macdOsc >= 0 ? 'text-rose-400' : 'text-emerald-400'}>
                OSC: <b>{activeIndicators.macdOsc ?? '--'}</b>
              </span>
            </>
          )}
          {subChart === 'KD' && activeIndicators && (
            <>
              <span className="text-yellow-400">K: <b>{activeIndicators.k ?? '--'}</b></span>
              <span className="text-purple-400">D: <b>{activeIndicators.d ?? '--'}</b></span>
            </>
          )}
          {subChart === 'RSI' && activeIndicators && (
            <span className="text-purple-400">RSI(14): <b>{activeIndicators.rsi14 ?? '--'}</b></span>
          )}
          {subChart === 'VOL' && activeBar && (
            <span className="text-slate-300">量: <b>{activeBar.volume.toLocaleString()}</b></span>
          )}
        </div>
      </div>

      {/* ─── 4. Main Canvas Chart Container ─── */}
      <div className="relative w-full flex-1 min-h-[460px] bg-slate-950 select-none overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center gap-2 text-amber-400 text-xs font-mono">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>官方行情報價同步中...</span>
          </div>
        )}

        {fetchError ? (
          <div className="absolute inset-0 z-20 bg-slate-950/95 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-rose-400 font-bold text-sm">🔴 資料取得失敗</h3>
              <p className="text-xs text-slate-400 font-mono max-w-md">{fetchError}</p>
              <p className="text-[11px] text-slate-500">系統嚴格拒絕假資料 (Mock Data: OFF)，請確認代碼或稍後重試。</p>
            </div>
            <button
              onClick={fetchKLineData}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 cursor-pointer"
            >
              重新連線
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            className="w-full h-full block cursor-crosshair"
          />
        )}
      </div>

      {/* ─── 5. Institutional Provenance & Audit Footer (資訊來源與真實性保證) ─── */}
      <div className="border-t border-slate-800/80 pt-2.5 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            官方資料庫
          </span>
          <span>資料集: <b className="text-slate-300">{datasetName}</b></span>
          <span>最後行情時間: <b className="text-slate-200">{lastDataTime || benchmarkDate}</b></span>
          <span>前端取得時間: <b className="text-slate-300">{dataReceivedTime || '--'}</b></span>
          <span>已載入筆數: <b className="text-amber-400">{bars.length} 根 K棒</b></span>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
            Mock Data: OFF (100% 官方真實數據)
          </span>
          <span className="text-slate-500 text-[10px]">台股紅漲綠跌</span>
        </div>
      </div>
    </div>
  );
};
