import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import ManakeeshVideo from "../../../assets/Hero-Vid.mp4";
import HeroPoster from "../../../assets/hero-pic.webp"; // Import the poster image
import Logo from "../../../assets/logo.png"; // Import the logo
import OptimizedImage from "@/components/OptimizedImage"; // Import the OptimizedImage component

const Hero = () => {
	const titleRef = useRef(null); // This ref might now apply to the logo container or be less relevant
	const subtitleRef = useRef(null);
	const taglineRef = useRef(null);
	const buttonRef = useRef(null);
	const scrollIndicatorRef = useRef(null);

	useEffect(() => {
		// Staggered animation for hero elements
		const elements = [
			{ ref: titleRef, delay: 300 }, // Keep for the logo's container if needed
			{ ref: subtitleRef, delay: 600 },
			{ ref: taglineRef, delay: 900 },
			{ ref: buttonRef, delay: 1200 },
			{ ref: scrollIndicatorRef, delay: 1500 },
		];

		elements.forEach(({ ref, delay }) => {
			setTimeout(() => {
				if (ref.current) {
					ref.current.classList.remove("opacity-0");
					ref.current.classList.remove("translate-y-10");
				}
			}, delay);
		});
	}, []);

	return (
		<div
			id="home"
			className="relative h-screen w-full overflow-hidden"
		>
			{/* Video Background with Parallax Effect */}
			<div className="absolute inset-0 scale-110">
				<video
					autoPlay
					loop
					muted
					playsInline
					poster={HeroPoster}
					preload="none"
					className="absolute top-0 left-0 w-full h-full object-cover"
				>
					<source
						src={ManakeeshVideo}
						type="video/mp4"
					/>
				</video>

				{/* Gradient Overlay for better text readability */}
				<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/60 to-black/30"></div>
			</div>

			{/* Hero Content */}
			<div className="relative z-10 h-full flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8">
				<div className="max-w-4xl mx-auto text-center">
					{/* Logo instead of Text Title */}
					<div
						ref={titleRef} // Apply animation ref to the logo container
						className="mb-4 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
					>
						<OptimizedImage
							src={Logo}
							alt="Ajeen Logo"
							// Adjust size as needed for the hero section.
							// Using h-20 to h-32 or similar, with w-auto to maintain aspect ratio.
							// Responsive sizing can be added e.g. h-20 sm:h-24 md:h-28 lg:h-32
							className="h-24 md:h-28 lg:h-32 w-auto mx-auto"
							width={148}
							height={128}
							priority
						/>
					</div>

					{/* Subtitle */}
					<p
						ref={subtitleRef}
						className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-medium text-accent-light-beige mb-6 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
					>
						Fresh, Authentic, and Tasty Food for{" "}
						<br className="hidden sm:block" />
						Breakfast, Lunch, and Dinner!
					</p>

					{/* Tagline */}
					<p
						ref={taglineRef}
						className="text-lg md:text-xl text-primary-beige mb-8 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
					>
						The local shop to satisfy all your cravings!
					</p>

					{/* CTA Button */}
					<div
						ref={buttonRef}
						className="opacity-0 translate-y-10 transition-all duration-1000 ease-out"
					>
						<Link
							to="/menu"
							className="inline-flex items-center px-8 py-3 rounded-full bg-accent-warm-brown text-accent-light-beige font-medium text-lg shadow-lg hover:bg-opacity-80 transform hover:scale-105 transition-all duration-300"
						>
							Order Now
							<svg
								className="ml-2 w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M14 5l7 7m0 0l-7 7m7-7H3"
								/>
							</svg>
						</Link>
					</div>
				</div>

				{/* Fixed and Centered Scroll Indicator */}
				<div
					ref={scrollIndicatorRef}
					className="fixed-center w-full flex justify-center items-center opacity-0 translate-y-10 transition-all duration-1000 ease-out"
					style={{
						position: "absolute",
						bottom: "2rem",
						left: "0",
						right: "0",
						zIndex: 20,
					}}
				>
					<div className="flex flex-col items-center animate-bounce">
						<span className="text-accent-light-beige text-sm mb-2">
							Scroll Down
						</span>
						<svg
							className="w-6 h-6 text-accent-light-beige"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M19 14l-7 7m0 0l-7-7m7 7V3"
							/>
						</svg>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Hero;
