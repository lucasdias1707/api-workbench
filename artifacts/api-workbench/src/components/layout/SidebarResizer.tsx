import { useRef } from 'react';
import { clampSidebarWidth, DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from '@/lib/sidebar';

type SidebarResizerProps = {
  width: number;
  onChange: (width: number) => void;
};

/**
 * The drag handle on the sidebar's right edge.
 *
 * Pointer events rather than mouse events, so a trackpad, a touchscreen and a
 * pen all work; `setPointerCapture` is what keeps the drag alive when the
 * pointer outruns the handle, which it will on any fast drag.
 *
 * The width is measured from the workbench's left edge rather than accumulated
 * from a delta: accumulating drifts once the value hits a clamp and the pointer
 * keeps going, so releasing at the far left and dragging back would not track
 * the cursor.
 */
export function SidebarResizer({ width, onChange }: SidebarResizerProps) {
  const ref = useRef<HTMLDivElement>(null);

  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const left = ref.current?.parentElement?.getBoundingClientRect().left ?? 0;
    onChange(clampSidebarWidth(event.clientX - left));
  };

  return (
    <div
      ref={ref}
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-valuenow={width}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) track(event);
      }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      // Somewhere to land when the sidebar has been dragged somewhere unhelpful.
      onDoubleClick={() => onChange(DEFAULT_SIDEBAR_WIDTH)}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 8;
        if (event.key === 'ArrowLeft') onChange(clampSidebarWidth(width - step));
        else if (event.key === 'ArrowRight') onChange(clampSidebarWidth(width + step));
        else return;
        event.preventDefault();
      }}
      data-testid="sidebar-resizer"
    />
  );
}
