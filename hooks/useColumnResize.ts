import { useCallback, useRef } from "react";
import { useAppDispatch } from "@/store/hooks";
import { setColumnWidth } from "@/store/slices/uiSlice";

export function useColumnResize() {
  const dispatch = useAppDispatch();
  const dragRef = useRef<{
    index: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, index: number, currentWidth: number) => {
      e.preventDefault();
      dragRef.current = { index, startX: e.clientX, startWidth: currentWidth };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const newWidth = dragRef.current.startWidth + delta;
        dispatch(setColumnWidth({ index: dragRef.current.index, width: newWidth }));
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [dispatch]
  );

  return handleMouseDown;
}
