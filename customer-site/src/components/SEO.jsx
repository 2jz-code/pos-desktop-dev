import React, { useEffect } from "react";
import {
	generateRestaurantStructuredData,
	generateWebsiteStructuredData,
} from "../utils/structuredData";

const SEO = ({
	title = "Ajeen Bakery - Authentic Middle Eastern Cuisine",
	description = "Experience authentic Middle Eastern flavors at Ajeen Bakery. Fresh and halal ingredients, traditional recipes, and exceptional service. Order online for pickup or delivery.",
	keywords = "middle eastern food, authentic cuisine, restaurant, halal food, fresh ingredients, traditional recipes, online ordering",
	image = "/logo512.png",
	url = window.location.href,
	type = "website",
	structuredData = null,
	robots = "index, follow",
}) => {
	useEffect(() => {
		// Set document title
		document.title = title;

		// Create or update meta tags
		const updateMetaTag = (name, content, property = false) => {
			const attribute = property ? "property" : "name";
			let meta = document.querySelector(`meta[${attribute}="${name}"]`);

			if (!meta) {
				meta = document.createElement("meta");
				meta.setAttribute(attribute, name);
				document.head.appendChild(meta);
			}

			meta.setAttribute("content", content);
		};

		// Basic meta tags
		updateMetaTag("description", description);
		updateMetaTag("keywords", keywords);
		updateMetaTag("robots", robots);
		updateMetaTag("author", "Ajeen Restaurant");
		updateMetaTag("viewport", "width=device-width, initial-scale=1.0");

		// Open Graph meta tags
		updateMetaTag("og:title", title, true);
		updateMetaTag("og:description", description, true);
		updateMetaTag("og:image", image, true);
		updateMetaTag("og:url", url, true);
		updateMetaTag("og:type", type, true);
		updateMetaTag("og:site_name", "Ajeen Restaurant", true);
		updateMetaTag("og:locale", "en_US", true);

		// Twitter Card meta tags
		updateMetaTag("twitter:card", "summary_large_image");
		updateMetaTag("twitter:title", title);
		updateMetaTag("twitter:description", description);
		updateMetaTag("twitter:image", image);

		// Additional meta tags for restaurants
		updateMetaTag("business:contact_data:locality", "Eagan");
		updateMetaTag("business:contact_data:region", "Minnesota");
		updateMetaTag("business:contact_data:country_name", "United States");
		updateMetaTag("place:location:latitude", "44.804131");
		updateMetaTag("place:location:longitude", "-93.166885");

		// Add canonical link
		let canonical = document.querySelector('link[rel="canonical"]');
		if (!canonical) {
			canonical = document.createElement("link");
			canonical.setAttribute("rel", "canonical");
			document.head.appendChild(canonical);
		}
		canonical.setAttribute("href", url);

		// Add structured data
		const combinedStructuredData = [];
		
		// Always include restaurant structured data
		combinedStructuredData.push(generateRestaurantStructuredData());
		
		// Always include website structured data
		combinedStructuredData.push(generateWebsiteStructuredData());
		
		// Add custom structured data if provided
		if (structuredData) {
			combinedStructuredData.push(structuredData);
		}
		
		let script = document.querySelector("#structured-data");
		if (!script) {
			script = document.createElement("script");
			script.setAttribute("type", "application/ld+json");
			script.setAttribute("id", "structured-data");
			document.head.appendChild(script);
		}
		script.textContent = JSON.stringify(combinedStructuredData);

		// Cleanup function
		return () => {
			// Remove structured data script when component unmounts
			const script = document.querySelector("#structured-data");
			if (script) {
				script.remove();
			}
		};
	}, [title, description, keywords, image, url, type, structuredData, robots]);

	return null; // This component doesn't render anything
};

export default SEO;
