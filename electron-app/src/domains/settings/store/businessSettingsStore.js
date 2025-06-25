import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { createSettingsSlice } from "./settingsSlice.js";

export const useBusinessSettingsStore = createWithEqualityFn(
	(set, get) => ({
		...createSettingsSlice(set, get),
	}),
	shallow
);
