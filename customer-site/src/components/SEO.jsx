import React, { useEffect } from "react";

const SEO = ({
	title = "Ajeen Restaurant - Authentic Middle Eastern Cuisine",
	description = "Experience authentic Middle Eastern flavors at Ajeen Restaurant. Fresh ingredients, traditional recipes, and exceptional service. Order online for pickup or delivery.",
	keywords = "middle eastern food, authentic cuisine, restaurant, halal food, fresh ingredients, traditional recipes, online ordering",
	image = "/og-image.jpg",
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
		updateMetaTag("business:contact_data:locality", "Your City");
		updateMetaTag("business:contact_data:region", "Your State");
		updateMetaTag("business:contact_data:country_name", "United States");
		updateMetaTag("place:location:latitude", "40.7128"); // Replace with actual coordinates
		updateMetaTag("place:location:longitude", "-74.0060"); // Replace with actual coordinates

		// Add canonical link
		let canonical = document.querySelector('link[rel="canonical"]');
		if (!canonical) {
			canonical = document.createElement("link");
			canonical.setAttribute("rel", "canonical");
			document.head.appendChild(canonical);
		}
		canonical.setAttribute("href", url);

		// Add structured data if provided
		if (structuredData) {
			let script = document.querySelector("#structured-data");
			if (!script) {
				script = document.createElement("script");
				script.setAttribute("type", "application/ld+json");
				script.setAttribute("id", "structured-data");
				document.head.appendChild(script);
			}
			script.textContent = JSON.stringify(structuredData);
		}

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
