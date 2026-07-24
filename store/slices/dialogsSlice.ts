import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { DialogsState } from "@/types";

const initialState: DialogsState = {
  viewDialog: { open: false, recordId: null },
  editDialog: { open: false, recordId: null },
  deleteDialog: { open: false, recordId: null },
};

const dialogsSlice = createSlice({
  name: "dialogs",
  initialState,
  reducers: {
    openViewDialog(state, action: PayloadAction<string>) {
      state.viewDialog = { open: true, recordId: action.payload };
    },
    openEditDialog(state, action: PayloadAction<string>) {
      state.editDialog = { open: true, recordId: action.payload };
    },
    openDeleteDialog(state, action: PayloadAction<string>) {
      state.deleteDialog = { open: true, recordId: action.payload };
    },
    closeDialogs(state) {
      state.viewDialog = { open: false, recordId: null };
      state.editDialog = { open: false, recordId: null };
      state.deleteDialog = { open: false, recordId: null };
    },
  },
});

export const { openViewDialog, openEditDialog, openDeleteDialog, closeDialogs } = dialogsSlice.actions;
export default dialogsSlice.reducer;
