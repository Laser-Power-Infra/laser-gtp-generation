import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";

const selectFiltersState = (state: RootState) => state.filters;

export const selectFilters = (state: RootState) => state.filters;

export const selectHasActiveFilters = createSelector(
  [selectFiltersState],
  (filters) =>
    filters.docketNumber !== "" ||
    filters.utility.length > 0 ||
    filters.partyName !== "" ||
    filters.projectRefNo !== "" ||
    filters.loiNo !== "" ||
    filters.project !== "" ||
    filters.enquiryTenderNo !== "" ||
    filters.docxStatus.length > 0
);
