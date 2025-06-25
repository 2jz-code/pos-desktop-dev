import React from "react";

const FullScreenLoader = () => {
	return (
		<div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
			<div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
		</div>
	);
};

export default FullScreenLoader;
