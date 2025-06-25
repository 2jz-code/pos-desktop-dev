import React from "react";

// SparklesIcon remains a generic SVG, its color will be controlled by className
const SparklesIcon = ({ className }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		strokeWidth={1.5}
		stroke="currentColor"
		className={className}
	>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L1.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.25 12L17.437 9.154a4.5 4.5 0 00-3.09-3.09L11.5 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L18.25 12zM12 18.75l.813-2.846a4.5 4.5 0 003.09-3.09L18.75 12l-2.846-.813a4.5 4.5 0 00-3.09-3.09L12 5.25l-.813 2.846a4.5 4.5 0 00-3.09 3.09L5.25 12l2.846.813a4.5 4.5 0 003.09 3.09L12 18.75z"
		/>
	</svg>
);

const ComingSoonWrapper = ({
	children,
	active = true,
	message = "Coming Soon!",
}) => {
	if (!active) {
		return <>{children}</>;
	}

	return (
		<div className="relative group isolate">
			<div
				className={
					active
						? "opacity-40 pointer-events-none transition-opacity duration-300" // Slightly more opacity for underlying content
						: ""
				}
			>
				{children}
			</div>
			{active && (
				// Overlay: Semi-transparent dark brown, with backdrop blur
				<div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm rounded-md cursor-not-allowed z-10 p-4 text-center transition-all duration-300 ease-in-out">
					<div className="flex flex-col items-center">
						{/* Icon: Primary Green */}
						<SparklesIcon className="w-8 h-8 text-primary-green mb-3" />

						{/* Message Badge: Primary Green background, Light Beige text */}
						<span className="bg-primary-green text-accent-light-beige text-sm sm:text-md font-semibold px-4 py-1.5 rounded-full shadow-lg">
							{message}
						</span>
						{/* Optional explanatory note: Primary Beige text */}
						{/* <p className="text-xs text-primary-beige mt-2.5">This feature is currently under development.</p> */}
					</div>
				</div>
			)}
		</div>
	);
};

export default ComingSoonWrapper;
