import { useState, useEffect } from "react";
import { useDebounce } from "./useDebounce";
import { useAppDispatch } from "@/store/hooks";
import { setFilter } from "@/store/slices/filtersSlice";
import type { FiltersState } from "@/types";

export function useFilterInput(reduxValue: string, field: keyof FiltersState) {
  const dispatch = useAppDispatch();
  const [local, setLocal] = useState(reduxValue);
  const debounced = useDebounce(local, 300);

  useEffect(() => { setLocal(reduxValue); }, [reduxValue]);

  useEffect(() => {
    dispatch(setFilter({ field, value: debounced }));
  }, [debounced, field, dispatch]);

  return [local, setLocal] as const;
}
