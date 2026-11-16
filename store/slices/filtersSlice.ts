import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { FiltersState, TextFilterField } from "@/types";

const initialState: FiltersState = {
  docketNumber: "",
  partyName: "",
  projectRefNo: "",
  loiNo: "",
  project: "",
  enquiryTenderNo: "",
  values: {},
};

const filtersSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {
    setFilter(state, action: PayloadAction<{ field: TextFilterField; value: string }>) {
      state[action.payload.field] = action.payload.value;
    },
    setColumnValues(state, action: PayloadAction<{ key: string; values: string[] }>) {
      state.values[action.payload.key] = action.payload.values;
    },
    resetFilters() {
      return initialState;
    },
  },
});

export const { setFilter, setColumnValues, resetFilters } = filtersSlice.actions;
export default filtersSlice.reducer;
