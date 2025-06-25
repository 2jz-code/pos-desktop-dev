import React from "react";
import Hero from "./components/Hero";
import About from "./components/Cards";
import Order from "./components/Order";
import ReviewCarousel from "./components/ReviewCarousel";
import Faq from "./components/Faq";
import Location from "./components/Location";
import Scroll from "./components/Scroll";

const HomePage = () => {
	return (
		<>
			<Hero />
			<About />
			<ReviewCarousel />
			<Location />
			<Faq />
			<Order />
			<Scroll />
		</>
	);
};

export default HomePage;
