import PropTypes from "prop-types";

/**
 * Professional page header component for consistent page titles and descriptions
 */
export function PageHeader({
	icon: IconComponent,
	title,
	description,
	actions,
	className = "",
}) {
	return (
		<div
			className={`border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ${className}`}
		>
			<div className="px-6 py-8">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						{IconComponent && (
							<div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
								<IconComponent className="h-6 w-6 text-slate-700 dark:text-slate-300" />
							</div>
						)}
						<div>
							<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
								{title}
							</h1>
							{description && (
								<p className="text-slate-600 dark:text-slate-400 mt-1">
									{description}
								</p>
							)}
						</div>
					</div>
					{actions && <div className="flex items-center gap-3">{actions}</div>}
				</div>
			</div>
		</div>
	);
}

PageHeader.propTypes = {
	icon: PropTypes.elementType,
	title: PropTypes.string.isRequired,
	description: PropTypes.string,
	actions: PropTypes.node,
	className: PropTypes.string,
};
