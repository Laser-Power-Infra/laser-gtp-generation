import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { UIState } from "@/types";

const initialState: UIState = {
  expandedRows: {},
  columnWidths: {},
  editingCell: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleRowExpand(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.expandedRows[id] = !state.expandedRows[id];
    },
    setRowExpanded(state, action: PayloadAction<{ id: string; expanded: boolean }>) {
      state.expandedRows[action.payload.id] = action.payload.expanded;
    },
    expandAll(state) {
      const all = state.expandedRows;
      for (const key of Object.keys(all)) all[key] = true;
    },
    collapseAll(state) {
      state.expandedRows = {};
    },
    setColumnWidth(state, action: PayloadAction<{ index: number; width: number }>) {
      state.columnWidths[action.payload.index] = Math.max(60, action.payload.width);
    },
    setEditingCell(state, action: PayloadAction<string | null>) {
      state.editingCell = action.payload;
    },
  },
});

export const {
  toggleRowExpand, setRowExpanded, expandAll, collapseAll,
  setColumnWidth, setEditingCell,
} = uiSlice.actions;
export default uiSlice.reducer;
