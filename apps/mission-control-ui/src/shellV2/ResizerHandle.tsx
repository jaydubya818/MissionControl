import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ResizerHandleProps {
  onResize: (delta: number) => void;
  onBegin: () => void;
  onEnd: () => void;
  title?: string;
  className?: string;
}

/** Drag handle between shell columns (waku-agent resizer pattern). */
export function ResizerHandle({
  onResize,
  onBegin,
  onEnd,
  title = "Drag to resize",
  className,
}: ResizerHandleProps): JSX.Element {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      lastX.current = e.clientX;
      onBegin();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onBegin]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResize(delta);
    },
    [onResize]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      onEnd();
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [onEnd]
  );

  useEffect(() => {
    const stop = () => {
      if (dragging.current) {
        dragging.current = false;
        onEnd();
      }
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [onEnd]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={cn(
        "shell-resizer w-[5px] shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-schematic-accent-soft",
        className
      )}
    />
  );
}
