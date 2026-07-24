import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { FiltersState } from "@/types";

const initialState: FiltersState = {
  docketNumber: "",
  utility: [],
  partyName: "",
  projectRefNo: "",
  loiNo: "",
  project: "",
  enquiryTenderNo: "",
  docxStatus: [],
};

const filtersSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {
    setFilter(state, action: PayloadAction<{ field: keyof FiltersState; value: string | string[] }>) {
      const { field, value } = action.payload;
      (state as Record<string, unknown>)[field] = value;
    },
    resetFilters() {
      return initialState;
    },
  },
});

export const { setFilter, resetFilters } = filtersSlice.actions;
export default filtersSlice.reducer;
