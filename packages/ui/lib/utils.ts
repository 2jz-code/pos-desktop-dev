/**
 * Shared Utility Functions
 *
 * Common utility functions used across applications including
 * formatting, validation, and helper functions.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility for merging Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Format a number or string as USD currency
 */
export function formatCurrency(
	amount: number | string | null | undefined
): string {
	// Ensure the input is a valid number, default to 0 if not.
	const number =
		typeof amount === "number" ? amount : parseFloat(amount as string) || 0;

	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(number);
}

/**
 * Extract error message from API response
 */
export function extractErrorMessage(error: any): string {
	return (
		error?.response?.data?.error ||
		error?.message ||
		"An unknown error occurred."
	);
}
