export interface ChildItem {
  id: string;
  parentId: string;
  itemName: string;
  status: "pending" | "in_progress" | "completed" | "review";
  assignedTo: string;
  dueDate: string;
}

export interface DocketRecord {
  id: string;
  docketNumber: string;
  utility: string;
  partyName: string;
  projectRefNo: string;
  enquiryTenderNo: string;
  excelFiles: string[];
  docxStatus: "download" | "generating" | "not_generated";
  docxGeneratedAt?: string;
  docxProgress?: number;
  childItems?: ChildItem[];
}

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  field: string;
  direction: SortDirection;
}

export interface FiltersState {
  docketNumber: string;
  utility: string[];
  partyName: string;
  projectRefNo: string;
  enquiryTenderNo: string;
  docxStatus: string[];
}

export interface PaginationState {
  currentPage: number;
  pageSize: number;
}

export interface DialogsState {
  viewDialog: { open: boolean; recordId: string | null };
  editDialog: { open: boolean; recordId: string | null };
  deleteDialog: { open: boolean; recordId: string | null };
}

export interface UIState {
  expandedRows: Record<string, boolean>;
  columnWidths: Record<number, number>;
  editingCell: string | null;
}
