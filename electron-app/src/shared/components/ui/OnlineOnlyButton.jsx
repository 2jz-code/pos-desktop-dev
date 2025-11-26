import { Button } from './button';
import { useOnlineStatus } from '@/shared/hooks';
import { toast } from './use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

/**
 * Button component that automatically disables when offline
 * Shows a tooltip and toast when clicked offline
 *
 * @example
 * <OnlineOnlyButton onClick={handleSave} disabledMessage="Saving requires online">
 *   Save Category
 * </OnlineOnlyButton>
 */
export function OnlineOnlyButton({
  children,
  onClick,
  disabledMessage = "This action requires internet connection",
  showTooltip = true,
  isOnlineOverride,
  ...props
}) {
  const hookOnline = useOnlineStatus();
  const isOnline = typeof isOnlineOverride === "boolean" ? isOnlineOverride : hookOnline;
  const isDisabled = !isOnline || !!props.disabled;

  const handleClick = (e) => {
    if (isDisabled) {
      toast({
        title: "Offline",
        description: disabledMessage,
        variant: "destructive",
      });
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick?.(e);
  };

  const button = (
    <Button
      {...props}
      onClick={handleClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      tabIndex={isDisabled ? -1 : props.tabIndex}
    >
      {children}
    </Button>
  );

  // Show tooltip when offline
  if (showTooltip && !isOnline) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent>
            <p>{disabledMessage}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
