import { useEffect, useState, type RefObject } from "react";

export interface ViewportRect {
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
}

const EMPTY: ViewportRect = {
  scrollLeft: 0,
  scrollTop: 0,
  clientWidth: 0,
  clientHeight: 0,
};

/**
 * Tracks an element's scroll position and visible size reactively, so the
 * Minimap can draw a "you are here" rectangle for the Grid's scrollable
 * viewport without Grid and Minimap needing to talk to each other directly.
 *
 * `ready` should flip from a falsy to a truthy value once the caller
 * expects `ref.current` to be attached (e.g. the grid's [width, height]
 * once loaded) -- a plain RefObject never changes identity, so without
 * this the effect would run once on first render, find `ref.current`
 * still null (the element mounts later, conditionally), and never retry.
 */
export function useViewportRect(
  ref: RefObject<HTMLElement | null>,
  ready: unknown,
): ViewportRect {
  const [rect, setRect] = useState<ViewportRect>(EMPTY);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      if (!el) return;
      setRect({
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      });
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ready]);

  return rect;
}
