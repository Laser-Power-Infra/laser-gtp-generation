import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/store";

const selectFiltersState = (state: RootState) => state.filters;

export const selectFilters = (state: RootState) => state.filters;

export const selectHasActiveFilters = createSelector(
  [selectFiltersState],
  (filters) =>
    filters.docketNumber !== "" ||
    filters.partyName !== "" ||
    filters.projectRefNo !== "" ||
    filters.loiNo !== "" ||
    filters.project !== "" ||
    filters.enquiryTenderNo !== "" ||
    Object.values(filters.values).some((v) => v.length > 0)
);
