import React, { Suspense } from "react";
import SEO from "@/components/SEO";
import Hero from "./components/Hero";
import Cards from "./components/Cards";
import Faq from "./components/Faq";
import Location from "./components/Location";
const ReviewCarousel = React.lazy(() => import("./components/ReviewCarousel"));
const Order = React.lazy(() => import("./components/Order"));

const HomePage = () => {
	return (
		<main>
			<SEO />
			<Hero />
			<Cards />
			<Suspense fallback={<div className="w-full h-96 bg-gray-200" />}>
				<ReviewCarousel />
			</Suspense>

			<Location />
			<Faq />
			<Suspense fallback={<div className="w-full h-96 bg-primary-beige" />}>
				<Order />
			</Suspense>
		</main>
	);
};

export default HomePage;
