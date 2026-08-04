import {
  createSlice, createEntityAdapter, createAsyncThunk, createSelector,
  PayloadAction,
} from "@reduxjs/toolkit";
import type { DocketRecord, ChildItem } from "@/types";
import { generateChildItems } from "@/lib/child-data";
import { toast } from "sonner";

export const dataAdapter = createEntityAdapter<DocketRecord>({
  sortComparer: (a, b) => a.docketNumber.localeCompare(b.docketNumber),
});

type DataState = ReturnType<typeof dataAdapter.getInitialState> & {
  loading: boolean;
  loaded: boolean;
  syncing: boolean;
  childItems: Record<string, ChildItem[]>;
  /** Session-only per-record docx page orientation. Not persisted. */
  recordOrientations: Record<string, "portrait" | "landscape">;
  /** Session-only per-record "show title block" flag. Not persisted. */
  recordShowTitleBlock: Record<string, boolean>;
};

const initialState: DataState = {
  ...dataAdapter.getInitialState(),
  loading: false,
  loaded: false,
  syncing: false,
  childItems: {},
  recordOrientations: {},
  recordShowTitleBlock: {},
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
  loiNo: string;
  Project: string;
  enquiryTenderNo: string;
  generationVersion: number;
  createdAt: string;
  updatedAt: string;
  attachments: { name: string; url: string }[];
}

function toDocketRecord(r: DbRecord, existing: DocketRecord | undefined): DocketRecord {
  return {
    id: r.id,
    docketNumber: r.docketNumber,
    utility: r.utility,
    partyName: r.partyName,
    projectRefNo: r.projectRefNo,
    loiNo: r.loiNo ?? "",
    project: r.Project ?? "",
    enquiryTenderNo: r.enquiryTenderNo,
    generationVersion: r.generationVersion ?? 0,
    excelFiles: existing?.excelFiles ?? r.attachments.map((a) => ({ name: a.name, url: a.url })),
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

export const updateRecordField = createAsyncThunk(
  "data/updateRecordField",
  async ({ id, field, value }: { id: string; field: string; value: unknown }, { rejectWithValue }) => {
    const res = await fetch("/api/records", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, field, value }),
    });
    if (!res.ok) {
      const text = await res.text();
      return rejectWithValue(text);
    }
    return { id, field, value };
  }
);

const dataSlice = createSlice({
  name: "data",
  initialState,
  reducers: {
    setChildItems(state, action: PayloadAction<{ id: string; children: ChildItem[] }>) {
      state.childItems[action.payload.id] = action.payload.children;
    },
    setRecordOrientation(
      state,
      action: PayloadAction<{ id: string; orientation: "portrait" | "landscape" }>
    ) {
      state.recordOrientations[action.payload.id] = action.payload.orientation;
    },
    setRecordShowTitleBlock(
      state,
      action: PayloadAction<{ id: string; show: boolean }>
    ) {
      state.recordShowTitleBlock[action.payload.id] = action.payload.show;
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
      })
      .addCase(updateRecordField.fulfilled, (state, action) => {
        const { id, field, value } = action.payload;
        dataAdapter.updateOne(state, { id, changes: { [field]: value } as Partial<DocketRecord> });
        toast.success(`Updated ${field}`);
      })
      .addCase(updateRecordField.rejected, (_, action) => {
        toast.error("Failed to update field", {
          description: action.payload as string ?? "Unknown error",
        });
      });
  },
});

export const { setChildItems, setRecordOrientation, setRecordShowTitleBlock } = dataSlice.actions;

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
export const selectRecordOrientation = (id: string) =>
  (state: RootState) => state.data.recordOrientations[id] ?? "portrait";
export const selectRecordShowTitleBlock = (id: string) =>
  (state: RootState) => state.data.recordShowTitleBlock[id] ?? true;

export const selectAllDenormalized = createSelector(
  [selectAllRecords, selectChildItems],
  (records, childItems) =>
    records.map((rec) => ({
      ...rec,
      childItems: childItems[rec.id] || [],
    }))
);

export default dataSlice.reducer;
