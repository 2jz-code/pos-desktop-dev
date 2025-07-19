// This file serves as a central hub for exporting all the components, pages, and services from the settings domain.

// Main Page
export { SettingsPage } from "./pages/SettingsPage";

// New Settings Tab Components
export { FinancialSettings } from "./components/FinancialSettings";
export { ReceiptSettings } from "./components/ReceiptSettings";
export { PrinterSettings } from "./components/PrinterSettings";
export { DeviceSettings } from "./components/DeviceSettings";
export { PaymentSettings } from "./components/PaymentSettings";
export { StoreLocationsManagement } from "./components/StoreLocationsManagement";

// Legacy Components (should be phased out or re-evaluated)

// Services
export * as settingsService from "./services/settingsService.js";

// Store (if needed, otherwise can be removed)
export { createSettingsSlice } from "./store/settingsSlice.js";
export { useSettingsStore } from "./store/settingsStore.js";
