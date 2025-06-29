import React from "react";
import { useInView } from "react-intersection-observer";
import Laptop from "../../../assets/Zaatar.jpeg"; //
import OptimizedImage from "@/components/OptimizedImage";

const AboutCard = ({
	title,
	description,
	image,
	reverse = false,
	delay = 0,
	layout = "imageText", // Default layout is image and text
}) => {
	const [ref, inView] = useInView({
		threshold: 0.2,
		triggerOnce: true,
	});

	// If layout is 'textOnly', render a centered, text-focused block
	if (layout === "textOnly") {
		return (
			<div
				ref={ref}
				className={`text-center max-w-4xl mx-auto mb-20 transition-all duration-700 ease-out ${
					inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
				}`}
				style={{ transitionDelay: `${delay}ms` }}
			>
				<div className="flex flex-col items-center">
					<h2 className="text-3xl md:text-4xl font-bold mb-4 text-accent-dark-green">
						{title}
					</h2>
					<div className="h-1 w-20 bg-primary-green mb-6 rounded-full"></div>
					<p className="text-accent-dark-brown leading-relaxed">
						{description}
					</p>
				</div>
			</div>
		);
	}

	// Default rendering for image and text layout
	return (
		<div
			ref={ref}
			className={`grid md:grid-cols-2 gap-12 items-center mb-20 transition-all duration-700 ease-out ${
				inView
					? "opacity-100 translate-x-0"
					: reverse
					? "opacity-0 translate-x-24"
					: "opacity-0 -translate-x-24"
			}`}
			style={{ transitionDelay: `${delay}ms` }}
		>
			<div className={`${reverse ? "md:order-last" : ""}`}>
				<div className="relative group">
					<div className="absolute -inset-2 bg-gradient-to-r from-primary-beige to-primary-green rounded-2xl transform rotate-2 opacity-50 blur-lg transition-all duration-700 group-hover:rotate-6 group-hover:scale-105"></div>
					<OptimizedImage
						src={image}
						alt={title}
						className="relative w-full h-[300px] md:h-[400px] object-cover rounded-xl shadow-xl"
					/>
				</div>
			</div>
			<div className="flex flex-col justify-center">
				<h2 className="text-3xl md:text-4xl font-bold mb-4 text-accent-dark-green">
					{" "}
					{title}
				</h2>
				<div className="h-1 w-20 bg-primary-green mb-6 rounded-full"></div>
				<p className="text-accent-dark-brown leading-relaxed">{description}</p>
			</div>
		</div>
	);
};

const Cards = () => {
	const sections = [
		{
			title: "Who we are",
			description:
				"The best food tells a story. Ours goes beyond your average Mediterranean restaurant. At Ajeen, we are a family rooted in Tarsheeha, Palestine, with lived experiences in the vibrant cultures of South Lebanon, Syria, and Jordan.\n\nEvery country we've called home has left a mark on our identity and, most importantly, on the very essence of our food. These diverse experiences are more than just memories; they are the very soul of Ajeen, representing the rich, authentic flavors and shared stories of the entire Levant region right here in Eagan, Minnesota. Each item on our menu reflects these cherished memories and generations of traditional recipes passed down to us.",
			image: Laptop, // Image is kept for easy toggling later
			reverse: false,
			delay: 0,
			layout: "textOnly", // Set the layout to textOnly
		},
		{
			title: "How it started",
			description:
				"After settling down in Minnesota, we wanted to bring the truest form of mana'eesh to our community. In order to make this happen, we knew we had to go back straight to the source. We traveled back to Amman, Jordan, where many of our family's recipes began. We spent months working in different local bakeries, learning from master bakers. Day by day, we perfected our skills. We didn't just learn how to make mana'eesh, but how to perfect it.\n\nIn essence, we didn't just bring back recipes, we've brought back a deep understanding, skill, and love for this craft. We brought back the real taste of the Levant, straight from its heart to our Minnesota community.",
			image: null, // Image is not used, set to null
			reverse: true,
			delay: 200,
			layout: "textOnly", // Set the layout to textOnly
		},
	];

	return (
		<div
			id="about"
			className="w-full py-20 px-4"
			style={{
				background: `linear-gradient(to bottom, rgba(0,0,0,0.3), var(--color-primary-beige) 10%, var(--color-accent-light-beige) 25%)`,
			}}
		>
			<div className="max-w-7xl mx-auto">
				<div className="text-center mb-16">
					<span className="text-primary-green font-semibold tracking-wider uppercase">
						Our Story
					</span>
					<h1 className="text-4xl md:text-5xl font-bold mt-2 text-accent-dark-green">
						About Us
					</h1>
					<div className="h-1 w-24 bg-primary-green mx-auto mt-4 rounded-full"></div>
				</div>

				{sections.map((section, index) => (
					<AboutCard
						key={index}
						title={section.title}
						description={section.description}
						image={section.image}
						reverse={section.reverse}
						delay={section.delay}
						layout={section.layout} // Pass layout prop
					/>
				))}
			</div>
		</div>
	);
};

export default Cards;
