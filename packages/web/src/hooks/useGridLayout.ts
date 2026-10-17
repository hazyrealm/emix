import { useState, useEffect, useCallback, useRef } from 'react';

interface GridLayoutOptions {
  gap?: number;
  aspectRatio?: number;
  padding?: number;
}

interface GridLayout {
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  /** Whole-pixel offsets that centre the tiles, so no tile sits on a half pixel. */
  offsetX: number;
  offsetY: number;
  ref: (element: HTMLElement | null) => void;
}

export function useGridLayout(
  tileCount: number,
  options: GridLayoutOptions = {},
): GridLayout {
  const { gap = 8, aspectRatio = 16 / 9, padding = 12 } = options;

  const [element, setElement] = useState<HTMLElement | null>(null);

  const [layout, setLayout] = useState({
    cols: 1,
    rows: 1,
    tileWidth: 320,
    tileHeight: 180,
    offsetX: 0,
    offsetY: 0,
  });

  const prevRef = useRef(layout);

  // Stable callback ref — React calls this on mount (element) and unmount (null)
  const ref = useCallback((el: HTMLElement | null) => {
    setElement(el);
  }, []);

  useEffect(() => {
    if (!element || tileCount === 0) return;

    const compute = () => {
      const containerWidth = element.clientWidth - padding * 2;
      const containerHeight = element.clientHeight - padding * 2;
      if (containerWidth <= 0 || containerHeight <= 0) return;

      let bestCols = 1;
      let bestArea = 0;
      let bestW = 0;
      let bestH = 0;

      for (let cols = 1; cols <= tileCount; cols++) {
        const rows = Math.ceil(tileCount / cols);

        const maxTileW = (containerWidth - gap * (cols - 1)) / cols;
        const maxTileH = (containerHeight - gap * (rows - 1)) / rows;

        // Fit within both constraints while maintaining aspect ratio
        let tileW = maxTileW;
        let tileH = tileW / aspectRatio;

        if (tileH > maxTileH) {
          tileH = maxTileH;
          tileW = tileH * aspectRatio;
        }

        const area = tileW * tileH;
        if (area > bestArea) {
          bestArea = area;
          bestCols = cols;
          bestW = Math.floor(tileW);
          bestH = Math.floor(tileH);
        }
      }

      const bestRows = Math.ceil(tileCount / bestCols);
      const next = {
        cols: bestCols,
        rows: bestRows,
        tileWidth: bestW,
        tileHeight: bestH,
        // CSS centring (justify/align-content) lands odd leftovers on half
        // pixels, which makes the compositor resample and re-snap the videos.
        offsetX: Math.max(0, Math.floor((element.clientWidth - (bestCols * bestW + gap * (bestCols - 1))) / 2)),
        offsetY: Math.max(0, Math.floor((element.clientHeight - (bestRows * bestH + gap * (bestRows - 1))) / 2)),
      };

      const prev = prevRef.current;
      if (
        prev.cols !== next.cols ||
        prev.rows !== next.rows ||
        prev.tileWidth !== next.tileWidth ||
        prev.tileHeight !== next.tileHeight ||
        prev.offsetX !== next.offsetX ||
        prev.offsetY !== next.offsetY
      ) {
        prevRef.current = next;
        setLayout(next);
      }
    };

    compute();

    const observer = new ResizeObserver(compute);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, tileCount, gap, aspectRatio, padding]);

  return { ...layout, ref };
}
