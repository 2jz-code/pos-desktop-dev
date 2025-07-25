import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

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
