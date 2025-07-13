// src/pages/reports/components/LoadingSpinner.jsx
import PropTypes from "prop-types";
import { Loader2 } from "lucide-react"; // Import lucide-react icon
import { cn } from "@/lib/utils"; // Assuming you have cn utility

const LoadingSpinner = ({ size = "md", className = "" }) => {
	const sizeClasses = {
		xs: "h-4 w-4", // Adjusted size for lucide icons
		sm: "h-5 w-5",
		md: "h-8 w-8",
		lg: "h-12 w-12",
		xl: "h-16 w-16",
	};
	const sizeClass = sizeClasses[size] || sizeClasses.md;

	return (
		<Loader2
			className={cn("animate-spin text-primary", sizeClass, className)} // Use primary color or as needed
			role="status"
			aria-live="polite"
			aria-label="Loading"
		/>
	);
};

LoadingSpinner.propTypes = {
	size: PropTypes.oneOf(["xs", "sm", "md", "lg", "xl"]),
	className: PropTypes.string,
};

export default LoadingSpinner;
