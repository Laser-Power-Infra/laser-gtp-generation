import {
  createSlice, createEntityAdapter, createAsyncThunk, createSelector,
  PayloadAction,
} from "@reduxjs/toolkit";
import type { DocketRecord, ChildItem } from "@/types";
import { generateChildItems } from "@/lib/child-data";

export const dataAdapter = createEntityAdapter<DocketRecord>({
  sortComparer: (a, b) => a.docketNumber.localeCompare(b.docketNumber),
});

type DataState = ReturnType<typeof dataAdapter.getInitialState> & {
  loading: boolean;
  loaded: boolean;
  syncing: boolean;
  childItems: Record<string, ChildItem[]>;
};

const initialState: DataState = {
  ...dataAdapter.getInitialState(),
  loading: false,
  loaded: false,
  syncing: false,
  childItems: {},
};

function defaults(docketNumber: string): Partial<DocketRecord> {
  return {
    excelFiles: [],
    docxStatus: "not_generated",
  };
}

function ensureChildItems(state: DataState, id: string) {
  if (!state.childItems[id]) {
    const children = generateChildItems(parseInt(id), id);
    if (children.length > 0) state.childItems[id] = children;
  }
}

interface DbRecord {
  id: string;
  docketNumber: string;
  utility: string;
  partyName: string;
  projectRefNo: string;
  enquiryTenderNo: string;
  createdAt: string;
  updatedAt: string;
}

function toDocketRecord(r: DbRecord, existing: DocketRecord | undefined): DocketRecord {
  return {
    id: r.id,
    docketNumber: r.docketNumber,
    utility: r.utility,
    partyName: r.partyName,
    projectRefNo: r.projectRefNo,
    enquiryTenderNo: r.enquiryTenderNo,
    excelFiles: existing?.excelFiles ?? [],
    docxStatus: (existing?.docxStatus as DocketRecord["docxStatus"]) ?? "not_generated",
    docxGeneratedAt: existing?.docxGeneratedAt,
    docxProgress: existing?.docxProgress,
  };
}

export const fetchRecords = createAsyncThunk("data/fetchRecords", async () => {
  console.log("[Redux] fetchRecords thunk called");
  const res = await fetch("/api/records");
  if (!res.ok) {
    const text = await res.text();
    console.error("[Redux] fetchRecords failed:", res.status, text);
    throw new Error("Failed to fetch records");
  }
  const data = await res.json();
  console.log("[Redux] fetchRecords got", data.records?.length ?? 0, "records");
  return data.records as DbRecord[];
});

export const syncSmartsheet = createAsyncThunk("data/syncSmartsheet", async (_, { getState }) => {
  console.log("[Redux] syncSmartsheet thunk called");
  const res = await fetch("/api/records", { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    console.error("[Redux] syncSmartsheet failed:", res.status, text);
    throw new Error("Sync failed");
  }
  const data = await res.json();
  console.log("[Redux] syncSmartsheet completed:", data.syncedCount, "synced,", data.records?.length ?? 0, "total records");
  if (data.warning) console.warn("[Redux] sync warning:", data.warning);
  return {
    records: data.records as DbRecord[],
    syncedCount: data.syncedCount as number,
  };
});

const dataSlice = createSlice({
  name: "data",
  initialState,
  reducers: {
    updateRecordField(state, action: PayloadAction<{ id: string; field: string; value: unknown }>) {
      const { id, field, value } = action.payload;
      dataAdapter.updateOne(state, { id, changes: { [field]: value } as Partial<DocketRecord> });
    },
    setChildItems(state, action: PayloadAction<{ id: string; children: ChildItem[] }>) {
      state.childItems[action.payload.id] = action.payload.children;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecords.pending, (state) => { console.log("[Redux] fetchRecords pending"); state.loading = true; })
      .addCase(fetchRecords.fulfilled, (state, action) => {
        console.log("[Redux] fetchRecords fulfilled —", action.payload.length, "records from API");
        const records: DocketRecord[] = action.payload.map((r) => toDocketRecord(r, undefined));
        console.log("[Redux] mapped to", records.length, "DocketRecords");
        dataAdapter.setAll(state, records);
        state.loading = false;
        state.loaded = true;
        records.forEach((r) => ensureChildItems(state, r.id));
      })
      .addCase(fetchRecords.rejected, (state, action) => {
        console.error("[Redux] fetchRecords rejected:", action.error);
        state.loading = false;
      })
      .addCase(syncSmartsheet.pending, (state) => { console.log("[Redux] syncSmartsheet pending"); state.syncing = true; })
      .addCase(syncSmartsheet.fulfilled, (state, action) => {
        console.log("[Redux] syncSmartsheet fulfilled —", action.payload.records.length, "records");
        const records: DocketRecord[] = action.payload.records.map((r) =>
          toDocketRecord(r, state.entities[r.id] as DocketRecord | undefined)
        );
        console.log("[Redux] merged to", records.length, "DocketRecords");
        dataAdapter.setAll(state, records);
        state.syncing = false;
        state.loaded = true;
        records.forEach((r) => ensureChildItems(state, r.id));
      })
      .addCase(syncSmartsheet.rejected, (state, action) => {
        console.error("[Redux] syncSmartsheet rejected:", action.error);
        state.syncing = false;
      });
  },
});

export const { updateRecordField, setChildItems } = dataSlice.actions;

import type { RootState } from "@/store";
const dataSelectors = dataAdapter.getSelectors<RootState>((s) => s.data);

export const {
  selectAll: selectAllRecords,
  selectById: selectRecordById,
  selectIds: selectRecordIds,
} = dataSelectors;

export const selectRecordsLoading = (state: RootState) => state.data.loading;
export const selectRecordsLoaded = (state: RootState) => state.data.loaded;
export const selectRecordsSyncing = (state: RootState) => state.data.syncing;
export const selectChildItems = (state: RootState) => state.data.childItems;
export const selectChildrenByParentId = (parentId: string) =>
  (state: RootState) => state.data.childItems[parentId] || [];

export const selectAllDenormalized = createSelector(
  [selectAllRecords, selectChildItems],
  (records, childItems) =>
    records.map((rec) => ({
      ...rec,
      childItems: childItems[rec.id] || [],
    }))
);

export default dataSlice.reducer;
