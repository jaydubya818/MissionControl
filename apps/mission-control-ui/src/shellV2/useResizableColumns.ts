import { useCallback, useEffect, useState } from "react";

const NAV_KEY = "mc.shell.navWidth";
const DOCK_KEY = "mc.shell.dockWidth";
const NAV_HIDDEN_KEY = "mc.shell.navHidden";
const DOCK_CLOSED_KEY = "mc.shell.dockClosed";

const DEFAULT_NAV = 256;
const DEFAULT_DOCK = 380;
const MIN_NAV = 180;
const MAX_NAV = 360;
const MIN_DOCK = 280;
const MAX_DOCK = 520;

function readNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1" || raw === "true";
}

export interface ResizableColumnsState {
  navWidth: number;
  dockWidth: number;
  navHidden: boolean;
  dockClosed: boolean;
  resizing: boolean;
  setNavHidden: (hidden: boolean) => void;
  setDockClosed: (closed: boolean) => void;
  onNavResize: (delta: number) => void;
  onDockResize: (delta: number) => void;
  beginResize: () => void;
  endResize: () => void;
}

export function useResizableColumns(): ResizableColumnsState {
  const [navWidth, setNavWidth] = useState(() => readNumber(NAV_KEY, DEFAULT_NAV));
  const [dockWidth, setDockWidth] = useState(() => readNumber(DOCK_KEY, DEFAULT_DOCK));
  const [navHidden, setNavHiddenState] = useState(() => readBool(NAV_HIDDEN_KEY, false));
  const [dockClosed, setDockClosedState] = useState(() =>
    readBool(DOCK_CLOSED_KEY, typeof window !== "undefined" && window.innerWidth < 1180)
  );
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    localStorage.setItem(NAV_KEY, String(navWidth));
  }, [navWidth]);

  useEffect(() => {
    localStorage.setItem(DOCK_KEY, String(dockWidth));
  }, [dockWidth]);

  const setNavHidden = useCallback((hidden: boolean) => {
    setNavHiddenState(hidden);
    localStorage.setItem(NAV_HIDDEN_KEY, hidden ? "1" : "0");
  }, []);

  const setDockClosed = useCallback((closed: boolean) => {
    setDockClosedState(closed);
    localStorage.setItem(DOCK_CLOSED_KEY, closed ? "1" : "0");
  }, []);

  const onNavResize = useCallback((delta: number) => {
    setNavWidth((w) => Math.min(MAX_NAV, Math.max(MIN_NAV, w + delta)));
  }, []);

  const onDockResize = useCallback((delta: number) => {
    setDockWidth((w) => Math.min(MAX_DOCK, Math.max(MIN_DOCK, w - delta)));
  }, []);

  const beginResize = useCallback(() => setResizing(true), []);
  const endResize = useCallback(() => setResizing(false), []);

  return {
    navWidth,
    dockWidth,
    navHidden,
    dockClosed,
    resizing,
    setNavHidden,
    setDockClosed,
    onNavResize,
    onDockResize,
    beginResize,
    endResize,
  };
}
