import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
	FaFacebook,
	FaInstagram,
	FaTwitterSquare,
	FaYelp,
	FaHeart,
	FaTiktok,
} from "react-icons/fa";
import Logo from "../../assets/logo.png"; // Import the logo
import { useStoreInfo } from "@/hooks/useSettings";
import OptimizedImage from "@/components/OptimizedImage";
import BusinessHours from "@/components/common/BusinessHours";

const Footer = () => {
	const currentYear = new Date().getFullYear();
	const { data: storeInfo } = useStoreInfo();
	const navigate = useNavigate();
	const location = useLocation();

	const handleNavClick = (path) => {
		if (location.pathname === "/" && path.includes("/#")) {
			const selector = path.split("#")[1];
			const element = document.getElementById(selector);
			if (element) {
				element.scrollIntoView({ behavior: "smooth" });
			}
		} else {
			navigate(path);
		}
	};

	const quickLinks = [
		{ name: "Home", path: "/" },
		{ name: "Menu", path: "/menu" },
		{ name: "About Us", path: "/#about" },
		{ name: "Contact", path: "/#contact" },
		{ name: "FAQ", path: "/#faq" },
	];

	return (
		<footer className="bg-accent-dark-green text-primary-beige">
			<div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
				<div className="grid grid-cols-1 md:grid-cols-4 gap-10">
					<div className="col-span-1 md:col-span-1">
						<Link
							to="/"
							className="inline-block"
						>
							{/* Circular div wrapping the logo */}
							<div className="bg-primary-beige rounded-full p-2 inline-flex items-center justify-center">
								<OptimizedImage
									src={Logo}
									alt="Ajeen Logo"
									// Adjust size as needed for the footer.
									// h-10 or h-12 is usually a good size for footer logos.
									// The circular div will be slightly larger due to padding.
									className="h-12 w-auto"
									width={56}
									height={48}
								/>
							</div>
						</Link>
						<p className="mt-4 text-primary-beige text-sm">
							Authentic Middle Eastern cuisine made with love and tradition.
							Serving the community with fresh, delicious food since{" "}
							{currentYear}.
						</p>
						<div className="mt-6 flex space-x-4">
							<a
								href="https://www.facebook.com/share/1AdkSavHnT/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary-beige hover:text-accent-light-beige transition-colors duration-300 transform hover:scale-110"
								aria-label="Facebook"
							>
								<FaFacebook size={24} />
							</a>
							<a
								href="https://www.instagram.com/bake_ajeen/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary-beige hover:text-accent-light-beige transition-colors duration-300 transform hover:scale-110"
								aria-label="Instagram"
							>
								<FaInstagram size={24} />
							</a>
							<a
								href="https://www.tiktok.com/@bake_ajeen?_t=ZT-8wNu8CL8oaU&_r=1"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary-beige hover:text-accent-light-beige transition-colors duration-300 transform hover:scale-110"
								aria-label="TikTok"
							>
								<FaTiktok size={22} />
							</a>
							<a
								href="https://www.yelp.com/biz/ajeen-bakery-eagan?osq=ajeen"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary-beige hover:text-accent-light-beige transition-colors duration-300 transform hover:scale-110"
								aria-label="Yelp"
							>
								<FaYelp size={22} />
							</a>
						</div>
					</div>

					{/* Quick Links */}
					<div>
						<h3 className="text-accent-light-beige text-lg font-semibold mb-4 border-b border-primary-green pb-2">
							Quick Links
						</h3>
						<ul className="space-y-2">
							{quickLinks.map((item) => (
								<li key={item.name}>
									<button
										onClick={() => handleNavClick(item.path)}
										className="text-primary-beige hover:text-accent-light-beige transition-colors duration-300 flex items-center group"
									>
										<span className="w-0 group-hover:w-2 h-1 bg-primary-green mr-0 group-hover:mr-2 transition-all duration-300"></span>
										{item.name}
									</button>
								</li>
							))}
						</ul>
					</div>

					{/* Contact Info */}
					<div>
						<h3 className="text-accent-light-beige text-lg font-semibold mb-4 border-b border-primary-green pb-2">
							Contact Us
						</h3>
						<ul className="space-y-3 text-sm text-primary-beige">
							{/* Address */}
							<li className="flex items-start group">
								<svg
									className="h-5 w-5 text-accent-subtle-gray group-hover:text-primary-green mr-3 mt-0.5 transition-colors duration-300"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
									/>
								</svg>
								<span className="group-hover:text-accent-light-beige transition-colors duration-300">
									<Link
										to="https://maps.app.goo.gl/42MgvJxT5Fn2eJAN7"
										target="_blank"
									>
										{storeInfo?.store_address ||
											"2105 Cliff Rd Suite 300, Eagan, MN, 55124"}
									</Link>
								</span>
							</li>

							{/* Phone */}
							<li className="flex items-start group">
								<svg
									className="h-5 w-5 text-accent-subtle-gray group-hover:text-primary-green mr-3 mt-0.5 transition-colors duration-300"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
									/>
								</svg>
								<a
									href={`tel:+1${(
										storeInfo?.store_phone || "6514125336"
									).replace(/\D/g, "")}`}
									className="group-hover:text-accent-light-beige transition-colors duration-300"
								>
									{storeInfo?.store_phone || "(651) 412-5336"}
								</a>
							</li>

							{/* Email */}
							<li className="flex items-start group">
								<svg
									className="h-5 w-5 text-accent-subtle-gray group-hover:text-primary-green mr-3 mt-0.5 transition-colors duration-300"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
									/>
								</svg>
								<a
									href={`mailto:${
										storeInfo?.store_email || "contact@bakeajeen.com"
									}`}
									className="group-hover:text-accent-light-beige transition-colors duration-300"
								>
									{storeInfo?.store_email || "contact@bakeajeen.com"}
								</a>
							</li>
						</ul>
					</div>

					{/* Opening Hours */}
					<div>
						<h3 className="text-accent-light-beige text-lg font-semibold mb-4 border-b border-primary-green pb-2">
							Opening Hours
						</h3>
						<div className="bg-accent-dark-brown rounded-lg p-4">
							<div className="text-sm">
								<BusinessHours mode="detailed" showStatus={true} />
							</div>
							<div className="mt-4 pt-3 border-t border-accent-subtle-gray/50">
								<Link
									to="/menu"
									className="text-accent-light-beige bg-accent-warm-brown hover:bg-opacity-80 transition-colors duration-300 text-sm font-medium rounded-md py-2 px-4 inline-block w-full text-center"
								>
									Order Online
								</Link>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="border-t border-primary-green/50">
				<div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center">
					<p className="text-sm text-primary-beige">
						&copy; {currentYear} Ajeen. All rights reserved.
					</p>
					<div className="mt-4 md:mt-0 flex flex-wrap justify-center gap-4 text-sm text-primary-beige">
						<span className="flex items-center">
							Made with{" "}
							<FaHeart
								className="text-red-500 mx-1"
								size={14}
							/>{" "}
							in Minnesota
						</span>
					</div>
				</div>
			</div>
		</footer>
	);
};

export default Footer;
