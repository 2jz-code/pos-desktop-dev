// Pre-defined structured data templates
export const createRestaurantStructuredData = (restaurantData = {}) => {
	const defaultData = {
		name: "Ajeen Restaurant",
		description:
			"Authentic Middle Eastern cuisine with fresh ingredients and traditional recipes",
		url: window.location.origin,
		telephone: "+1-XXX-XXX-XXXX", // Replace with actual phone
		address: {
			streetAddress: "123 Main Street", // Replace with actual address
			addressLocality: "Your City",
			addressRegion: "Your State",
			postalCode: "12345",
			addressCountry: "US",
		},
		geo: {
			latitude: "40.7128", // Replace with actual coordinates
			longitude: "-74.0060",
		},
		openingHours: [
			"Mo-Su 11:00-22:00", // Replace with actual hours
		],
		priceRange: "$$",
		cuisineType: ["Middle Eastern", "Mediterranean", "Halal"],
		paymentAccepted: ["Cash", "Credit Card", "Debit Card"],
		hasDeliveryService: true,
		hasTakeaway: true,
		...restaurantData,
	};

	return {
		"@context": "https://schema.org",
		"@type": "Restaurant",
		name: defaultData.name,
		description: defaultData.description,
		url: defaultData.url,
		telephone: defaultData.telephone,
		address: {
			"@type": "PostalAddress",
			...defaultData.address,
		},
		geo: {
			"@type": "GeoCoordinates",
			latitude: defaultData.geo.latitude,
			longitude: defaultData.geo.longitude,
		},
		openingHours: defaultData.openingHours,
		priceRange: defaultData.priceRange,
		servesCuisine: defaultData.cuisineType,
		paymentAccepted: defaultData.paymentAccepted,
		hasDeliveryService: defaultData.hasDeliveryService,
		hasTakeaway: defaultData.hasTakeaway,
		aggregateRating: {
			"@type": "AggregateRating",
			ratingValue: "4.8", // Replace with actual rating
			reviewCount: "150", // Replace with actual review count
		},
	};
};

export const createMenuItemStructuredData = (menuItem) => {
	return {
		"@context": "https://schema.org",
		"@type": "MenuItem",
		name: menuItem.name,
		description: menuItem.description,
		image: menuItem.image,
		offers: {
			"@type": "Offer",
			price: menuItem.price,
			priceCurrency: "USD",
			availability: "https://schema.org/InStock",
		},
		nutrition: {
			"@type": "NutritionInformation",
			// Add nutrition info if available
		},
	};
};

export const createBreadcrumbStructuredData = (breadcrumbs) => {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: breadcrumbs.map((crumb, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: crumb.name,
			item: crumb.url,
		})),
	};
};
