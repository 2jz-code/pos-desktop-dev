//eslint-disable-next-line
import { motion } from "framer-motion";
import { useLocation, Outlet } from "react-router-dom";

export function AnimatedOutlet() {
	const location = useLocation();

	return (
		<motion.div
			key={location.pathname}
			className="h-full"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.5 }} // Using a slightly faster duration
		>
			<Outlet />
		</motion.div>
	);
}
