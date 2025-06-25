import React, { useState, useEffect } from "react";
import { FaArrowUp } from "react-icons/fa";

const ScrollToTop = () => {
	const [isVisible, setIsVisible] = useState(false);

	const toggleVisibility = () => {
		if (window.pageYOffset > 300) {
			setIsVisible(true);
		} else {
			setIsVisible(false);
		}
	};

	const scrollToTop = () => {
		window.scrollTo({
			top: 0,
			behavior: "smooth",
		});
	};

	useEffect(() => {
		window.addEventListener("scroll", toggleVisibility);
		return () => {
			window.removeEventListener("scroll", toggleVisibility);
		};
	}, []);

	return (
		<div className="fixed bottom-5 right-5">
			{isVisible && (
				<button
					onClick={scrollToTop}
					className="p-2 bg-white rounded-full text-black shadow-lg hover:bg-primary-beige transition duration-300"
				>
					<FaArrowUp size={20} />
				</button>
			)}
		</div>
	);
};

export default ScrollToTop;
