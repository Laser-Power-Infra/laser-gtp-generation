import { configureStore } from "@reduxjs/toolkit";
import dataReducer from "./slices/dataSlice";
import filtersReducer from "./slices/filtersSlice";
import paginationReducer from "./slices/paginationSlice";
import uiReducer from "./slices/uiSlice";
import dialogsReducer from "./slices/dialogsSlice";

export const store = configureStore({
  reducer: {
    data: dataReducer,
    filters: filtersReducer,
    pagination: paginationReducer,
    ui: uiReducer,
    dialogs: dialogsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
