// customer-site/src/lib/imageUtils.js

// Generate a data URI placeholder image
const generatePlaceholderDataUri = (
	width = 400,
	height = 300,
	text = "No Image"
) => {
	// Create a simple SVG placeholder without emojis
	const svg = `
		<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
			<rect width="100%" height="100%" fill="#F3E1CA"/>
			<circle cx="50%" cy="40%" r="15" fill="#8B7355"/>
			<rect x="40%" y="30%" width="20%" height="20%" rx="3" fill="#5E6650"/>
			<text x="50%" y="60%" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#8B7355">${text}</text>
		</svg>
	`;

	// Use encodeURIComponent instead of btoa to handle all characters
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const getProductImageUrl = (imagePath) => {
	if (!imagePath) {
		// Return a data URI placeholder instead of relying on external file
		return generatePlaceholderDataUri(400, 300, "Product Image");
	}

	// Check if the imagePath is already a full URL
	if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
		// If the path ends with .jpg, replace it with .webp
		if (imagePath.endsWith(".jpg")) {
			return imagePath.replace(/\.jpg$/, ".webp");
		}
		return imagePath;
	}

	// If the path ends with .jpg, replace it with .webp
	let processedImagePath = imagePath;
	if (processedImagePath.endsWith(".jpg")) {
		processedImagePath = processedImagePath.replace(/\.jpg$/, ".webp");
	}

	// Assuming VITE_API_URL is available as an environment variable and ends with /api
	// We need to remove the /api part to get the base URL for media files
	const backendBaseUrl = import.meta.env.VITE_API_URL.replace("/api", "");
	return `${backendBaseUrl}${processedImagePath}`;
};

// Robust image error handler that prevents infinite loops
const createImageErrorHandler = (fallbackText = "Image") => {
	return (e) => {
		// Prevent infinite loops by removing the error handler
		e.target.onerror = null;

		// Set a data URI placeholder that will never fail to load
		e.target.src = generatePlaceholderDataUri(
			e.target.width || 400,
			e.target.height || 300,
			fallbackText
		);

		// Mark as loaded to hide loading states
		if (e.target.onLoad) {
			e.target.onLoad();
		}
	};
};

export {
	getProductImageUrl,
	generatePlaceholderDataUri,
	createImageErrorHandler,
};
