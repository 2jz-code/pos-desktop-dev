/**
 * Icon Mapping Utilities
 *
 * Helps map icon name strings from shared status configs to actual icon components.
 * Each app can implement their own icon mapping based on their icon library setup.
 */

export type IconName =
  | "CheckCircle"
  | "Clock"
  | "XCircle"
  | "DollarSign"
  | "RefreshCw";

export interface IconMapper {
  [key: string]: any; // Icon component type
}

/**
 * Creates a function that maps icon name strings to actual icon components
 * @param iconMap - Object mapping icon names to icon components
 * @returns Function that takes an icon name and returns the icon component
 */
export const createIconMapper = (iconMap: IconMapper) => {
  return (iconName: IconName) => iconMap[iconName] || iconMap["Clock"];
};