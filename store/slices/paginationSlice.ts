import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { PaginationState } from "@/types";

const initialState: PaginationState = {
  currentPage: 1,
  pageSize: 10,
};

const paginationSlice = createSlice({
  name: "pagination",
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<number>) {
      state.currentPage = action.payload;
    },
    setPageSize(state, action: PayloadAction<number>) {
      state.pageSize = action.payload;
      state.currentPage = 1;
    },
    resetPage(state) {
      state.currentPage = 1;
    },
    nextPage(state) {
      state.currentPage += 1;
    },
    prevPage(state) {
      state.currentPage = Math.max(1, state.currentPage - 1);
    },
  },
});

export const { setPage, setPageSize, resetPage, nextPage, prevPage } = paginationSlice.actions;
export default paginationSlice.reducer;
