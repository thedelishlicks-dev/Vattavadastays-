// src/admin/sectionContext.ts
//
// Which admin section the owner is in, so shared pieces (PageHeader) can show the
// section's icon without every page passing it down. Colours come from CSS
// (data-section in styles.css); this only carries the icon and label.
// Outside the admin layout the value is undefined and shared components render as before.

import { createContext, useContext } from "react";
import type { NavSection } from "@/admin/navConfig";

export const SectionContext = createContext<NavSection | undefined>(undefined);
export const useSection = () => useContext(SectionContext);
