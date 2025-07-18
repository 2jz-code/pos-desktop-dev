export const generateRestaurantStructuredData = () => {
	return {
		"@context": "https://schema.org",
		"@type": "Restaurant",
		"name": "Ajeen Bakery",
		"alternateName": "Ajeen",
		"description": "Authentic Middle Eastern cuisine featuring traditional recipes from the Levant. Experience the flavors of our family's heritage with fresh ingredients and time-honored cooking techniques.",
		"image": [
			"https://bakeajeen.com/logo512.png",
			"https://bakeajeen.com/assets/logo.png",
			"https://bakeajeen.com/assets/Hero-Vid.mp4"
		],
		"@id": "https://bakeajeen.com",
		"url": "https://bakeajeen.com",
		"telephone": "+1-651-412-5336",
		"email": "contact@bakeajeen.com",
		"priceRange": "$$",
		"servesCuisine": "Middle Eastern",
		"acceptsReservations": false,
		"hasMenu": "https://bakeajeen.com/menu",
		"takeaway": true,
		"delivery": true,
		"address": {
			"@type": "PostalAddress",
			"streetAddress": "2105 Cliff Rd, Suite 300",
			"addressLocality": "Eagan",
			"addressRegion": "MN",
			"postalCode": "55122",
			"addressCountry": "US"
		},
		"geo": {
			"@type": "GeoCoordinates",
			"latitude": 44.804131,
			"longitude": -93.166885
		},
		"openingHoursSpecification": [
			{
				"@type": "OpeningHoursSpecification",
				"dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday"],
				"opens": "11:00",
				"closes": "20:00"
			},
			{
				"@type": "OpeningHoursSpecification",
				"dayOfWeek": ["Friday", "Saturday"],
				"opens": "11:00",
				"closes": "21:00"
			},
			{
				"@type": "OpeningHoursSpecification",
				"dayOfWeek": "Sunday",
				"opens": "11:00",
				"closes": "20:00"
			}
		],
		"sameAs": [
			"https://www.facebook.com/share/1AdkSavHnT/",
			"https://www.instagram.com/bake_ajeen/",
			"https://www.tiktok.com/@bake_ajeen?_t=ZT-8wNu8CL8oaU&_r=1",
			"https://www.yelp.com/biz/ajeen-bakery-eagan?osq=ajeen"
		],
		"aggregateRating": {
			"@type": "AggregateRating",
			"ratingValue": "4.5",
			"reviewCount": "50"
		},
		"paymentAccepted": "Cash, Credit Card, Debit Card",
		"currenciesAccepted": "USD",
		"founder": {
			"@type": "Person",
			"name": "Ajeen Restaurant Family"
		},
		"foundingDate": "2025",
		"keywords": "middle eastern food, authentic cuisine, restaurant, halal food, fresh ingredients, traditional recipes, online ordering, bakery, levant food, eagan restaurant"
	};
};

export const generateMenuStructuredData = (menuItems = []) => {
	if (!menuItems.length) return null;

	return {
		"@context": "https://schema.org",
		"@type": "Menu",
		"name": "Ajeen Bakery Menu",
		"description": "Authentic Middle Eastern cuisine menu featuring traditional recipes",
		"menuSection": menuItems.map(item => ({
			"@type": "MenuSection",
			"name": item.category,
			"hasMenuItem": item.items?.map(menuItem => ({
				"@type": "MenuItem",
				"name": menuItem.name,
				"description": menuItem.description,
				"offers": {
					"@type": "Offer",
					"price": menuItem.price,
					"priceCurrency": "USD"
				}
			})) || []
		}))
	};
};

export const generateBreadcrumbStructuredData = (breadcrumbs = []) => {
	if (!breadcrumbs.length) return null;

	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		"itemListElement": breadcrumbs.map((crumb, index) => ({
			"@type": "ListItem",
			"position": index + 1,
			"name": crumb.name,
			"item": crumb.url
		}))
	};
};

export const generateLocalBusinessStructuredData = () => {
	return {
		"@context": "https://schema.org",
		"@type": "LocalBusiness",
		"name": "Ajeen Bakery",
		"image": "https://bakeajeen.com/logo512.png",
		"@id": "https://bakeajeen.com",
		"url": "https://bakeajeen.com",
		"telephone": "+1-651-412-5336",
		"address": {
			"@type": "PostalAddress",
			"streetAddress": "2105 Cliff Rd, Suite 300",
			"addressLocality": "Eagan",
			"addressRegion": "MN",
			"postalCode": "55122",
			"addressCountry": "US"
		},
		"geo": {
			"@type": "GeoCoordinates",
			"latitude": 44.804131,
			"longitude": -93.166885
		},
		"openingHoursSpecification": [
			{
				"@type": "OpeningHoursSpecification",
				"dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday"],
				"opens": "11:00",
				"closes": "20:00"
			},
			{
				"@type": "OpeningHoursSpecification",
				"dayOfWeek": ["Friday", "Saturday"],
				"opens": "11:00",
				"closes": "21:00"
			},
			{
				"@type": "OpeningHoursSpecification",
				"dayOfWeek": "Sunday",
				"opens": "11:00",
				"closes": "20:00"
			}
		]
	};
};

export const generateWebsiteStructuredData = () => {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"name": "Ajeen Bakery",
		"url": "https://bakeajeen.com",
		"potentialAction": {
			"@type": "SearchAction",
			"target": "https://bakeajeen.com/menu?search={search_term_string}",
			"query-input": "required name=search_term_string"
		},
		"sameAs": [
			"https://www.facebook.com/share/1AdkSavHnT/",
			"https://www.instagram.com/bake_ajeen/",
			"https://www.tiktok.com/@bake_ajeen?_t=ZT-8wNu8CL8oaU&_r=1",
			"https://www.yelp.com/biz/ajeen-bakery-eagan?osq=ajeen"
		]
	};
};